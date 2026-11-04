import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Preserve exact request bytes for PayMongo HMAC verification.
export const config = { api: { bodyParser: false } };
const reply = (res, status, obj) => res.status(status).json(obj);

async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function verifyTestSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !secret) return false;
  const fields = {};
  for (const field of signatureHeader.split(',')) {
    const split = field.indexOf('=');
    if (split < 0) continue;
    fields[field.slice(0, split).trim()] = field.slice(split + 1).trim();
  }
  const timestamp = fields.t;
  const providedHex = fields.te; // PayMongo: 'te' is TEST, 'li' is LIVE.
  if (!/^\d{10}$/.test(timestamp || '') || !/^[a-f0-9]{64}$/i.test(providedHex || '')) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), rawBody])).digest();
  const received = Buffer.from(providedHex, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return reply(res, 405, { error: 'POST required' });
  // This is deliberately a TEST and PREVIEW endpoint only.
  if (process.env.VERCEL_ENV !== 'preview' || process.env.PAYMONGO_TEST_CHECKOUT_ENABLED !== 'true') {
    return reply(res, 503, { error: 'Test webhook disabled' });
  }
  const secret = process.env.PAYMONGO_TEST_WEBHOOK_SECRET;
  if (!secret || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return reply(res, 503, { error: 'Test webhook not configured' });
  }

  let rawBody;
  try { rawBody = await readBody(req); }
  catch { return reply(res, 413, { error: 'Payload too large' }); }
  if (!verifyTestSignature(rawBody, req.headers['paymongo-signature'], secret)) {
    return reply(res, 401, { error: 'Invalid signature' });
  }

  let envelope;
  try { envelope = JSON.parse(rawBody.toString('utf8')); }
  catch { return reply(res, 400, { error: 'Invalid JSON' }); }

  // Current PayMongo webhook envelope is { event_type: 'send.webhook', data: { type, livemode, data } }.
  const event = envelope?.data;
  const type = event?.type ?? event?.attributes?.type;
  const livemode = event?.livemode ?? event?.attributes?.livemode;
  const resource = event?.data ?? event?.attributes?.data;
  if (typeof type !== 'string' || !type || livemode !== false || !resource || typeof resource !== 'object') {
    return reply(res, 400, { error: 'Unrecognized test event' });
  }
  // Some PayMongo webhook envelopes don't include a stable event ID. Hash the event
  // data as an idempotency fallback (exclude signature timestamp and HTTP headers).
  const providerEventId = typeof event.id === 'string' && event.id
    ? event.id
    : `sha256:${crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex')}`;
  const providerObjectId = typeof resource.id === 'string' ? resource.id : null;

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    // Inbox-only: does NOT mark an order paid, generate codes, or unlock albums.
    const { error } = await db.from('jb_billing_webhook_events').upsert({
      provider_environment: 'test', provider_event_id: providerEventId,
      event_type: type, provider_object_id: providerObjectId, processing_status: 'received',
    }, { onConflict: 'provider_environment,provider_event_id', ignoreDuplicates: true });
    if (error) {
      console.error('Webhook record failed:', error.message);
      return reply(res, 500, { error: 'Event could not be recorded; retry later' });
    }
    return reply(res, 200, { received: true });
  } catch (error) {
    console.error('Webhook unexpected failure:', error.message);
    return reply(res, 500, { error: 'Event could not be recorded; retry later' });
  }
}
