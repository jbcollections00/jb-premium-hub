import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CreditCard, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

const PLANS = [
  {
    code: 'standard',
    label: 'STANDARD',
    price: 50,
    benefits: ['One month of access', 'Advertisements included', 'Downloads unavailable'],
  },
  {
    code: 'vip',
    label: 'VIP',
    price: 150,
    benefits: ['One month of access', 'No advertisements', 'Downloads enabled'],
  },
];

// Explicitly OFF unless a deliberate production release sets the UI switch.
// The backend checkout control is independently OFF by default.
const checkoutUiEnabled = import.meta.env.PROD &&
  import.meta.env.VITE_JB_LIVE_CHECKOUT_UI_ENABLED === 'true' &&
  window.location.origin === 'https://www.jb-premium-hub.vip';

// Isolated TEST checkout. Keep OFF unless explicitly enabled for a controlled QA run.
// This does not enable LIVE checkout and TEST grants do not authorize LIVE access.
const testCheckoutUiEnabled = import.meta.env.PROD &&
  import.meta.env.VITE_JB_TEST_CHECKOUT_UI_ENABLED === 'true' &&
  window.location.origin === 'https://www.jb-premium-hub.vip';

function formatEntitlement(raw) {
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

  const tier = typeof item.tier === 'string' ? item.tier.toLowerCase() : '';
  if (!['free', 'standard', 'vip'].includes(tier)) return null;

  const expires = item.access_expires_at == null ? null : new Date(item.access_expires_at);
  const validExpiry = expires && !Number.isNaN(expires.getTime()) ? expires : null;
  return {
    tier: tier.toUpperCase(),
    canViewAlbums: item.can_view_albums === true,
    canDownload: item.can_download === true,
    showAds: item.show_ads === true,
    expiry: validExpiry ? validExpiry.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : null,
  };
}

