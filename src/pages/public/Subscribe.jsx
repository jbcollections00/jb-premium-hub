import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CreditCard, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

const PLANS = [
  {
    code: 'standard',
    label: 'STANDARD',
    price: 50,
    benefits: ['Full media library access', 'Advertisements included', 'Streaming only'],
  },
  {
    code: 'vip',
    label: 'VIP',
    price: 150,
    benefits: ['Full media library access', 'Ad-free experience', 'Downloads included'],
  },
];

const SITE_ORIGIN = 'https://www.jb-premium-hub.vip';
const RETURN_CHECK_INTERVAL_MS = 5000;
const RETURN_CHECK_DURATION_MS = 2 * 60 * 1000;
const CHECKOUT_ATTEMPT_KEY = 'jb_premium_hub_live_checkout_attempt';
const CHECKOUT_ATTEMPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// UI is fail-closed. Server checkout authorization remains independent.
const checkoutUiBaseEnabled = import.meta.env.PROD &&
  import.meta.env.VITE_JB_LIVE_CHECKOUT_UI_ENABLED === 'true' &&
  window.location.origin === SITE_ORIGIN;

// Require an explicit UI rollout mode. The tester UUID is a public frontend
// display filter only; the Edge Function independently verifies user identity.
const CHECKOUT_UI_MODE = import.meta.env.VITE_JB_LIVE_CHECKOUT_UI_MODE || 'disabled';
const TESTER_UI_USER_ID = String(import.meta.env.VITE_JB_LIVE_CHECKOUT_TESTER_USER_ID || '').toLowerCase();
const VALID_TESTER_UI_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(TESTER_UI_USER_ID);

const testCheckoutUiEnabled = import.meta.env.PROD &&
  import.meta.env.VITE_JB_TEST_CHECKOUT_UI_ENABLED === 'true' &&
  window.location.origin === SITE_ORIGIN;

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
    expiryAt: validExpiry ? validExpiry.getTime() : null,
    expiry: validExpiry
      ? validExpiry.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
      : null,
  };
}

// Session storage is only a comparison hint for UI refresh; it is never payment evidence.
function rememberLiveCheckoutAttempt(attempt) {
  try {
    window.sessionStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify(attempt));
  } catch {
    // Private browsing/storage restrictions do not block checkout.
  }
}

function readLiveCheckoutAttempt(userId) {
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_ATTEMPT_KEY);
    if (!raw) return null;
    const attempt = JSON.parse(raw);
    if (!attempt || attempt.userId !== userId ||
        !['standard', 'vip'].includes(attempt.planCode) ||
        !Number.isFinite(attempt.startedAt) ||
        Date.now() - attempt.startedAt > CHECKOUT_ATTEMPT_MAX_AGE_MS ||
        attempt.startedAt > Date.now() + 60000 ||
        attempt.baselineKnown !== true ||
        !['FREE', 'STANDARD', 'VIP'].includes(attempt.previousTier) ||
        (attempt.previousExpiryAt !== null && !Number.isFinite(attempt.previousExpiryAt))) {
      return null;
    }
    return attempt;
  } catch {
    return null;
  }
}

function clearLiveCheckoutAttempt() {
  try {
    window.sessionStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
  } catch {
    // Safe to ignore.
  }
}

function membershipChangedAfterCheckout(next, attempt) {
  if (!next || !attempt || !next.canViewAlbums ||
      next.tier !== attempt.planCode.toUpperCase() ||
      !Number.isFinite(next.expiryAt) || next.expiryAt <= Date.now()) {
    return false;
  }

  // Compare the LIVE entitlement expiration with the snapshot from BEFORE checkout.
  // An already-active membership must not be mistaken for a new successful payment.
  const before = Number.isFinite(attempt.previousExpiryAt) ? attempt.previousExpiryAt : 0;
  return next.tier !== attempt.previousTier || next.expiryAt > before + 1000;
}

