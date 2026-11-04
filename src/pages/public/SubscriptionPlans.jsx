import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

// The diagnostic button is shown only on this Vercel branch preview.
// This UI restriction is additional to the Edge Function's server-side JWT/UID checks.
const QR_TEST_PREVIEW_ORIGIN =
  'https://jb-premium-hub-git-paymongo-test-jbcollections00-7010s-projects.vercel.app';
const QR_TEST_OPERATOR_UID = '3b8db1a7-4b4e-4b5a-bff5-9a25b260efdd';
const QR_TEST_FUNCTION_URL =
  'https://kwazrebdlzdkwdhrintr.supabase.co/functions/v1/jb-paymongo-qr-test-checkout';

function isSafePaymongoCheckoutUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'checkout.paymongo.com' &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

export default function SubscriptionPlans() {
  const [plans, setPlans] = useState([]);
  const [access, setAccess] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [params] = useSearchParams();
  const [operatorUid, setOperatorUid] = useState(null);
  const [checkedRisk, setCheckedRisk] = useState(false);
  const [qrResult, setQrResult] = useState(null);

  const isBranchPreview =
    typeof window !== 'undefined' &&
    window.location.origin === QR_TEST_PREVIEW_ORIGIN;
  const canViewQrDiagnostic =
    isBranchPreview && operatorUid === QR_TEST_OPERATOR_UID;

  useEffect(() => {
    let alive = true;

    (async () => {
      const [p, a, auth] = await Promise.all([
        supabase
          .from('jb_billing_plans')
          .select('code,display_name,price_centavos,grants_download,shows_ads')
          .eq('is_active', true),
        supabase.rpc('jb_billing_my_access'),
        supabase.auth.getUser(),
      ]);
      if (!alive) return;
      if (p.error || a.error) {
        setError('Could not load billing data.');
      } else {
        setPlans(p.data || []);
        setAccess(Array.isArray(a.data) ? a.data[0] : a.data);
      }
      setOperatorUid(auth.error ? null : (auth.data?.user?.id || null));
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function checkout(code) {
    setError('');
    setBusy(code);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in again.');

      const response = await fetch('/api/paymongo/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan_code: code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Checkout failed');
      window.location.assign(result.checkout_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setBusy('');
    }
  }

  async function createQrDiagnostic() {
    if (!canViewQrDiagnostic || !checkedRisk || busy) return;
    setError('');
    setQrResult(null);

    // The UNIQUE(user_id) constraint permits only one diagnostic order.
    // Explain that creating an order is not the same as completing payment.
    const confirmed = window.confirm(
      'Create your ONE ₱1 QR Ph diagnostic checkout?\n\n' +
        'This creates a pending TEST order and PayMongo checkout link. ' +
        'It does NOT pay automatically. If you later scan and pay the QR, ' +
        'REAL ₱1 may be transferred. No membership will be activated.\n\n' +
        'The test account cannot create a second order under the current database restriction.'
    );
    if (!confirmed) return;

    setBusy('qr-test');
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || auth.user?.id !== QR_TEST_OPERATOR_UID) {
        throw new Error('This account is not authorized for the ₱1 diagnostic checkout.');
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please sign in again.');

      const response = await fetch(QR_TEST_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirm: 'create-one-peso-qr-test' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `Diagnostic checkout failed (HTTP ${response.status}).`);
      }

      if (
        result.diagnostic !== true ||
        result.environment !== 'test' ||
        result.amount_centavos !== 100 ||
        typeof result.order_id !== 'string' ||
        !isSafePaymongoCheckoutUrl(result.checkout_url)
      ) {
        throw new Error(
          'The checkout response could not be verified. Do not pay; inspect the diagnostic order.'
        );
      }

      // Show an explicit link rather than automatically sending the user to a payment page.
      setQrResult({
        orderId: result.order_id,
        checkoutUrl: result.checkout_url,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Diagnostic checkout failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-3">Membership Plans</h1>
        <p className="text-slate-300 mb-2">
          Choose a membership to unlock albums and portfolios.
        </p>
        <p className="text-slate-400 mb-4">
          Current membership: {access?.tier || 'Unverified'}
        </p>
        <p className="mb-5 rounded-xl border border-amber-600 bg-amber-950/40 px-4 py-3 text-amber-200">
          TEST MODE ONLY. Checkout payments do not activate accounts or generate
          usable access codes yet. QR Ph may transfer real money if paid.
        </p>

        {params.get('checkout') && (
          <p className="mb-5">
            Returned from checkout. Payment verification is pending; your membership
            has not changed.
          </p>
        )}
        {params.get('qr_diagnostic') && (
          <p className="mb-5 rounded-xl border border-slate-700 px-4 py-3 text-slate-300">
            Returned from the ₱1 diagnostic checkout. This does not prove payment.
            Check the PayMongo session and Supabase webhook records separately.
          </p>
        )}
        {error && (
          <p role="alert" className="mb-5 rounded-lg bg-red-950/50 p-3 text-red-200">
            {error}
          </p>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          {plans.map((plan) => (
            <section
              key={plan.code}
              className="rounded-2xl border border-slate-700 bg-slate-900 p-6"
            >
              <h2 className="text-2xl font-semibold">{plan.display_name}</h2>
              <p className="text-3xl font-bold mt-3">
                ₱{plan.price_centavos / 100}
                <span className="text-base font-normal text-slate-400"> / month</span>
              </p>
              <p className="mt-5">Album viewing included</p>
              <p className="mt-2">
                {plan.shows_ads ? 'Advertisements included' : 'No advertisements'}
              </p>
              <p className="mt-2">
                {plan.grants_download ? 'Media downloads included' : 'Downloads not included'}
              </p>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => checkout(plan.code)}
                className="mt-6 rounded-lg bg-indigo-600 disabled:opacity-40 px-5 py-3"
              >
                {busy === plan.code
                  ? 'Connecting…'
                  : `Test ₱${plan.price_centavos / 100} checkout`}
              </button>
            </section>
          ))}
        </div>

        {canViewQrDiagnostic && (
          <section className="mt-8 rounded-2xl border border-emerald-700 bg-slate-900 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Authorized operator · Preview only
            </p>
            <h2 className="mt-2 text-2xl font-bold">₱1 QR Ph Diagnostic Checkout</h2>
            <p className="mt-2 text-slate-300">
              One-time test order only. This is not a Standard or VIP membership purchase.
            </p>
            <p className="mt-3 rounded-lg border border-amber-600 bg-amber-950/40 p-3 text-amber-200">
              A QR Ph payment can transfer real money even when the checkout uses
              TEST credentials. Creating the checkout link itself makes no payment.
              Do not pay until the link, amount, session association, and webhook
              readiness have been checked.
            </p>

            <label className="mt-4 flex items-start gap-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={checkedRisk}
                onChange={(e) => setCheckedRisk(e.target.checked)}
                className="mt-1 h-4 w-4 accent-emerald-500"
              />
              <span>
                I understand this creates my only ₱1 diagnostic order and that
                scanning and paying the QR may transfer real money without granting membership.
              </span>
            </label>
            <button
              type="button"
              disabled={Boolean(busy) || !checkedRisk || Boolean(qrResult)}
              onClick={createQrDiagnostic}
              className="mt-5 rounded-lg bg-emerald-600 px-5 py-3 font-semibold disabled:opacity-40"
            >
              {busy === 'qr-test' ? 'Creating diagnostic checkout…' : 'Create one ₱1 TEST checkout'}
            </button>

            {qrResult && (
              <div className="mt-5 rounded-xl border border-slate-600 bg-slate-950 p-4">
                <p className="font-semibold text-emerald-300">Diagnostic checkout created</p>
                <p className="mt-2 break-all text-sm text-slate-300">
                  Order ID: {qrResult.orderId}
                </p>
                <p className="mt-2 text-sm text-amber-200">
                  First verify the PayMongo checkout amount is exactly ₱1 and
                  the order/session records match. Do not scan or pay yet.
                </p>
                <a
                  href={qrResult.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block rounded-lg border border-emerald-600 px-4 py-2 font-semibold text-emerald-200 underline"
                >
                  Inspect ₱1 checkout in a new tab
                </a>
              </div>
            )}
          </section>
        )}

        <Link to="/profile" className="inline-block underline text-blue-300 mt-8">
          Return to my profile
        </Link>
      </div>
    </main>
  );
}
