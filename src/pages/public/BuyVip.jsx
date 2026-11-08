import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, CreditCard, Lock, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { FREE_ACCESS, getBillingAccess } from "../../services/billingAccess";

const PLANS = [
  { code: "standard", name: "STANDARD", price: 50, features: ["Album access", "With advertisements", "Downloads disabled"] },
  { code: "vip", name: "VIP", price: 150, features: ["Album access", "No advertisements", "Downloads enabled"] },
];
// A frontend flag is only an extra safety switch. The server's database locks remain authoritative.
const LIVE_ENABLED = import.meta.env.VITE_JB_LIVE_CHECKOUT_ENABLED === "true";

export default function BuyVip() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);
  const [access, setAccess] = useState(FREE_ACCESS);
  const [accessError, setAccessError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const returnState = params.get("checkout");

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      setUser(currentUser && !currentUser.is_anonymous ? currentUser : null);
      const next = await getBillingAccess();
      setAccess(next);
      setAccessError(false);
      if (currentUser && !currentUser.is_anonymous) {
        const { data, error: orderError } = await supabase.from("jb_billing_orders")
          .select("id,plan_code,status,created_at,provider_environment")
          .eq("user_id", currentUser.id)
          .eq("provider_environment", LIVE_ENABLED ? "live" : "test")
          .order("created_at", { ascending: false }).limit(5);
        if (!orderError) setOrders(data || []);
      } else setOrders([]);
    } catch (e) {
      console.error("Membership refresh failed", e);
      setAccess(FREE_ACCESS);
      setAccessError(true);
    } finally { setChecking(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(refresh, 15000);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); window.clearInterval(interval); };
  }, [refresh]);

  const startCheckout = async (planCode) => {
    if (!user || working) return;
    setError(""); setWorking(planCode);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Please log in again.");
      const functionName = LIVE_ENABLED ? "jb-paymongo-checkout-live" : "jb-billing-checkout-test";
      const body = LIVE_ENABLED ? { plan_code: planCode, request_id: crypto.randomUUID() } : { plan_code: planCode };
      const { data, error: invokeError } = await supabase.functions.invoke(functionName, { body });
      if (invokeError) {
        let message = invokeError.message;
        try { message = (await invokeError.context?.json())?.error || message; } catch { /* ignore */ }
        throw new Error(message);
      }
      const expected = LIVE_ENABLED ? "live" : "test";
      if (data?.environment !== expected || typeof data?.checkout_url !== "string") throw new Error("Invalid checkout response.");
      const url = new URL(data.checkout_url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.paymongo.com") throw new Error("Unexpected checkout destination.");
      window.location.assign(url.href);
    } catch (err) { setError(err?.message || "Checkout could not start."); setWorking(""); }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white px-4 py-8 md:py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <button onClick={() => navigate("/profile")} className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:text-white"><ArrowLeft size={16}/> Back to Profile</button>
        <header>
          <div className="mb-2 inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">{LIVE_ENABLED ? "LIVE CHECKOUT — SERVER LOCKS APPLY" : "PAYMONGO TEST MODE"}</div>
          <h1 className="text-3xl font-bold">Choose your membership</h1>
          <p className="mt-2 text-slate-400">One-time payment for one month of access. Automatic recurring charges are not enabled.</p>
        </header>
        {!LIVE_ENABLED && <div className="rounded-xl border border-amber-600/30 bg-amber-500/10 p-4 text-sm text-amber-100"><AlertTriangle className="mr-2 inline" size={17}/> TEST transactions never activate LIVE membership.</div>}
        <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">
          <div className="flex items-center justify-between gap-3"><strong>Verified LIVE membership: {checking ? "Checking…" : access.tier.toUpperCase()}</strong><button onClick={refresh} disabled={refreshing} className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 disabled:opacity-50"><RefreshCw size={15}/> Refresh</button></div>
          {access.access_expires_at && <p className="mt-2 text-slate-300">Valid until {new Date(access.access_expires_at).toLocaleString()}</p>}
          {accessError && <p className="mt-2 text-amber-300">Could not verify membership. Paid privileges are not assumed.</p>}
        </section>
        {returnState === "returned" && <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm">Returned from PayMongo. Payment is not confirmed by the redirect. Membership will update after independent server verification. Use Refresh to check.</div>}
        {returnState === "cancelled" && <div className="rounded-xl border border-slate-700 p-4 text-sm">Checkout cancelled. No membership was activated by this redirect.</div>}
        {returnState === "test-return" && <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm">Returned from TEST checkout. TEST payments do not activate LIVE membership.</div>}
        {returnState === "test-cancel" && <div className="rounded-xl border border-slate-700 p-4 text-sm">TEST checkout cancelled.</div>}
        {error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        <div className="grid gap-5 md:grid-cols-2">{PLANS.map(plan => <section key={plan.code} className={`rounded-2xl border p-6 bg-slate-900 ${plan.code === "vip" ? "border-amber-500/60" : "border-slate-700"}`}>
          <h2 className="text-xl font-bold">{plan.name}</h2><div className="my-4 text-4xl font-extrabold">₱{plan.price}<span className="text-sm font-normal text-slate-400"> / month of access</span></div>
          <ul className="mb-8 space-y-3 text-sm text-slate-300">{plan.features.map(f => <li key={f} className="flex items-center gap-2"><Check size={16} className="text-emerald-400"/>{f}</li>)}</ul>
          <button disabled={checking || !user || Boolean(working)} onClick={() => startCheckout(plan.code)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-50"><CreditCard size={18}/>{working === plan.code ? "Preparing checkout…" : `${LIVE_ENABLED ? "Pay" : "TEST checkout"} — ₱${plan.price}`}</button>
        </section>)}</div>
        {!checking && !user && <p className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">Log in to start checkout.</p>}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="mb-3 flex items-center gap-2 font-semibold"><Lock size={17}/> Recent {LIVE_ENABLED ? "LIVE" : "TEST"} orders</h2>
          {orders.length === 0 ? <p className="text-sm text-slate-400">No orders to display.</p> : <div className="space-y-2 text-sm">{orders.map(order => <div key={order.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-800 py-2"><span className="uppercase">{order.plan_code}</span><span className="text-slate-400">{order.status}</span><span className="text-slate-500">{new Date(order.created_at).toLocaleString()}</span></div>)}</div>}
          <p className="mt-4 text-xs text-slate-500">Payment confirmation and membership activation happen on the server, never from browser redirects.</p>
        </section><p className="text-xs text-slate-500">Existing activation codes remain available through the separate Activate Code page.</p>
      </div>
    </main>
  );
}
