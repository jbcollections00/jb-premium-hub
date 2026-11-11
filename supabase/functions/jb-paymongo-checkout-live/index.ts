/**
 * JB Premium Hub — Phase 123J-14
 * Supabase Edge Function: jb-paymongo-checkout-live
 *
 * DISABLED BY DEFAULT. Deployment alone cannot create a LIVE payment.
 * Required server secrets when deliberately enabled:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   PAYMONGO_LIVE_SECRET_KEY (sk_live_...)
 *   JB_BILLING_LIVE_SITE_ORIGIN (exact production HTTPS origin)
 *
 * Requires pre-installed RPCs:
 *   jb_billing_create_live_order_v1
 *   jb_billing_claim_live_checkout_v1
 *   jb_billing_link_live_checkout_v1
 *
 * This creates checkout sessions; it NEVER marks payments paid,
 * settles an order, or activates membership. Do not connect the frontend
 * until webhook verification, recovery operations, and the LIVE rollout
 * procedures have passed review.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

type Dict = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION = /^cs_[A-Za-z0-9_-]{6,200}$/;
const PRICES: Record<string, number> = { standard: 5000, vip: 15000 };
const MAX_BODY = 2048;
const isObject = (v: unknown): v is Dict => v !== null && typeof v === 'object' && !Array.isArray(v);

function exactOrigin(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash || u.port) return null;
    if (u.hostname === 'localhost' || u.hostname.endsWith('.vercel.app')) return null;
    return u.origin;
  } catch { return null; }
}
function checkoutUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.hostname !== 'checkout.paymongo.com' || u.username || u.password || u.port) return null;
    return u.href;
  } catch { return null; }
}
function response(status: number, body: Dict, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'vary': 'Origin',
      ...(origin ? { 'access-control-allow-origin': origin } : {}),
    },
  });
}
function errorText(e: unknown): string { return e instanceof Error ? e.message : 'unknown'; }

function validateProviderSession(data: unknown, orderId: string, amount: number, userId: string): string | null {
  if (!isObject(data) || data.type !== 'checkout_session' ||
      typeof data.id !== 'string' || !SESSION.test(data.id) || !isObject(data.attributes)) return null;
  const a = data.attributes;
  if (a.livemode !== true || a.reference_number !== orderId || !isObject(a.metadata) ||
      a.metadata.order_id !== orderId || a.metadata.user_id !== userId ||
      a.metadata.purpose !== 'jb_membership_live_manual_checkout') return null;
  if (!Array.isArray(a.line_items) || a.line_items.length !== 1 || !isObject(a.line_items[0]) ||
      a.line_items[0].amount !== amount || a.line_items[0].currency !== 'PHP' ||
      a.line_items[0].quantity !== 1) return null;
  if (!Array.isArray(a.payment_method_types) || !a.payment_method_types.includes('qrph')) return null;
  return checkoutUrl(a.checkout_url);
}

Deno.serve(async (req: Request): Promise<Response> => {
  const configuredOrigin = exactOrigin(Deno.env.get('JB_BILLING_LIVE_SITE_ORIGIN') || '');
  const callerOrigin = req.headers.get('origin');
  const corsOrigin = configuredOrigin && callerOrigin === configuredOrigin ? configuredOrigin : null;
  const send = (status: number, body: Dict) => response(status, body, corsOrigin);

  if (req.method === 'OPTIONS') {
    if (!corsOrigin) return send(403, { error: 'Origin not allowed' });
    return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': corsOrigin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, apikey, content-type',
      'access-control-max-age': '300',
      'vary': 'Origin',
    } });
  }
  if (req.method !== 'POST') return send(405, { error: 'POST required' });
  // A browser must come from the explicitly configured production origin.
  if (!corsOrigin) return send(403, { error: 'Origin not allowed' });
  // Database lock is checked again by the order creation RPC.
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !anon || !service) return send(503, { error: 'Server configuration incomplete' });

  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '');
  if (!bearer || bearer[1].startsWith('sb_')) return send(401, { error: 'User login required' });
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type') || ''))
    return send(415, { error: 'JSON required' });
  const declaredLength = req.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY))
    return send(413, { error: 'Request too large' });
  let payload: unknown;
  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > MAX_BODY) return send(413, { error: 'Request too large' });
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return send(400, { error: 'Invalid JSON request' }); }
  if (!isObject(payload) || Object.keys(payload).length !== 2 ||
      typeof payload.plan_code !== 'string' || !(payload.plan_code in PRICES) ||
      typeof payload.request_id !== 'string' || !UUID.test(payload.request_id))
    return send(400, { error: 'plan_code and request_id are required' });
  const planCode = payload.plan_code;
  const requestId = payload.request_id;

  const authClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(bearer[1]);
  if (authError || !userData.user) return send(401, { error: 'Invalid user session' });
  const userId = userData.user.id;

  const db = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Must be disabled before any order mutation or PayMongo POST.
  const { data: flag, error: flagError } = await db.from('jb_billing_live_checkout_control')
    .select('checkout_enabled').eq('singleton', true).maybeSingle();
  if (flagError || flag?.checkout_enabled !== true) return send(503, { error: 'LIVE checkout disabled' });
  const key = Deno.env.get('PAYMONGO_LIVE_SECRET_KEY') || '';
  if (!key.startsWith('sk_live_')) return send(503, { error: 'LIVE PayMongo credentials not configured' });
  const pmHeaders = { authorization: `Basic ${btoa(key + ':')}`, accept: 'application/json' };

  // Reuse an idempotent request if previously created. No new order on retries.
  const { data: created, error: createError } = await db.rpc('jb_billing_create_live_order_v1', {
    p_user_id: userId, p_plan_code: planCode, p_request_id: requestId,
  });
  if (createError || !isObject(created) || typeof created.order_id !== 'string') {
    console.error('LIVE order RPC rejected:', createError?.code || 'invalid_result');
    return send(409, { error: 'LIVE order creation unavailable or limited' });
  }
  const orderId = created.order_id;
  const { data: order, error: orderError } = await db.from('jb_billing_orders')
    .select('id,user_id,plan_code,amount_centavos,currency,status,provider_environment,paymongo_checkout_session_id,checkout_url')
    .eq('id', orderId).eq('user_id', userId).eq('provider_environment', 'live').maybeSingle();
  if (orderError || !order || order.plan_code !== planCode || order.amount_centavos !== PRICES[planCode] ||
      order.currency !== 'PHP') return send(409, { error: 'LIVE order mismatch' });
  if (order.status !== 'pending') return send(409, { error: 'Existing order no longer pending' });

  async function retrieveSession(id: string): Promise<{ url: string; id: string } | null> {
    if (!SESSION.test(id)) return null;
    const r = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(id)}`,
      { method: 'GET', headers: pmHeaders, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const body = await r.json().catch(() => null);
    const verified = validateProviderSession(body?.data, orderId, PRICES[planCode], userId);
    return verified && body.data.id === id ? { url: verified, id } : null;
  }

  // Reuse linked session only after provider verification. Never create another.
  if (order.paymongo_checkout_session_id) {
    try {
      const existing = await retrieveSession(order.paymongo_checkout_session_id);
      if (existing && checkoutUrl(order.checkout_url) === existing.url)
        return send(200, { status: 'existing', environment: 'live', order_id: orderId, checkout_url: existing.url });
    } catch (e) { console.error('LIVE session reuse verification error:', errorText(e)); }
    return send(409, { error: 'Existing checkout requires manual review; do not retry payment' });
  }

  // claim returns 'not_claimed' on retries, including uncertain provider requests.
  const { data: claim, error: claimError } = await db.rpc('jb_billing_claim_live_checkout_v1', {
    p_order_id: orderId,
  });
  if (claimError || !isObject(claim) || claim.status !== 'claimed' ||
      typeof claim.claim_token !== 'string' || !UUID.test(claim.claim_token))
    return send(409, { error: 'Existing checkout attempt requires manual review; no new session created' });

  // AFTER this point, all network failures require manual recovery; do not re-POST.
  try {
    const createResponse = await fetch('https://api.paymongo.com/v2/checkout_sessions', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { ...pmHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ data: { attributes: {
        line_items: [{ name: `JB Premium Hub ${planCode === 'vip' ? 'VIP' : 'Standard'} — one month`,
          amount: PRICES[planCode], currency: 'PHP', quantity: 1 }],
        payment_method_types: ['qrph'],
        success_url: `${configuredOrigin}/subscribe?checkout=returned`,
        cancel_url: `${configuredOrigin}/subscribe?checkout=cancelled`,
        reference_number: orderId,
        metadata: { order_id: orderId, user_id: userId, purpose: 'jb_membership_live_manual_checkout' },
        description: 'One-time membership purchase; access granted only after verified payment.',
      } } }),
    });
    const createdSession = await createResponse.json().catch(() => null);
    const sessionId = createdSession?.data?.id;
    if (!createResponse.ok || typeof sessionId !== 'string' || !SESSION.test(sessionId)) {
      console.error('LIVE PayMongo creation unresolved:', createResponse.status);
      return send(502, { error: 'Checkout creation unresolved; contact support before retrying', order_id: orderId });
    }
    // PayMongo CREATE may omit metadata: independently GET the created session.
    const verified = await retrieveSession(sessionId);
    if (!verified) return send(502, { error: 'Checkout session unverified; do not pay or retry', order_id: orderId });
    const { data: linked, error: linkError } = await db.rpc('jb_billing_link_live_checkout_v1', {
      p_order_id: orderId, p_claim_token: claim.claim_token,
      p_checkout_session_id: verified.id, p_checkout_url: verified.url,
    });
    if (linkError || !isObject(linked) || linked.status !== 'linked') {
      console.error('LIVE session link unresolved:', linkError?.code || 'invalid_result');
      return send(502, { error: 'Checkout session association needs manual review; do not pay', order_id: orderId });
    }
    return send(200, { status: 'created', environment: 'live', order_id: orderId, checkout_url: verified.url });
  } catch (e) {
    console.error('LIVE checkout creation unresolved:', errorText(e));
    return send(502, { error: 'Checkout attempt unresolved; contact support before retrying', order_id: orderId });
  }
});
