/**
 * JB PREMIUM HUB — Phase 315
 * Authenticated FREE-to-WATCH ticket issuer for the ALREADY-DEPLOYED private
 * Worker: jb-premium-private-media-v1.jbnetproxy.workers.dev.
 *
 * The existing paid issuer jb-private-media-ticket is not modified.
 * There is ONE video streaming gateway and ONE R2 bucket binding.
 *
 * OFF BY DEFAULT: requires BOTH:
 *   JB_FREE_PREVIEW_TICKETS_ENABLED=true
 *   JB_FREE_PREVIEW_PRIVATE_CDN_CONFIRMED=true
 *
 * The second flag must only be enabled AFTER direct anonymous CDN/R2 GET is
 * blocked and Standard/VIP protected playback has been verified.
 *
 * Required server-only secrets (no VITE_ prefix):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   JB_PRIVATE_MEDIA_HMAC_SECRET (same as deployed Worker; length >=48).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const WORKER_ORIGIN = 'https://jb-premium-private-media-v1.jbnetproxy.workers.dev';
const MEDIA_ORIGIN = 'https://cdn.jb-premium-hub.vip';
const ALLOWED_ORIGINS = new Set([
  'https://www.jb-premium-hub.vip',
  'https://jb-premium-hub.vip',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$/i;
// The Worker accepts tickets with a lifetime up to 1800s.
const PLAY_TTL_SECONDS = 900;
const MAX_BODY_BYTES = 1024;
const encoder = new TextEncoder();

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  const extra = Deno.env.get('JB_FREE_PREVIEW_STAGING_ORIGIN') || '';
  if (origin && (ALLOWED_ORIGINS.has(origin) || (extra && origin === extra))) {
    return origin;
  }
  return null;
}

function headers(origin: string | null): Headers {
  const h = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'vary': 'Origin',
  });
  if (origin) {
    h.set('access-control-allow-origin', origin);
    h.set('access-control-allow-methods', 'POST, OPTIONS');
    h.set('access-control-allow-headers',
      'authorization, apikey, content-type, x-client-info, x-retry-count, traceparent, tracestate, baggage');
  }
  return h;
}

function respond(status: number, body: Record<string, unknown>, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function base64url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Matches deployed Worker verifyTicket(): HMAC-SHA256 over the ASCII
// base64url-encoded JSON body, NOT the raw JSON itself.
async function signTicket(
  secret: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return body + '.' + base64url(signature);
}

function privateKeyFromMediaUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return null; }
  if (parsed.origin !== MEDIA_ORIGIN || parsed.protocol !== 'https:' ||
      parsed.username || parsed.password || parsed.search || parsed.hash) return null;

  let path: string;
  try { path = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')); } catch { return null; }
  const isRoot = /^[A-Za-z0-9_-]+\.mp4$/i.test(path);
  const isFolder = /^videos\/[A-Za-z0-9._/-]+\.mp4$/i.test(path) &&
    !path.split('/').some((piece) => !piece || piece === '.' || piece === '..');
  return isRoot || isFolder ? path : null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = allowedOrigin(request);
  if (request.method === 'OPTIONS') {
    return origin
      ? new Response(null, { status: 204, headers: headers(origin) })
      : respond(403, { error: 'Origin not allowed' }, null);
  }
  if (request.headers.has('origin') && !origin) {
    return respond(403, { error: 'Origin not allowed' }, null);
  }
  if (request.method !== 'POST') {
    return respond(405, { error: 'POST required' }, origin);
  }

  // Both server-side switches are mandatory; deployment alone is harmless.
  if (Deno.env.get('JB_FREE_PREVIEW_TICKETS_ENABLED') !== 'true' ||
      Deno.env.get('JB_FREE_PREVIEW_PRIVATE_CDN_CONFIRMED') !== 'true') {
    return respond(503, { error: 'Free previews are not enabled' }, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const signingSecret = Deno.env.get('JB_PRIVATE_MEDIA_HMAC_SECRET') || '';
  if (!supabaseUrl || !serviceKey || signingSecret.length < 48) {
    return respond(503, { error: 'Private media authorization not configured' }, origin);
  }

  const bearer = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get('authorization') || '');
  if (!bearer) return respond(401, { error: 'Authentication required' }, origin);
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return respond(413, { error: 'Body too large' }, origin);

  let parsed: unknown;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return respond(413, { error: 'Body too large' }, origin);
    parsed = JSON.parse(body);
  } catch {
    return respond(400, { error: 'Invalid request' }, origin);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return respond(400, { error: 'Invalid request' }, origin);
  }
  const data = parsed as Record<string, unknown>;
  const mediaId = data.media_id;
  if (typeof mediaId !== 'string' || !UUID.test(mediaId) || data.action !== 'play') {
    return respond(400, { error: 'Only video playback is supported' }, origin);
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await admin.auth.getUser(bearer[1]);
    if (userError || !userData.user?.id || !UUID.test(userData.user.id)) {
      return respond(401, { error: 'Invalid session' }, origin);
    }

    // Re-read the database flag on EVERY issuance. Browser input is never
    // authoritative. No paid subscription or download rights are granted.
    const { data: video, error: videoError } = await admin
      .from('media')
      .select('id,type,is_free_preview,media_url')
      .eq('id', mediaId)
      .maybeSingle();
    if (videoError || !video || video.type !== 'video' || video.is_free_preview !== true) {
      return respond(403, { error: 'This video requires a membership' }, origin);
    }

    const key = privateKeyFromMediaUrl(video.media_url);
    if (!key) return respond(503, { error: 'Private video key unavailable' }, origin);

    const now = Math.floor(Date.now() / 1000);
    const ticket = await signTicket(signingSecret, {
      v: 1,
      aud: 'jb-premium-private-media',
      mid: mediaId,
      act: 'play',
      sub: userData.user.id,
      iat: now,
      exp: now + PLAY_TTL_SECONDS,
      key,
    });
    const path = '/v/' + mediaId + '/play';
    const url = WORKER_ORIGIN + path + '?ticket=' + encodeURIComponent(ticket);
    // Ticket URLs are sensitive. Never log the URL, ticket, keys, or JWT.
    return respond(200, { status: 'issued', url, expires_in: PLAY_TTL_SECONDS }, origin);
  } catch (error) {
    console.error('Free preview ticket failed:', error instanceof Error ? error.name : 'UNKNOWN');
    return respond(503, { error: 'Unable to authorize private playback' }, origin);
  }
});
