/**
 * JB Premium Hub — Phase 13K-36 (verification hardening)
 * PayMongo LIVE webhook verification + settlement worker
 * DISABLED BY DEFAULT; deploy with legacy JWT verification OFF.
 *
 * Critical prerequisites before any real activation:
 * - Review this implementation against actual LIVE PayMongo payloads.
 * - Run simulated tests and concurrent-worker tests.
 * - Install/verify a supervised recovery process for stranded `processing` rows.
 * - Configure independent LIVE credentials. Do not use TEST or publish keys.
 *
 * Secrets (never expose to frontend):
 * JB_LIVE_WEBHOOK_WORKER_ENABLED=false (must explicitly be 'true')
 * JB_LIVE_WORKER_CALL_TOKEN=<separate random 32+ byte secret>
 * PAYMONGO_LIVE_SECRET_KEY=sk_live_...
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Database safety locks must also be ON for intentional operation:
 * jb_billing_live_webhook_worker_control.processing_enabled
 * jb_billing_live_settlement_control.settlement_enabled
 * These are OFF for deployment and initial smoke tests.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const s = (x: unknown): string | null => typeof x === 'string' && x.length > 0 ? x : null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SID = /^cs_[A-Za-z0-9_-]{6,200}$/;
const PID = /^pay_[A-Za-z0-9_-]{6,200}$/;
const EID = /^evt_[A-Za-z0-9_-]{6,200}$/;
const MAX_MS = 15000;
const json = (status: number, obj: Obj): Response => new Response(JSON.stringify(obj), { status, headers: {
  'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',
}});
const encode = (text: string) => new TextEncoder().encode(text);
const safeEqual = (a: string, b: string) => {
  const x = encode(a), y = encode(b);
  let mismatch = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i=0;i<n;i++) mismatch |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return mismatch === 0;
};
class Failure extends Error {
  constructor(public code: string, public transient: boolean) { super(code); }
}
function requireValid(ok: boolean, code='PAYMENT_MISMATCH'): asserts ok {
  if (!ok) throw new Failure(code, false);
}
function dbResult<T>(data: T, error: {code?:string; message?:string}|null, label: string): T {
  if (error) { console.error(label, error.code ?? 'db_error'); throw new Failure('TRANSIENT_DB_ERROR', true); }
  return data;
}

/** Strict, independent PayMongo checkout verification. */
async function verifyPaymongo(sessionId: string, order: Obj, secret: string): Promise<{paymentId:string; amount:number}> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), MAX_MS);
  let reply: Response;
  try {
    reply = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(sessionId)}`, {
      method:'GET', headers:{Authorization:`Basic ${btoa(`${secret}:`)}`, Accept:'application/json'}, signal:abort.signal,
    });
  } catch (e) {
    throw new Failure(e instanceof Error && e.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE', true);
  } finally { clearTimeout(timeout); }
  if (reply.status === 429 || reply.status >= 500) throw new Failure('PROVIDER_UNAVAILABLE', true);
  if (!reply.ok) throw new Failure('PAYMENT_MISMATCH', false);
  let body: unknown;
  try { body = await reply.json(); } catch { throw new Failure('PROVIDER_UNAVAILABLE', true); }
  requireValid(isObj(body) && isObj(body.data), 'PAYMENT_MISMATCH');
  const data = (body as Obj).data as Obj;
  requireValid(data.type === 'checkout_session' && data.id === sessionId && isObj(data.attributes));
  const attr = data.attributes as Obj;
  // The LIVE provider response must identify the exact order and account.
  // A Checkout Session stays 'active' after successful payment; 'paid' is the Payment status.
  // Reject expired or unknown session status. Independently verify the single paid payment below.
  requireValid(attr.livemode === true && attr.status === 'active' &&
    attr.reference_number === order.id &&
    typeof order.user_id === 'string' && UUID.test(order.user_id));
  requireValid(isObj(attr.metadata) && attr.metadata.order_id === order.id &&
    attr.metadata.user_id === order.user_id &&
    attr.metadata.purpose === 'jb_membership_live_manual_checkout');

  const expected = order.plan_code === 'standard' ? 5000 :
    order.plan_code === 'vip' ? 15000 : null;
  requireValid(expected !== null && Number.isSafeInteger(order.amount_centavos) &&
    order.amount_centavos === expected && order.currency === 'PHP');

  // A single fixed-price monthly access purchase: no bundled or extra items.
  requireValid(Array.isArray(attr.line_items) && attr.line_items.length === 1);
  const line = attr.line_items[0];
  requireValid(isObj(line) && line.amount === expected &&
    line.currency === 'PHP' && line.quantity === 1);

  requireValid(Array.isArray(attr.payments));
  const paid = attr.payments.filter((p: unknown) =>
    isObj(p) && isObj(p.attributes) && p.attributes.status === 'paid');
  requireValid(paid.length === 1);
  const payment = paid[0] as Obj;
  requireValid(payment.type === undefined || payment.type === 'payment');
  requireValid(typeof payment.id === 'string' && PID.test(payment.id));
  const attrs = payment.attributes as Obj;
  requireValid(attrs.livemode === true && attrs.status === 'paid' &&
    Number.isSafeInteger(attrs.amount) && attrs.amount === expected &&
    attrs.currency === 'PHP');

  // Reject evidence of a disputed/refunded payment; send for manual review.
  requireValid(attrs.disputed !== true &&
    (!Array.isArray(attrs.refunds) || attrs.refunds.length === 0));
  return { paymentId: payment.id as string, amount: expected };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405,{error:'POST required'});
  // Gate BEFORE accessing authorization, database or PayMongo.
  if (Deno.env.get('JB_LIVE_WEBHOOK_WORKER_ENABLED') !== 'true')
    return json(503,{error:'LIVE webhook worker disabled'});
  const token = Deno.env.get('JB_LIVE_WORKER_CALL_TOKEN') ?? '';
  const presented = req.headers.get('authorization') ?? '';
  if (token.length < 32 || !safeEqual(presented,`Bearer ${token}`))
    return json(401,{error:'Unauthorized'});
  // No browser clients or arbitrary request bodies needed: single event per invocation.
  if (req.headers.get('origin')) return json(403,{error:'Browser invocation forbidden'});
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const liveKey = Deno.env.get('PAYMONGO_LIVE_SECRET_KEY') ?? '';
  if (!url || !serviceKey || !liveKey.startsWith('sk_live_')) return json(503,{error:'Worker not configured'});
  const db = createClient(url, serviceKey, {auth:{persistSession:false,autoRefreshToken:false}});
  // Fail closed if either database switch is OFF.
  const wc = await db.from('jb_billing_live_webhook_worker_control').select('processing_enabled').eq('singleton',true).single();
  const sc = await db.from('jb_billing_live_settlement_control').select('settlement_enabled').eq('singleton',true).single();
  if (wc.error || sc.error) return json(503,{error:'Worker control unavailable'});
  if (wc.data.processing_enabled !== true || sc.data.settlement_enabled !== true)
    return json(503,{error:'LIVE worker or settlement database lock disabled'});
  const claim = await db.rpc('jb_billing_claim_live_webhook_v1');
  if (claim.error) return json(503,{error:'Unable to claim webhook'});
  const c = claim.data;
  if (!isObj(c) || c.environment !== 'live') return json(503,{error:'Unexpected claim response'});
  if (c.status === 'empty') return json(200,{status:'empty',environment:'live'});
  if (c.status !== 'claimed' || !s(c.queue_id) || !UUID.test(c.queue_id as string) ||
      !s(c.claim_token) || !UUID.test(c.claim_token as string) ||
      !s(c.webhook_event_id) || !UUID.test(c.webhook_event_id as string))
    return json(503,{error:'Invalid claimed webhook state'});
  const queueId = c.queue_id as string, claimToken = c.claim_token as string;
  let failure: Failure | null = null;
  try {
    const evq = await db.from('jb_billing_webhook_events')
      .select('id,provider_event_id,provider_object_id,event_type,provider_environment,processing_status')
      .eq('id',c.webhook_event_id).single();
    const event = dbResult(evq.data,evq.error,'event lookup');
    requireValid(isObj(event) && event.provider_environment === 'live' &&
      event.processing_status === 'received' && event.event_type === 'checkout_session.payment.paid' &&
      typeof event.provider_event_id === 'string' && EID.test(event.provider_event_id) &&
      typeof event.provider_object_id === 'string' && SID.test(event.provider_object_id));
    const sessionId = event.provider_object_id as string;
    const oq = await db.from('jb_billing_orders')
      .select('id,user_id,plan_code,billing_mode,provider_environment,amount_centavos,currency,status,subscription_id,paymongo_checkout_session_id,paymongo_payment_id')
      .eq('provider_environment','live').eq('paymongo_checkout_session_id',sessionId).single();
    const order = dbResult(oq.data,oq.error,'order lookup');
    requireValid(isObj(order) && UUID.test(s(order.id) ?? '') &&
      order.provider_environment === 'live' && order.billing_mode === 'manual_checkout' &&
      (order.status === 'pending' || order.status === 'paid') && order.paymongo_checkout_session_id === sessionId);
    // Fresh independent LIVE API verification on EVERY invocation including an already-paid order.
    const verified = await verifyPaymongo(sessionId, order, liveKey);
    if (order.status === 'paid') requireValid(order.paymongo_payment_id === verified.paymentId);
    const requestKey = `live-webhook:${event.provider_event_id}`;
    const evidence = {
      request_key:requestKey, provider_environment:'live',order_id:order.id,
      provider_event_id:event.provider_event_id,provider_checkout_session_id:sessionId,
      provider_payment_id:verified.paymentId,expected_amount_centavos:order.amount_centavos,
      verified_amount_centavos:verified.amount,currency:'PHP',
      verification_status:'verified',verification_reason:'paymongo_paid_payment_verified',
      verified_at:new Date().toISOString(),
    };
    // Create-once verification; never overwrite a previously recorded event's evidence.
    const readAudit = async () => db.from('jb_billing_live_payment_verification_audit')
      .select('*').eq('request_key',requestKey).maybeSingle();
    let a = await readAudit();
    if (a.error) throw new Failure('TRANSIENT_DB_ERROR',true);
    if (!a.data) {
      const inserted = await db.from('jb_billing_live_payment_verification_audit')
        .insert(evidence).select('*').single();
      if (!inserted.error) a = {data:inserted.data,error:null} as typeof a;
      else {
        // A concurrent identical verification may have won the unique request key.
        a = await readAudit();
        if (a.error) throw new Failure('TRANSIENT_DB_ERROR',true);
        if (!a.data) throw new Failure('TRANSIENT_DB_ERROR',true);
      }
    }
    const audit = a.data as Obj;
    requireValid(audit.provider_environment === 'live' && audit.request_key === requestKey &&
      audit.provider_event_id === event.provider_event_id && audit.order_id === order.id &&
      audit.provider_checkout_session_id === sessionId && audit.provider_payment_id === verified.paymentId &&
      audit.expected_amount_centavos === order.amount_centavos &&
      audit.verified_amount_centavos === verified.amount && audit.currency === 'PHP' &&
      audit.verification_status === 'verified' &&
      audit.verification_reason === 'paymongo_paid_payment_verified' &&
      !!s(audit.verified_at));
    const auditId = s(audit.id);
    requireValid(!!auditId && UUID.test(auditId));
    // NOTE: These are SEPARATE database transactions, not an atomic multi-RPC unit.
    // A crash between settle and completion needs supervised recovery of stuck claims.
    const settlement = await db.rpc('jb_billing_settle_verified_live_v1',{p_audit_id:auditId});
    if (settlement.error) { console.error('settlement RPC error',settlement.error.code); throw new Failure('TRANSIENT_DB_ERROR',true); }
    const settled = settlement.data;
    requireValid(isObj(settled) && settled.environment === 'live' &&
      (settled.status === 'settled' || settled.status === 'already_settled') &&
      settled.order_id === order.id && !!s(settled.subscription_id));
    const completion = await db.rpc('jb_billing_complete_live_webhook_v1', {
      p_queue_id:queueId,p_claim_token:claimToken,p_audit_id:auditId,
    });
    if (completion.error) { console.error('completion RPC error',completion.error.code); throw new Failure('TRANSIENT_DB_ERROR',true); }
    const completed = completion.data;
    requireValid(isObj(completed) && completed.status === 'completed' && completed.environment === 'live' &&
      completed.order_id === order.id && completed.audit_id === auditId);
    return json(200,{status:'completed',environment:'live',order_id:order.id,
      settlement_status:settled.status,membership_verified:true});
  } catch (e) {
    failure = e instanceof Failure ? e : new Failure('TRANSIENT_DB_ERROR',true);
    if (!(e instanceof Failure)) console.error('unexpected processing exception');
  }
  // Claim-token-controlled failure path. Never log tokens or customer details.
  const errorCode = failure!.code;
  const outcome = failure!.transient ? 'retry' : 'review_required';
  const finalized = await db.rpc('jb_billing_finalize_live_webhook_failure_v1',{
    p_queue_id:queueId,p_claim_token:claimToken,p_outcome:outcome,p_error_code:errorCode,
  });
  if (finalized.error) {
    // Stuck 'processing' requires explicit recovery. Do not attempt a second settlement here.
    console.error('failure finalization error',finalized.error.code);
    return json(503,{status:'recovery_required',environment:'live'});
  }
  const state = isObj(finalized.data) ? finalized.data.status : null;
  return json(200,{status:state === 'pending' ? 'retry_scheduled' : 'review_required',environment:'live'});
});
