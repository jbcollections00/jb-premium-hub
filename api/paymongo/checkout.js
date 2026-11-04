import { createClient } from '@supabase/supabase-js';

// Preview TEST checkout only. The Supabase Edge Function links verified sessions.
const PRICES = Object.freeze({ standard: 5000, vip: 15000 });
const reply = (res, status, obj) => res.status(status).json(obj);
export const config = { api: { bodyParser: { sizeLimit: '2kb' } } };

function configuration() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.PAYMONGO_TEST_CHECKOUT_ENABLED !== 'true') return null;
  const key = process.env.PAYMONGO_SECRET_KEY;
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const rawOrigin = process.env.SITE_ORIGIN;
  if (!key?.startsWith('sk_test_') || !url || !anon || !rawOrigin) return null;
  try {
    const origin = new URL(rawOrigin);
    const db = new URL(url);
    if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash ||
        origin.username || origin.password || !origin.hostname.endsWith('.vercel.app') ||
        db.protocol !== 'https:' || !db.hostname.endsWith('.supabase.co')) return null;
    return { key, supabaseUrl: db.origin, anon, origin: origin.origin };
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return reply(res, 405, { error: 'POST required' });
  const cfg = configuration();
  if (!cfg) return reply(res, 503, { error: 'Preview TEST checkout configuration incomplete' });
  const bearer = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
  if (!bearer) return reply(res, 401, { error: 'Please sign in' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 || !Object.hasOwn(PRICES, req.body.plan_code)) {
    return reply(res, 400, { error: 'Invalid plan request' });
  }
  const client = createClient(cfg.supabaseUrl, cfg.anon, {
    global: { headers: { Authorization: `Bearer ${bearer[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data: { user } = {}, error: authErr } = await client.auth.getUser(bearer[1]);
    if (authErr || !user) return reply(res, 401, { error: 'Invalid login session' });
    const planCode = req.body.plan_code;
    const { data: plan, error: planErr } = await client.from('jb_billing_plans')
      .select('code,display_name,price_centavos,currency,interval_unit,interval_count')
      .eq('code', planCode).eq('is_active', true).single();
    if (planErr || !plan || plan.price_centavos !== PRICES[planCode] ||
        plan.currency !== 'PHP' || plan.interval_unit !== 'month' || plan.interval_count !== 1) {
      return reply(res, 503, { error: 'Subscription plan configuration invalid' });
    }
    const { data: orderId, error: rpcErr } = await client.rpc('jb_billing_create_checkout_test_order_v1', { p_plan_code: planCode });
    if (rpcErr || typeof orderId !== 'string') {
      if (rpcErr?.message?.includes('Too many test checkouts')) return reply(res, 429, { error: 'Test checkout limit reached' });
      console.error('Test order RPC failed:', rpcErr?.code);
      return reply(res, 500, { error: 'Unable to create test order' });
    }
    const pm = await fetch('https://api.paymongo.com/v2/checkout_sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(cfg.key + ':').toString('base64')}` },
      body: JSON.stringify({ data: { attributes: {
        line_items: [{ name: `JB ${plan.display_name} membership (TEST)`, amount: plan.price_centavos, currency: 'PHP', quantity: 1 }],
        payment_method_types: ['qrph'],
        success_url: `${cfg.origin}/subscribe?checkout=returned`,
        cancel_url: `${cfg.origin}/subscribe?checkout=cancelled`,
        reference_number: orderId,
        metadata: { order_id: orderId },
        description: 'TEST ONLY - does not grant subscription access',
      } } }),
    });
    const pay = await pm.json().catch(() => null);
    const sessionId = pay?.data?.id;
    if (!pm.ok || typeof sessionId !== 'string' || pay?.data?.attributes?.livemode === true) {
      console.error('PayMongo TEST checkout rejected:', pm.status);
      return reply(res, 502, { error: 'Unable to create PayMongo TEST session', order_id: orderId });
    }
    // This user-authenticated Edge Function performs a server-side PayMongo GET
    // before storing any checkout-session data with Supabase's server-side key.
    const attached = await fetch(`${cfg.supabaseUrl}/functions/v1/jb-paymongo-attach-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bearer[1]}`, 'apikey': cfg.anon },
      body: JSON.stringify({ order_id: orderId, checkout_session_id: sessionId }),
    }).catch(() => null);
    const attachBody = await attached?.json().catch(() => null);
    if (!attached?.ok || attachBody?.ok !== true) {
      console.error('Test session association unavailable:', attached?.status);
      return reply(res, 502, { error: 'Checkout created but could not be linked; do not pay. Contact support.', order_id: orderId });
    }
    return reply(res, 200, { checkout_url: attachBody.checkout_url, order_id: orderId, environment: 'test' });
  } catch (err) {
    console.error('Test checkout unexpected error:', err?.message);
    return reply(res, 500, { error: 'Test checkout unavailable' });
  }
}