export default function Subscribe() {
  const [params] = useSearchParams();
  const [plan, setPlan] = useState('vip');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [access, setAccess] = useState(null);
  const [accessError, setAccessError] = useState('');
  const [attemptedOrder, setAttemptedOrder] = useState(null);
  const selected = PLANS.find((item) => item.code === plan);
  const entitlement = formatEntitlement(access);

  const loadAccess = async () => {
    setAccessError('');
    try {
      const { data, error } = await supabase.rpc('jb_billing_my_access');
      if (error) throw error;
      setAccess(data);
    } catch {
      setAccess(null);
      setAccessError('Membership status cannot be confirmed right now. Please try again.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data, error }) => {
      if (cancelled) return;
      if (error || !data?.user) {
        setUser(null);
        setChecking(false);
        return;
      }
      setUser(data.user);
      await loadAccess();
      if (!cancelled) setChecking(false);
    }).catch(() => {
      if (!cancelled) setChecking(false);
    });
    return () => { cancelled = true; };
  }, []);

  const beginCheckout = async () => {
    if (!checkoutUiEnabled || busy || !user) return;
    setBusy(true);
    setMessage('');
    setAttemptedOrder(null);
    try {
      const { data: identity, error: authError } = await supabase.auth.getUser();
      if (authError || identity?.user?.id !== user.id) throw new Error('Please sign in again.');
      const requestId = crypto.randomUUID();
      const { data, error } = await supabase.functions.invoke('jb-paymongo-checkout-live', {
        body: { plan_code: plan, request_id: requestId },
      });
      if (data?.order_id) setAttemptedOrder(data.order_id);
      if (error) throw new Error('Checkout is unavailable. No payment was confirmed.');
      if (data?.environment !== 'live' || !['created', 'existing'].includes(data?.status) ||
          typeof data.checkout_url !== 'string') {
        throw new Error('Checkout could not be verified.');
      }
      const url = new URL(data.checkout_url);
      if (url.protocol !== 'https:' || !(
        url.hostname === 'checkout.paymongo.com' ||
        url.hostname.endsWith('.paymongo.com')
      )) throw new Error('Unexpected checkout destination.');
      window.location.assign(url.href);
    } catch (error) {
      setMessage(error.message || 'Checkout unavailable. Please contact support.');
    } finally {
      setBusy(false);
    }
  };

  const beginTestCheckout = async () => {
    if (!testCheckoutUiEnabled || busy || !user) return;
    setBusy(true);
    setMessage('');
    setAttemptedOrder(null);
    try {
      const { data: identity, error: authError } = await supabase.auth.getUser();
      if (authError || identity?.user?.id !== user.id || identity.user.is_anonymous) {
        throw new Error('Please sign in again.');
      }
      const { data, error } = await supabase.functions.invoke('jb-billing-checkout-test', {
        body: { plan_code: plan },
      });
      if (data?.order_id) setAttemptedOrder(data.order_id);
      if (error) throw new Error('TEST checkout unavailable. No payment was confirmed.');
      if (data?.environment !== 'test' || typeof data.checkout_url !== 'string') {
        throw new Error('Unexpected TEST checkout response.');
      }
      const url = new URL(data.checkout_url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.paymongo.com') {
        throw new Error('Unexpected TEST checkout destination.');
      }
      window.location.assign(url.href);
    } catch (error) {
      setMessage(error.message || 'TEST checkout unavailable. Please contact support.');
    } finally {
      setBusy(false);
    }
  };

  const outcome = params.get('checkout');
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-slate-100">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-blue-400 uppercase">JB Premium Hub</p>
        <h1 className="text-3xl font-extrabold mt-2">Choose your membership</h1>
        <p className="mt-2 text-slate-400">One-month access plans. Payment confirmation is verified by the server, never by a browser redirect.</p>
      </div>

      {outcome === 'returned' && (
        <div role="status" className="mb-6 rounded-xl border border-amber-600/40 bg-amber-950/30 p-4 text-sm text-amber-200">
          Returned from checkout. This does not confirm payment. Please refresh your membership status below after processing.
        </div>
      )}
      {outcome === 'test-return' && (
        <div role="status" className="mb-6 rounded-xl border border-cyan-600/40 bg-cyan-950/30 p-4 text-sm text-cyan-200">
          Returned from PayMongo TEST checkout. This is not proof of payment. TEST transactions do not activate production membership; verify the TEST order and entitlement in Supabase.
        </div>
      )}
      {outcome === 'test-cancel' && (
        <div role="status" className="mb-6 rounded-xl border border-slate-600 bg-slate-900 p-4 text-sm text-slate-300">
          TEST checkout was cancelled. No membership is granted by a redirect.
        </div>
      )}
      {outcome === 'cancelled' && (
        <div role="status" className="mb-6 rounded-xl border border-slate-600 bg-slate-900 p-4 text-sm text-slate-300">
          Checkout was cancelled. No membership is granted from this redirect.
        </div>
      )}

      {!checkoutUiEnabled && (
        <div role="status" className="mb-6 rounded-xl border border-blue-700/40 bg-blue-950/30 p-4 text-sm text-blue-200">
          Payment checkout is not enabled yet. This page is available for preview and validation only; no LIVE payment can be started here.
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {PLANS.map((item) => (
          <button key={item.code} type="button" onClick={() => setPlan(item.code)}
            aria-pressed={plan === item.code}
            className={`rounded-2xl border p-6 text-left transition-colors ${plan === item.code ? 'border-blue-500 bg-blue-950/40' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}`}>
            <span className="text-sm font-bold tracking-wider">{item.label}</span>
            <div className="my-3 text-3xl font-black">₱{item.price}<span className="text-sm font-medium text-slate-400"> / month</span></div>
            <div className="space-y-2">
              {item.benefits.map((feature) => (
                <div className="flex items-center gap-2 text-sm text-slate-300" key={feature}>
                  <CheckCircle2 className="h-4 w-4 flex-none text-emerald-400" /> {feature}
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold"><CreditCard className="h-5 w-5" /> Checkout</h2>
        <p className="mt-3 text-sm text-slate-300">Selected: <strong>{selected.label} — ₱{selected.price}</strong> for one month.</p>
        <p className="mt-2 text-xs text-slate-400">Payment method planned: PayMongo QR Ph. A successful checkout return is not proof of payment.</p>
        {message && <p role="alert" className="mt-4 rounded-lg border border-amber-600/40 p-3 text-sm text-amber-300">{message}</p>}
        {attemptedOrder && <p className="mt-2 break-all text-xs text-slate-400">Order for support: {attemptedOrder}</p>}
        <button type="button" onClick={beginCheckout} disabled={!checkoutUiEnabled || !user || checking || busy}
          className="mt-5 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">
          {busy ? 'Opening secure checkout...' : checkoutUiEnabled ? `Pay ₱${selected.price} via PayMongo` : 'LIVE checkout disabled'}
        </button>
        {testCheckoutUiEnabled && (
          <div className="mt-5 rounded-xl border border-cyan-700/50 bg-cyan-950/20 p-4">
            <p className="text-sm font-semibold text-cyan-200">QA ONLY — PayMongo TEST checkout</p>
            <p className="mt-1 text-xs text-cyan-100/80">TEST transactions do not grant production access. Use only the PayMongo TEST flow; do not send real money.</p>
            <button type="button" onClick={beginTestCheckout} disabled={!user || checking || busy}
              className="mt-3 w-full rounded-lg border border-cyan-500 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-900/40 disabled:opacity-50">
              {busy ? 'Opening TEST checkout...' : `TEST ₱${selected.price} ${selected.label} checkout`}
            </button>
          </div>
        )}
        {!user && !checking && <p className="mt-3 text-sm text-slate-400">Sign in to buy a membership. <Link className="text-blue-400 underline" to="/login">Log in</Link></p>}
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-400"><LockKeyhole className="h-4 w-4" /> Membership activates only after server-side payment verification.</p>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-emerald-400" /> Membership status</h2>
        <p className="mt-2 text-sm text-slate-400">The current entitlement is provided by the authenticated billing RPC. No access is granted by this page.</p>
        {accessError && <p className="mt-3 text-sm text-amber-300" role="alert">{accessError}</p>}
        {access !== null && !entitlement && (
          <p role="status" className="mt-3 rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-sm text-amber-200">
            Unable to interpret membership status. No access changes have been made. Please contact support.
          </p>
        )}
        {entitlement && (
          <div className="mt-4 rounded-xl bg-slate-950 p-4" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-slate-400">Your plan</span>
              <span className="rounded-full border border-blue-600/40 bg-blue-950/50 px-3 py-1 text-sm font-bold text-blue-200">
                {entitlement.tier}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div><dt className="text-slate-400">Album access</dt><dd className="font-semibold">{entitlement.canViewAlbums ? 'Available' : 'Not included'}</dd></div>
              <div><dt className="text-slate-400">Downloads</dt><dd className="font-semibold">{entitlement.canDownload ? 'Enabled' : 'Disabled'}</dd></div>
              <div><dt className="text-slate-400">Advertisements</dt><dd className="font-semibold">{entitlement.tier === 'FREE' ? 'Not applicable — no album access' : entitlement.showAds ? 'Included' : 'Ad-free'}</dd></div>
              <div><dt className="text-slate-400">Access expiration</dt><dd className="font-semibold">{entitlement.expiry || 'No paid expiry available'}</dd></div>
            </dl>
            {entitlement.tier === 'FREE' && <p className="mt-4 text-xs text-slate-400">Your account currently has no paid membership. Choose a plan when checkout becomes available.</p>}
          </div>
        )}
        <button type="button" onClick={loadAccess} disabled={!user || checking}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> Refresh status
        </button>
        <div className="mt-4 text-xs text-slate-500">For payment issues, use the <Link to="/support" className="text-blue-400 underline">Support page</Link>. Do not submit multiple payments if checkout status is uncertain.</div>
      </section>
    </main>
  );
}
