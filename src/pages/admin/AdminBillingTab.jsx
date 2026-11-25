import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, CreditCard, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

const peso = (centavos) => {
  const amount = Number(centavos);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount / 100);
};

const dateText = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

const numberText = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-PH') : '—';
};

function MetricCard({ label, value, subtitle, icon: Icon, tone = 'blue' }) {
  return (
    <div className={`jbh-admin-kpi jbh-admin-kpi-${tone} relative overflow-hidden rounded-2xl p-5`}>
      <div className="relative z-10 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[.08em] text-slate-200">{label}</p>
        <Icon size={19} className="shrink-0 text-sky-200" aria-hidden="true" />
      </div>
      <p className="relative z-10 mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{value}</p>
      {subtitle && <p className="relative z-10 mt-2 text-xs leading-relaxed text-slate-300">{subtitle}</p>}
    </div>
  );
}

function StateLabel({ status, recorded }) {
  const raw = String(status || 'unknown').toLowerCase();
  const verified = raw === 'paid' && recorded;
  const label = verified ? 'Verified paid' :
    raw === 'pending' ? 'Pending checkout' :
    raw === 'paid' ? 'Review needed' :
    raw.replaceAll('_', ' ');
  const tone = verified
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
    : raw === 'pending'
      ? 'border-amber-300/25 bg-amber-300/10 text-amber-200'
      : 'border-rose-300/25 bg-rose-300/10 text-rose-200';
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

export default function AdminBillingTab() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const { data, error: requestError } = await supabase.rpc('jb_billing_admin_overview_v1');
      if (requestError) throw requestError;
      if (!data || data.read_only !== true || data.environment !== 'live') {
        throw new Error('Unexpected billing report response');
      }
      setReport(data);
    } catch (requestError) {
      console.error('Admin billing report unavailable:', requestError?.code || 'UNAVAILABLE');
      setError(true);
      if (!refresh) setReport(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = report?.metrics || {};
  const members = report?.memberships || {};
  const orders = Array.isArray(report?.recent_orders) ? report.recent_orders : [];
  const shownOrders = orders.filter((order) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'paid') return order.status === 'paid' && order.payment_recorded;
    if (statusFilter === 'pending') return order.status === 'pending';
    return !(order.status === 'pending' || (order.status === 'paid' && order.payment_recorded));
  });
  const activeKnown = members.available === true;

  return (
    <div className="jbh-admin-page space-y-6">
      <header className="jbh-admin-page-head flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-sky-100">Payments & access</p>
          <h1 className="mt-2">Billing & memberships</h1>
          <p className="mt-2 max-w-xl text-sm">
            Verified LIVE PayMongo transactions and current membership access.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-sky-100">
            <ShieldCheck size={15} aria-hidden="true" /> Read-only report · Server-authorized
          </p>
        </div>
        <button type="button" onClick={() => void load({ refresh: true })} disabled={loading || refreshing}
          className="jbh-admin-secondary inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold disabled:opacity-50">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
          {refreshing ? 'Refreshing…' : 'Refresh report'}
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-5 text-sm text-amber-100">
          <AlertCircle size={19} className="shrink-0" aria-hidden="true" />
          <span>Billing report is unavailable. Confirm that the admin-only reporting function has been installed in Supabase and your account is authorized. No billing records have been changed.</span>
        </div>
      )}

      {loading && !report ? (
        <div role="status" className="jbh-admin-panel p-8 text-sm text-slate-300">Loading verified billing records…</div>
      ) : report ? (
        <>
          <section aria-label="Verified payment totals" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            <MetricCard label="Verified payments" value={numberText(metrics.paid_orders)} subtitle="LIVE settled checkouts" icon={CheckCircle2} tone="mint" />
            <MetricCard label="Paid amount" value={peso(metrics.paid_gross_centavos)} subtitle="Gross paid orders · before refunds and fees" icon={Wallet} tone="blue" />
            <MetricCard label="Standard purchases" value={numberText(metrics.standard_paid_orders)} subtitle="Verified payment records, not active users" icon={CreditCard} tone="cyan" />
            <MetricCard label="VIP purchases" value={numberText(metrics.vip_paid_orders)} subtitle="Verified payment records, not active users" icon={ShieldCheck} tone="violet" />
            <MetricCard label="Active Standard" value={activeKnown ? numberText(members.active_standard) : '—'} subtitle={activeKnown ? 'Verified unexpired entitlements' : 'Entitlement dates not yet confirmed'} icon={CheckCircle2} tone="blue" />
            <MetricCard label="Active VIP" value={activeKnown ? numberText(members.active_vip) : '—'} subtitle={activeKnown ? 'Verified unexpired entitlements' : 'Entitlement dates not yet confirmed'} icon={ShieldCheck} tone="violet" />
            <MetricCard label="Pending checkouts" value={numberText(metrics.pending_checkouts)} subtitle="Unpaid checkouts are normal" icon={Clock3} tone="indigo" />
            <MetricCard label="Needs review" value={numberText(metrics.needs_review)} subtitle="Paid status without a recorded payment ID" icon={AlertCircle} tone="rose" />
          </section>

          <section className="jbh-admin-panel overflow-hidden rounded-3xl" aria-labelledby="billing-orders-title">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 px-5 py-5 sm:px-7">
              <div>
                <h2 id="billing-orders-title" className="text-lg font-extrabold">Recent checkout activity</h2>
                <p className="mt-1 text-sm text-slate-300">Latest 50 LIVE orders. No personal details or payment IDs.</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                Status
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2.5 text-sm" aria-label="Filter checkout status">
                  <option value="all">All orders</option>
                  <option value="paid">Verified paid</option>
                  <option value="pending">Pending</option>
                  <option value="other">Other / review</option>
                </select>
              </label>
            </div>
            {shownOrders.length === 0 ? (
              <div className="jbh-admin-empty m-5 text-sm">No checkout records match this filter.</div>
            ) : (
              <div className="jbh-admin-table overflow-x-auto">
                <table className="w-full min-w-[660px] text-left text-sm">
                  <thead><tr>
                    <th className="px-5 py-4">Checkout date</th>
                    <th className="px-5 py-4">Plan</th>
                    <th className="px-5 py-4">Amount</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Reference</th>
                  </tr></thead>
                  <tbody className="divide-y divide-white/10">
                    {shownOrders.map((order) => (
                      <tr key={order.order_id}>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-200">{dateText(order.created_at)}</td>
                        <td className="px-5 py-4 font-semibold text-white">{String(order.plan_code || 'Membership').toUpperCase()}</td>
                        <td className="whitespace-nowrap px-5 py-4 font-bold text-white">{order.currency === 'PHP' ? peso(order.amount_centavos) : '—'}</td>
                        <td className="px-5 py-4"><StateLabel status={order.status} recorded={order.payment_recorded} /></td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-300">{String(order.order_id || '').slice(0, 8).toUpperCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-slate-400">
            <span>Updated: {dateText(report.generated_at)}</span>
            <span>Pending checkout does not mean failed payment.</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
