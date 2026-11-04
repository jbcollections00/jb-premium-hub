import { createClient } from '@supabase/supabase-js';

// Phase 3A: manual TEST checkout only. No paid entitlements and no service-role key.
const PRICES = Object.freeze({ standard: 5000, vip: 15000 });
const reply = (res, status, obj) => res.status(status).json(obj);

export const config = { api: { bodyParser: { sizeLimit: '2kb' } } };

function configForPreview() {
  if (process.env.VERCEL_ENV !== 'preview') return null;
  if (process.env.PAYMONGO_TEST_CHECKOUT_ENABLED !== 'true') return null;

  const key = process.env.PAYMONGO_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  // Supabase anon/publishable key is safe in server code; service role is NOT used.
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const originValue = process.env.SITE_ORIGIN;
  if (!key?.startsWith('sk_test_') || !supabaseUrl || !anonKey || !originValue) return null;

  try {
    const origin = new URL(originValue);
    const dbUrl = new URL(supabaseUrl);
    if (origin.protocol !== 'https:' || origin.username || origin.password ||
        origin.search || origin.hash || origin.pathname !== '/' ||
        !origin.hostname.endsWith('.vercel.app')) return null;
    if (dbUrl.protocol !== 'https:' || !dbUrl.hostname.endsWith('.supabase.co')) return null;
    return { key, anonKey, supabaseUrl: dbUrl.origin, origin: origin.origin };
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return reply(res, 405, { error: 'POST required' });

  const conf = configForPreview();
  if (!conf) return reply(res, 503, { error: 'Preview TEST checkout configuration incomplete' });

  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
  if (!match) return reply(res, 401, { error: 'Please sign in' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 || !Object.hasOwn(req.body, 'plan_code') ||
      !Object.hasOwn(PRICES, req.body.plan_code)) {
    return reply(res, 400, { error: 'Invalid plan request' });
  }

  // RLS/EXECUTE permissions are evaluated as the authenticated caller.
  // The server verifies the user token; no service role or privileged DB writes.
  const db = createClient(conf.supabaseUrl, conf.anonKey, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: { user } = {}, error: userError } = await db.auth.getUser(match[1]);
    if (userError || !user) return reply(res, 401, { error: 'Invalid login session' });

    const plan = req.body.plan_code;
    const { data: activePlan, error: planError } = await db.from('jb_billing_plans')
      .select('code,display_name,price_centavos,currency,interval_unit,interval_count')
      .eq('code', plan).eq('is_active', true).single();
    if (planError || !activePlan || activePlan.price_centavos !== PRICES[plan] ||
        activePlan.currency !== 'PHP' || activePlan.interval_unit !== 'month' ||
        activePlan.interval_count !== 1) {
      return reply(res, 503, { error: 'Subscription plan configuration unavailable' });
    }

    // DB function sets user_id = auth.uid(), test mode, fixed price and pending status.
    const { data: orderId, error: rpcError } = await db.rpc(
      'jb_billing_create_checkout_test_order_v1', { p_plan_code: plan }
    );
    if (rpcError || typeof orderId !== 'string') {
      console.error('TEST order RPC failed:', rpcError?.code, rpcError?.message);
      if (rpcError?.message?.includes('Too many test checkouts')) {
        return reply(res, 429, { error: 'Test checkout limit reached. Try again later.' });
      }
      return reply(res, 500, { error: 'Could not create pending test order; verify RPC installation' });
    }

    const response = await fetch('https://api.paymongo.com/v2/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${conf.key}:`).toString('base64')}`,
      },
      body: JSON.stringify({ data: { attributes: {
        line_items: [{
          name: `JB ${activePlan.display_name} membership (TEST)`,
          amount: activePlan.price_centavos, currency: 'PHP', quantity: 1,
        }],
        payment_method_types: ['qrph'],
        success_url: `${conf.origin}/subscribe?checkout=returned`,
        cancel_url: `${conf.origin}/subscribe?checkout=cancelled`,
        reference_number: orderId,
        metadata: { order_id: orderId },
        description: 'TEST ONLY - does not grant any subscription access',
      } } }),
    });

    const payload = await response.json().catch(() => null);
    const session = payload?.data;
    const checkoutUrl = session?.attributes?.checkout_url;
    if (!response.ok || typeof session?.id !== 'string') {
      console.error('PayMongo TEST checkout rejected with HTTP:', response.status);
      return reply(res, 502, { error: 'PayMongo test checkout could not be created', order_id: orderId });
    }
    let parsed;
    try { parsed = new URL(checkoutUrl); } catch { /* handled below */ }
    if (!parsed || parsed.protocol !== 'https:' || parsed.hostname !== 'checkout.paymongo.com' ||
        parsed.username || parsed.password || session?.attributes?.livemode === true) {
      return reply(res, 502, { error: 'Unexpected PayMongo checkout response', order_id: orderId });
    }

    // Intentionally NO direct update of checkout_session_id or checkout_url here.
    // An authenticated client RPC must not be able to impersonate trusted payment state.
    // The later signed webhook/reconciliation endpoint will fill those fields.
    return reply(res, 200, { checkout_url: parsed.href, order_id: orderId, environment: 'test' });
  } catch (err) {
    console.error('TEST checkout error:', err?.message);
    return reply(res, 500, { error: 'Test checkout unavailable' });
  }
}