export default function Subscribe() {
  const [params] = useSearchParams();
  const outcome = params.get('checkout');
  // Read-only support diagnostics. Shows pass/fail booleans only; never displays
  // Supabase user IDs, configured tester IDs, auth tokens or payment secrets.
  const showTestCheckout = params.get('qa_checkout') === '1';
  const [plan, setPlan] = useState('vip');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);
  const checkoutUiEnabled = checkoutUiBaseEnabled && (
    CHECKOUT_UI_MODE === 'public' ||
    (CHECKOUT_UI_MODE === 'tester' && VALID_TESTER_UI_ID &&
      user?.id?.toLowerCase() === TESTER_UI_USER_ID)
  );
  const [checking, setChecking] = useState(true);
  const [access, setAccess] = useState(null);
  const [accessError, setAccessError] = useState('');
  const [attemptedOrder, setAttemptedOrder] = useState(null);
  const [returnStatus, setReturnStatus] = useState('idle');

  const selected = PLANS.find((item) => item.code === plan) || PLANS[1];
  const entitlement = formatEntitlement(access);

  const loadAccess = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('jb_billing_my_access');
      if (error) throw error;
      setAccess(data);
      setAccessError('');
      return data;
    } catch {
      setAccessError('Membership status cannot be confirmed right now. Please try again.');
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error || !data?.user) {
          setUser(null);
          return;
        }
        setUser(data.user);
        const { data: current, error: accessErrorFromServer } = await supabase.rpc('jb_billing_my_access');
        if (cancelled) return;
        if (accessErrorFromServer) throw accessErrorFromServer;
        setAccess(current);
        setAccessError('');
      } catch {
        if (!cancelled) {
          setAccessError('Membership status cannot be confirmed right now. Please try again.');
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (outcome === 'cancelled') clearLiveCheckoutAttempt();
  }, [outcome]);

  // A checkout return is NOT evidence of payment. Only the authenticated LIVE
  // entitlement RPC can reflect an independently verified, settled payment.
  useEffect(() => {
    if (outcome !== 'returned' || checking) return undefined;
    if (!user?.id) {
      setReturnStatus('login_required');
      return undefined;
    }

    let cancelled = false;
    let inFlight = false;
    let completed = false;
    const started = Date.now();
    const attempt = readLiveCheckoutAttempt(user.id);
    let intervalId;
    let deadlineId;

    const stop = (status) => {
      if (completed || cancelled) return;
      completed = true;
      window.clearInterval(intervalId);
      window.clearTimeout(deadlineId);
      setReturnStatus(status);
    };

    const checkLiveMembership = async () => {
      if (cancelled || completed || inFlight) return;
      if (Date.now() - started >= RETURN_CHECK_DURATION_MS) {
        stop('timed_out');
        return;
      }
      inFlight = true;
      try {
        const { data, error } = await supabase.rpc('jb_billing_my_access');
        if (cancelled || completed) return;
        if (error) throw error;

        setAccess(data);
        setAccessError('');
        const latest = formatEntitlement(data);
        if (membershipChangedAfterCheckout(latest, attempt)) {
          clearLiveCheckoutAttempt();
          stop('updated');
        }
      } catch {
        if (!cancelled && !completed) {
          setAccessError('Unable to check membership at the moment. Automatic checking will retry.');
        }
      } finally {
        inFlight = false;
      }
    };

    setReturnStatus('checking');
    intervalId = window.setInterval(checkLiveMembership, RETURN_CHECK_INTERVAL_MS);
    deadlineId = window.setTimeout(() => stop('timed_out'), RETURN_CHECK_DURATION_MS);
    void checkLiveMembership();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(deadlineId);
    };
  }, [outcome, checking, user?.id]);

  const refreshMembership = async () => {
    const current = await loadAccess();
    if (outcome === 'returned' && user?.id &&
        membershipChangedAfterCheckout(
          formatEntitlement(current),
          readLiveCheckoutAttempt(user.id)
        )) {
      clearLiveCheckoutAttempt();
      setReturnStatus('updated');
    }
  };

  const beginCheckout = async () => {
    if (!checkoutUiEnabled || busy || !user) return;
    setBusy(true);
    setMessage('');
    setAttemptedOrder(null);

    try {
      const { data: identity, error: authError } = await supabase.auth.getUser();
      if (authError || identity?.user?.id !== user.id || identity.user.is_anonymous) {
        throw new Error('Please sign in again.');
      }
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

      const checkoutUrl = new URL(data.checkout_url);
      if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.paymongo.com') {
        throw new Error('Unexpected checkout destination.');
      }

      const previous = formatEntitlement(access);
      rememberLiveCheckoutAttempt({
        userId: user.id,
        planCode: plan,
        previousExpiryAt: previous?.expiryAt ?? null,
        previousTier: previous?.tier ?? null,
        baselineKnown: previous !== null,
        startedAt: Date.now(),
      });
      window.location.assign(checkoutUrl.href);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Checkout unavailable. Please contact support.');
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
      const checkoutUrl = new URL(data.checkout_url);
      if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.paymongo.com') {
        throw new Error('Unexpected TEST checkout destination.');
      }
      window.location.assign(checkoutUrl.href);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'TEST checkout unavailable. Please contact support.');
    } finally {
      setBusy(false);
    }
  };


  return (
    <main className="jbh-page text-slate-100">
      <div className="mx-auto max-w-4xl">
        <div className="mb-9 text-center sm:mb-12">
          <p className="jbh-eyebrow">Membership</p>
          <h1 className="jbh-title mt-3">Choose your experience.</h1>
          <p className="jbh-muted mx-auto mt-4 max-w-xl text-sm sm:text-base">
            Simple, one-month access. Choose Standard for streaming or VIP for more flexibility.
          </p>
        </div>

        {outcome === 'returned' && (
          <div role="status" aria-live="polite" className="mb-6 rounded-2xl border border-indigo-400/25 bg-indigo-500/10 p-4 text-sm text-indigo-100">
            {returnStatus === 'updated'
              ? 'Your membership is updated. Enjoy your access.'
              : returnStatus === 'timed_out'
                ? 'Confirmation is taking longer than expected. Please contact support before paying again.'
                : returnStatus === 'login_required'
                  ? 'Please sign in to check your membership.'
                  : 'Checking your payment confirmation. Please do not pay again while we check.'}
          </div>
        )}
        {outcome === 'cancelled' && (
          <div role="status" className="mb-6 rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-sm text-slate-200">
            Checkout was cancelled. Your membership was not changed.
          </div>
        )}
        {outcome === 'test-return' && showTestCheckout && (
          <div role="status" className="mb-6 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4 text-sm text-cyan-200">
            Test checkout returned. Confirm test results in the dashboard.
          </div>
        )}
        {outcome === 'test-cancel' && showTestCheckout && (
          <div role="status" className="mb-6 rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-sm text-slate-200">
            Test checkout cancelled.
          </div>
        )}
        {!checkoutUiEnabled && (
          <div role="status" className="mb-6 rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-sm text-slate-300">
            Checkout is temporarily unavailable. Please check back soon.
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2" aria-label="Membership plans">
          {PLANS.map((item) => {
            const selectedPlan = plan === item.code;
            const vipPlan = item.code === 'vip';
            return (
              <button key={item.code} type="button" onClick={() => setPlan(item.code)}
                aria-pressed={selectedPlan}
                className={'group relative flex min-h-[258px] flex-col rounded-3xl border p-6 text-left transition-all duration-200 sm:p-7 ' +
                  (selectedPlan
                    ? 'border-indigo-400/70 bg-gradient-to-br from-indigo-500/20 via-slate-900 to-slate-900 shadow-[0_16px_40px_rgba(55,48,163,0.18)]'
                    : 'border-white/10 bg-slate-900/65 hover:-translate-y-0.5 hover:border-indigo-400/40')}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold tracking-[.15em] text-slate-200">{item.label}</span>
                  {vipPlan && <span className="rounded-full bg-indigo-400/15 px-3 py-1 text-[11px] font-semibold text-indigo-200">More benefits</span>}
                  {!vipPlan && selectedPlan && <CheckCircle2 className="h-5 w-5 text-indigo-300" aria-hidden="true" />}
                </div>
                <div className="mt-6">
                  <span className="text-4xl font-black tracking-tight text-white">₱{item.price}</span>
                  <span className="ml-2 text-sm text-slate-400">for one month</span>
                </div>
                <ul className="mt-6 space-y-3">
                  {item.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-center gap-2.5 text-sm text-slate-300">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />
                      {benefit}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-6 text-xs font-semibold text-indigo-200">
                  {selectedPlan ? 'Selected plan' : 'Select plan'}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <section className="jbh-surface p-6 sm:p-7" aria-labelledby="checkout-heading">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-400/15 text-indigo-200">
                <CreditCard className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="checkout-heading" className="text-lg font-bold text-white">Secure checkout</h2>
                <p className="mt-0.5 text-xs text-slate-400">Powered by PayMongo · QR Ph</p>
              </div>
            </div>

            <div className="jbh-surface-soft mt-6 flex items-center justify-between gap-4 px-4 py-4">
              <div>
                <p className="text-xs text-slate-400">Your selection</p>
                <p className="mt-1 text-sm font-bold text-white">{selected.label}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-extrabold text-white">₱{selected.price}</p>
                <p className="text-[11px] text-slate-400">One-time payment</p>
              </div>
            </div>

            {message && <p role="alert" className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">{message}</p>}
            {message && attemptedOrder && <p className="mt-2 break-all text-xs text-slate-400">Support reference: {attemptedOrder}</p>}

            <button type="button" onClick={beginCheckout}
              disabled={!checkoutUiEnabled || !user || checking || busy}
              className="jbh-btn mt-5 w-full">
              {busy ? 'Opening checkout…' : checkoutUiEnabled ? <>Continue to PayMongo · ₱{selected.price}</> : 'Checkout unavailable'}
            </button>

            {testCheckoutUiEnabled && showTestCheckout && (
              <div className="mt-4 rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-4">
                <p className="text-xs font-semibold text-cyan-200">Test checkout</p>
                <p className="mt-1 text-xs text-cyan-100/75">Test payments do not activate live memberships.</p>
                <button type="button" onClick={beginTestCheckout} disabled={!user || checking || busy}
                  className="jbh-btn-quiet mt-3 w-full text-sm">
                  {busy ? 'Opening test checkout…' : <>Open test checkout · ₱{selected.price}</>}
                </button>
              </div>
            )}

            {!user && !checking && (
              <p className="mt-4 text-sm text-slate-400">
                <Link to="/login" className="font-semibold text-indigo-300 hover:text-white">Sign in</Link> to continue.
              </p>
            )}
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-400">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />
              Access starts after payment confirmation. No automatic monthly charges.
            </p>
          </section>

          <section className="jbh-surface p-6 sm:p-7" aria-labelledby="membership-heading">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="membership-heading" className="text-lg font-bold text-white">My membership</h2>
                <p className="mt-0.5 text-xs text-slate-400">Your current access</p>
              </div>
            </div>
            {accessError && <p className="mt-5 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200" role="alert">{accessError}</p>}
            {access !== null && !entitlement && (
              <p role="status" className="mt-5 text-sm text-amber-200">Membership details are unavailable. Please contact support.</p>
            )}
            {entitlement && (
              <div className="mt-6" aria-live="polite">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <span className="text-sm text-slate-400">Current plan</span>
                  <span className="rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1 text-xs font-bold text-indigo-200">{entitlement.tier}</span>
                </div>
                <dl className="mt-4 space-y-4 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-slate-400">Media access</dt><dd className="font-semibold">{entitlement.canViewAlbums ? 'Included' : 'Not active'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-400">Downloads</dt><dd className="font-semibold">{entitlement.canDownload ? 'Included' : 'Not included'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-400">Ads</dt><dd className="font-semibold">{entitlement.tier === 'FREE' ? '—' : entitlement.showAds ? 'Included' : 'Ad-free'}</dd></div>
                  <div className="border-t border-white/10 pt-4"><dt className="text-slate-400">Valid until</dt><dd className="mt-1 font-semibold">{entitlement.expiry || 'No active paid period'}</dd></div>
                </dl>
              </div>
            )}
            <button type="button" onClick={refreshMembership} disabled={!user || checking}
              className="jbh-btn-quiet mt-6 w-full text-sm">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh membership
            </button>
          </section>
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-slate-500">
          Questions about a payment? <Link to="/support" className="font-semibold text-indigo-300 hover:text-white">Contact support</Link>.
          Please avoid paying twice if confirmation is delayed.
        </p>
      </div>
    </main>
  );
}
