import { createClient } from '@supabase/supabase-js';

const send = (res, status, body) => res.status(status).json(body);
const requiredPrices = { standard: 5000, vip: 15000 };

function previewConfiguration() {
  if (process.env.VERCEL_ENV !== 'preview') return null;
  if (process.env.PAYMONGO_TEST_CHECKOUT_ENABLED !== 'true') return null;
  const key = process.env.PAYMONGO_SECRET_KEY;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rawOrigin = process.env.SITE_ORIGIN;
  if (!key?.startsWith('sk_test_') || !url || !serviceKey || !rawOrigin) return null;
  try {
    const origin = new URL(rawOrigin);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || origin.hostname === 'localhost') return null;
    return { key, url, serviceKey, origin: origin.origin };
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required' });
  const conf = previewConfiguration();
  if (!conf) return send(res, 503, { error: 'Preview-only test checkout is disabled or not configured' });
  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
  if (!match) return send(res, 401, { error: 'Please sign in' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return send(res, 400, { error: 'Invalid request' });
  if (Object.keys(req.body).length !== 1 || typeof req.body.plan_code !== 'string' || !(req.body.plan_code in requiredPrices)) return send(res, 400, { error: 'Invalid plan' });

  const db = createClient(conf.url, conf.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: { user } = {}, error: authError } = await db.auth.getUser(match[1]);
    if (authError || !user) return send(res, 401, { error: 'Invalid login session' });

    const planCode = req.body.plan_code;
    const { data: plan, error: planError } = await db.from('jb_billing_plans')
      .select('code,display_name,price_centavos,currency')
      .eq('code', planCode).eq('is_active', true).single();
    if (planError || !plan || plan.currency !== 'PHP' || plan.price_centavos !== requiredPrices[planCode]) {
      return send(res, 503, { error: 'Subscription plan is unavailable or pricing differs from expected test values' });
    }

    // Production database caution: this inserts a TEST order only; it never grants access.
    const { data: order, error: orderError } = await db.from('jb_billing_orders')
      .insert({ user_id: user.id, plan_code: planCode, billing_mode: 'manual_checkout',
        provider_environment: 'test', amount_centavos: plan.price_centavos,
        currency: 'PHP', status: 'pending' }).select('id').single();
    if (orderError || !order) {
      console.error('Failed to persist test order:', orderError?.message);
      return send(res, 500, { error: 'Unable to create test order' });
    }

    try {
      const paymongoResponse = await fetch('https://api.paymongo.com/v2/checkout_sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${conf.key}:`).toString('base64')}` },
        body: JSON.stringify({ data: { attributes: {
          line_items: [{ name: `JB ${plan.display_name} membership (TEST)`, amount: plan.price_centavos, currency: 'PHP', quantity: 1 }],
          payment_method_types: ['qrph'],
          success_url: `${conf.origin}/subscribe?checkout=returned`,
          cancel_url: `${conf.origin}/subscribe?checkout=cancelled`,
          reference_number: order.id,
          metadata: { order_id: order.id },
          description: 'TEST ONLY — subscription access will not be activated',
        } } }),
      });
      const result = await paymongoResponse.json().catch(() => null);
      const session = result?.data;
      if (!paymongoResponse.ok || typeof session?.id !== 'string') throw new Error(`PayMongo HTTP ${paymongoResponse.status}`);
      const checkoutURL = session?.attributes?.checkout_url;
      let parsed;
      try { parsed = new URL(checkoutURL); } catch { throw new Error('Invalid checkout URL'); }
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'checkout.paymongo.com' || parsed.username || parsed.password) throw new Error('Unexpected checkout host');
      if (session.attributes?.livemode === true) throw new Error('Unexpected live checkout session');

      const { error: updateError } = await db.from('jb_billing_orders')
        .update({ paymongo_checkout_session_id: session.id, checkout_url: checkoutURL, updated_at: new Date().toISOString() })
        .eq('id', order.id).eq('status', 'pending');
      if (updateError) throw new Error(`Order session update failed: ${updateError.message}`);
      return send(res, 200, { checkout_url: checkoutURL, order_id: order.id, environment: 'test' });
    } catch (error) {
      console.error('Test checkout creation failed:', error.message);
      // If PayMongo created a remote session before DB update failed, reconcile it manually.
      return send(res, 502, { error: 'Test checkout could not be completed. Check server logs.', order_id: order.id });
    }
  } catch (error) {
    console.error('Test checkout unexpected error:', error.message);
    return send(res, 500, { error: 'Test checkout unavailable' });
  }
}
