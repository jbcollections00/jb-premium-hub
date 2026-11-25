/**
 * JB Premium Hub — Phase 123J-19D
 * Edge Function: jb-paymongo-settle-live
 *
 * ADMIN-ONLY, LIVE-ONLY settlement orchestration.
 * Fail-closed: must explicitly enable JB_LIVE_SETTLEMENT_ORCHESTRATOR_ENABLED=true
 * AND database jb_billing_live_settlement_control.settlement_enabled=true.
 * Independently re-GETs PayMongo LIVE checkout before EACH settlement request.
 * Validates paid session/payment, order ownership, exact plan/price/currency,
 * records immutable matching verified audit (or confirms existing), then invokes
 * atomic service-role-only jb_billing_settle_verified_live_v1.
 * No UI/PayMongo webhook registration needed for disabled-mode test.
 * This is NOT production-ready until verified with actual LIVE provider response,
 * negative authorization tests, refunds, outages, and recovery procedures.
 * Required secrets only for active mode: SUPABASE_URL, SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, PAYMONGO_LIVE_SECRET_KEY (sk_live_...).
 * Optional CORS for production HTTPS domain: JB_BILLING_LIVE_SITE_ORIGIN.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

type Obj = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION = /^cs_[A-Za-z0-9_-]{6,200}$/;
const PAYMENT = /^pay_[A-Za-z0-9_-]{6,200}$/;
const PRICES: Record<string, number> = { standard: 5000, vip: 15000 };
const MAX_BODY_BYTES = 2048;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

function configuredOrigin(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port ||
        u.pathname !== '/' || u.search || u.hash || u.hostname === 'localhost' ||
        u.hostname.endsWith('.vercel.app')) return null;
    return u.origin;
  } catch { return null; }
}

function json(status: number, body: Obj, corsOrigin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'vary': 'Origin',
      ...(corsOrigin ? { 'access-control-allow-origin': corsOrigin } : {}),
    },
  });
}

function auditMatches(row: Obj, orderId: string, sessionId: string, paymentId: string, amount: number): boolean {
  return row.order_id === orderId && row.provider_environment === 'live' &&
    row.verification_status === 'verified' &&
    row.verification_reason === 'paymongo_paid_payment_verified' &&
    row.provider_checkout_session_id === sessionId &&
    row.provider_payment_id === paymentId &&
    row.expected_amount_centavos === amount &&
    row.verified_amount_centavos === amount && row.currency === 'PHP' &&
    typeof row.verified_at === 'string';
}

function verifyPaidCheckout(resource: unknown, order: Obj): { paymentId: string; amount: number } | null {
  if (!isObj(resource) || resource.type !== 'checkout_session' ||
      resource.id !== order.paymongo_checkout_session_id || !isObj(resource.attributes)) return null;
  const a = resource.attributes;
  // PayMongo Checkout Session status is 'active' or 'expired'.
  // A successful paid Payment can belong to an active Checkout Session.
  // Payment status is independently required to be 'paid' below.
  if (a.livemode !== true || a.status !== 'active' || a.reference_number !== order.id ||
      !isObj(a.metadata) || a.metadata.order_id !== order.id ||
      a.metadata.user_id !== order.user_id ||
      a.metadata.purpose !== 'jb_membership_live_manual_checkout') return null;

  const expected = PRICES[String(order.plan_code)];
  if (!expected || order.amount_centavos !== expected || order.currency !== 'PHP' ||
      !Array.isArray(a.line_items) || a.line_items.length !== 1 ||
      !isObj(a.line_items[0]) || a.line_items[0].currency !== 'PHP' ||
      a.line_items[0].amount !== expected || a.line_items[0].quantity !== 1) return null;

  if (!Array.isArray(a.payments)) return null;
  const paid = a.payments.filter((p: unknown) => isObj(p) && isObj(p.attributes) && p.attributes.status === 'paid');
  if (paid.length !== 1 || !isObj(paid[0]) || typeof paid[0].id !== 'string' ||
      !PAYMENT.test(paid[0].id) || !isObj(paid[0].attributes)) return null;
  const payment = paid[0].attributes;
  if (payment.livemode !== true || payment.currency !== 'PHP' || payment.amount !== expected ||
      !Number.isSafeInteger(payment.amount)) return null;
  // Refunded/disputed evidence requires human review; never generate a fresh verified audit from it.
  if (payment.disputed === true || (Array.isArray(payment.refunds) && payment.refunds.length > 0)) return null;
  return { paymentId: paid[0].id, amount: expected };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const allowed = configuredOrigin(Deno.env.get('JB_BILLING_LIVE_SITE_ORIGIN') || '');
  const caller = req.headers.get('origin');
  const cors = caller && allowed && caller === allowed ? allowed : null;
  const send = (status: number, body: Obj) => json(status, body, cors);

  if (req.method === 'OPTIONS') {
    if (!cors) return send(403, { error: 'Origin not allowed' });
    return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': cors,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, apikey, content-type',
      'access-control-max-age': '300',
      'vary': 'Origin',
    }});
  }
  if (req.method !== 'POST') return send(405, { error: 'POST required' });
  if (caller && !cors) return send(403, { error: 'Origin not allowed' });
  // Disabled BEFORE service-role/PayMongo access. No operations while disabled.
  if (Deno.env.get('JB_LIVE_SETTLEMENT_ORCHESTRATOR_ENABLED') !== 'true')
    return send(503, { error: 'LIVE settlement orchestration disabled' });

  const url = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const secret = Deno.env.get('PAYMONGO_LIVE_SECRET_KEY') || '';
  if (!url.startsWith('https://') || !anon || !service || !secret.startsWith('sk_live_'))
    return send(503, { error: 'LIVE settlement configuration incomplete' });

  const tokenMatch = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '');
  if (!tokenMatch || tokenMatch[1].startsWith('sb_')) return send(401, { error: 'User JWT required' });
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') || ''))
    return send(415, { error: 'JSON required' });
  const length = req.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES))
    return send(413, { error: 'Request too large' });

  let payload: unknown;
  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > MAX_BODY_BYTES) return send(413, { error: 'Request too large' });
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return send(400, { error: 'Invalid JSON request' }); }
  if (!isObj(payload) || Object.keys(payload).length !== 1 ||
      typeof payload.order_id !== 'string' || !UUID.test(payload.order_id))
    return send(400, { error: 'order_id is required' });
  const orderId = payload.order_id;

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${tokenMatch[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser(tokenMatch[1]);
  if (authError || !auth.user) return send(401, { error: 'Invalid user session' });
  const { data: adminAllowed, error: adminError } = await userClient.rpc('is_current_user_admin');
  if (adminError || adminAllowed !== true) return send(403, { error: 'Admin only' });

  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  // Second independent fail-closed gate in the DATABASE (service_role SELECT-only).
  const { data: gate, error: gateError } = await db.from('jb_billing_live_settlement_control')
    .select('settlement_enabled').eq('singleton', true).maybeSingle();
  if (gateError || gate?.settlement_enabled !== true)
    return send(503, { error: 'LIVE settlement disabled by database lock' });
  const { data: order, error: orderError } = await db.from('jb_billing_orders')
    .select('id,user_id,plan_code,billing_mode,provider_environment,amount_centavos,currency,status,paymongo_checkout_session_id,paymongo_payment_id,subscription_id')
    .eq('id', orderId).eq('provider_environment', 'live').maybeSingle();
  if (orderError) return send(500, { error: 'LIVE order lookup failed' });
  if (!order || order.billing_mode !== 'manual_checkout' ||
      !['pending', 'paid'].includes(order.status) ||
      typeof order.paymongo_checkout_session_id !== 'string' ||
      !SESSION.test(order.paymongo_checkout_session_id)) return send(404, { error: 'Eligible LIVE order not found' });
  const expectedPrice = PRICES[order.plan_code];
  if (!expectedPrice || expectedPrice !== order.amount_centavos || order.currency !== 'PHP')
    return send(409, { error: 'LIVE order price mismatch' });

  let resource: unknown;
  try {
    const r = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(order.paymongo_checkout_session_id)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(12000),
      headers: { authorization: `Basic ${btoa(secret + ':')}`, accept: 'application/json' },
    });
    if (!r.ok) return send(502, { error: 'PayMongo LIVE verification unavailable' });
    const body = await r.json();
    resource = body?.data;
  } catch { return send(502, { error: 'PayMongo LIVE verification unavailable' }); }

  const verified = verifyPaidCheckout(resource, order);
  if (!verified) return send(409, {
    status: 'not_verified', reason: 'paymongo_paid_payment_not_confirmed',
    membership_activated: false, billing_order_modified: false,
  });
  if (order.status === 'paid' && order.paymongo_payment_id !== verified.paymentId)
    return send(409, { error: 'Existing paid order payment mismatch' });

  const requestKey = `live_checkout_paid:${orderId}:${verified.paymentId}`;
  const fields = 'id,request_key,order_id,provider_environment,provider_checkout_session_id,provider_payment_id,expected_amount_centavos,verified_amount_centavos,currency,verification_status,verification_reason,verified_at';
  const { data: prior, error: priorError } = await db.from('jb_billing_live_payment_verification_audit')
    .select(fields).eq('request_key', requestKey).maybeSingle();
  if (priorError) return send(500, { error: 'Audit lookup failed' });
  if (prior && !auditMatches(prior, orderId, order.paymongo_checkout_session_id, verified.paymentId, expectedPrice))
    return send(409, { error: 'Existing verification audit mismatch' });

  let auditId: string;
  if (prior) {
    auditId = prior.id;
  } else {
    const { data: saved, error: saveError } = await db.from('jb_billing_live_payment_verification_audit')
      .insert({
        request_key: requestKey, order_id: orderId, provider_environment: 'live',
        provider_checkout_session_id: order.paymongo_checkout_session_id,
        provider_payment_id: verified.paymentId,
        expected_amount_centavos: expectedPrice, verified_amount_centavos: verified.amount,
        currency: 'PHP', verification_status: 'verified',
        verification_reason: 'paymongo_paid_payment_verified',
        verified_at: new Date().toISOString(),
      }).select(fields).single();
    if (saveError || !saved) {
      // Concurrent identical verifications may race on unique request_key.
      const { data: retry, error: retryError } = await db.from('jb_billing_live_payment_verification_audit')
        .select(fields).eq('request_key', requestKey).maybeSingle();
      if (retryError || !retry || !auditMatches(retry, orderId, order.paymongo_checkout_session_id, verified.paymentId, expectedPrice))
        return send(409, { error: 'LIVE payment audit conflict or unavailable' });
      auditId = retry.id;
    } else {
      auditId = saved.id;
    }
  }

  // IMPORTANT: only AFTER a FRESH independent provider GET has succeeded,
  // and audit evidence has been matched/created, invoke the atomic RPC.
  // The RPC independently checks the database safety lock again and validates
  // order/audit consistency under row locks in one transaction.
  const { data: settled, error: settleError } = await db.rpc('jb_billing_settle_verified_live_v1', {
    p_audit_id: auditId,
  });
  if (settleError) {
    console.error('LIVE settlement RPC rejected:', settleError.code || 'unknown');
    return send(409, {
      error: 'LIVE settlement rejected or unavailable; manual review required',
      order_id: orderId, membership_activated_live: false,
    });
  }
  if (!isObj(settled) || !['settled', 'already_settled'].includes(String(settled.status)) ||
      settled.environment !== 'live' || settled.order_id !== orderId ||
      typeof settled.subscription_id !== 'string' || !UUID.test(settled.subscription_id)) {
    console.error('LIVE settlement RPC returned unexpected result');
    return send(500, { error: 'Settlement result requires manual review', order_id: orderId });
  }

  // Successful database commit confirmed by RPC response. 'already_settled'
  // represents a valid idempotent result, not a second membership grant.
  return send(200, {
    status: 'verified', verification_reason: 'paymongo_paid_payment_verified',
    environment: 'live', order_id: orderId,
    settlement_status: settled.status,
    subscription_id: settled.subscription_id,
    audit_id: auditId,
    membership_activated_live: true,
    billing_order_modified: settled.status === 'settled',
  });
});
