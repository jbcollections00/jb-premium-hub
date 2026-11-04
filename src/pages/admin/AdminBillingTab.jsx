import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';

const PAGE_SIZE = 20;
const formatMoney = (centavos) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format((Number(centavos) || 0) / 100);
const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
};
const shortId = (value) => value ? `${String(value).slice(0, 12)}…` : '—';
const badgeColor = (status) => {
  const s = String(status || '').toLowerCase();
  if (['paid', 'active', 'processed', 'completed'].includes(s)) return 'bg-emerald-950 text-emerald-300 border-emerald-800';
  if (['pending', 'received', 'review_required', 'active_pending'].includes(s)) return 'bg-amber-950 text-amber-300 border-amber-800';
  if (['failed', 'error', 'cancelled', 'expired', 'refunded'].includes(s)) return 'bg-rose-950 text-rose-300 border-rose-800';
  return 'bg-slate-800 text-slate-300 border-slate-700';
};
function Status({ value }) {
  return <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${badgeColor(value)}`}>{value || '—'}</span>;
}
function Section({ title, subtitle, children }) {
  return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5 space-y-4">
    <div><h2 className="text-lg font-bold text-white">{title}</h2>{subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}</div>
    {children}
  </section>;
}
function Table({ headers, rows, empty }) {
  return <div className="overflow-x-auto rounded-xl border border-slate-800">
    <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap">
      <thead className="bg-slate-800 text-slate-300"><tr>{headers.map((h) => <th key={h} scope="col" className="p-3 font-semibold">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-800">{rows.length ? rows : <tr><td colSpan={headers.length} className="p-6 text-center text-slate-400">{empty}</td></tr>}</tbody>
    </table>
  </div>;
}
const cell = 'p-3 text-slate-300';

export default function AdminBillingTab() {
  const [environment, setEnvironment] = useState('test');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  const fetchBilling = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (signal.cancelled) return;
      if (authError || !user) throw new Error('Please sign in again.');
      const { data, error: rpcError } = await supabase.rpc('jb_admin_billing_dashboard_v1', {
        p_environment: environment,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
        p_status: status === 'all' ? null : status,
      });
      if (signal.cancelled) return;
      if (rpcError) throw rpcError;
      if (!data || typeof data !== 'object' || Array.isArray(data) || !data.summary) {
        throw new Error('Billing service returned an unexpected response.');
      }
      setPayload(data);
    } catch (e) {
      if (!signal.cancelled) { setPayload(null); setError(e?.message || 'Unable to load billing data.'); }
    } finally {
      if (!signal.cancelled) setLoading(false);
    }
  }, [environment, status, page]);

  useEffect(() => {
    const signal = { cancelled: false };
    fetchBilling(signal);
    return () => { signal.cancelled = true; };
  }, [fetchBilling, refresh]);

  const summary = payload?.summary || {};
  const orders = Array.isArray(payload?.orders) ? payload.orders : [];
  const subscriptions = Array.isArray(payload?.subscriptions) ? payload.subscriptions : [];
  const webhooks = Array.isArray(payload?.webhook_events) ? payload.webhook_events : [];
  const diagnostics = Array.isArray(payload?.diagnostic_orders) ? payload.diagnostic_orders : [];
  const count = Number(payload?.matching_order_count || 0);
  const metrics = [
    ['Total orders', summary.total_orders],
    ['Paid orders', summary.paid_orders],
    ['Pending orders', summary.pending_orders],
    ['Failed orders', summary.failed_orders],
    ['Recorded paid amount', formatMoney(summary.paid_amount_centavos)],
  ];

  return <div className="max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-black text-white">Billing & Payments</h1>
        <p className="mt-1 text-sm text-slate-400">Admin-only · Read-only monitoring · No payment or membership changes</p></div>
      <button type="button" onClick={() => setRefresh((v) => v + 1)} disabled={loading}
        className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
        {loading ? 'Refreshing…' : 'Refresh data'}
      </button>
    </div>
    <div className="flex flex-wrap gap-3 items-end">
      <label className="text-xs text-slate-300 space-y-1"><span className="block">Environment</span>
        <select value={environment} onChange={(e) => { setEnvironment(e.target.value); setPage(0); setPayload(null); }}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"><option value="test">TEST</option><option value="live">LIVE</option></select></label>
      <label className="text-xs text-slate-300 space-y-1"><span className="block">Order status</span>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); setPayload(null); }}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white">
          <option value="all">All statuses</option>{['pending','paid','failed','cancelled','expired','refunded'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select></label>
      <p className="text-xs text-slate-500 pb-2">Times displayed in Philippine Time (PHT). Totals apply to the selected environment.</p>
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-200">
      <strong>Billing data unavailable.</strong> {error} <span className="block mt-1">If this is an authorization error, use your approved admin account. Do not bypass the RPC.</span>
    </div>}
    {loading && !payload && <p role="status" className="text-sm text-slate-400">Loading verified billing records…</p>}
    {payload && <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{metrics.map(([label,value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
        <p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-xl font-bold text-white break-words">{value ?? 0}</p></div>)}</div>
      <Section title="Membership orders" subtitle="Order status filter applies to this table. Summary totals do not change with the status filter.">
        <Table headers={['Created (PHT)','Order ID','User ID','Plan','Amount','Status','Checkout session','Payment ID']} empty="No matching orders." rows={orders.map((o) => <tr key={o.id}>
          <td className={cell}>{formatDate(o.created_at)}</td><td className={cell} title={o.id}>{shortId(o.id)}</td>
          <td className={cell} title={o.user_id}>{shortId(o.user_id)}</td><td className={cell}>{o.plan_code}</td>
          <td className={cell}>{formatMoney(o.amount_centavos)}</td><td className={cell}><Status value={o.status}/></td>
          <td className={cell} title={o.paymongo_checkout_session_id || ''}>{shortId(o.paymongo_checkout_session_id)}</td>
          <td className={cell} title={o.paymongo_payment_id || ''}>{shortId(o.paymongo_payment_id)}</td>
        </tr>)} />
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <span>Showing {count === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} of {count} matching orders</span>
          <div className="flex gap-2"><button type="button" disabled={page === 0 || loading} onClick={() => setPage((n) => Math.max(0,n-1))} className="rounded-lg bg-slate-800 px-3 py-2 disabled:opacity-40">Previous</button>
          <button type="button" disabled={loading || (page + 1) * PAGE_SIZE >= count} onClick={() => setPage((n) => n+1)} className="rounded-lg bg-slate-800 px-3 py-2 disabled:opacity-40">Next</button></div>
        </div>
      </Section>
      <Section title="Subscriptions" subtitle={`Latest ${PAGE_SIZE} subscription records · ${environment.toUpperCase()} environment · Not paginated in backend v1`}>
        <Table headers={['Created (PHT)','User ID','Plan','Status','Period end','Auto cancel']} empty="No subscriptions recorded." rows={subscriptions.map((s) => <tr key={s.id}>
          <td className={cell}>{formatDate(s.created_at)}</td><td className={cell} title={s.user_id}>{shortId(s.user_id)}</td>
          <td className={cell}>{s.plan_code}</td><td className={cell}><Status value={s.status}/></td>
          <td className={cell}>{formatDate(s.period_end)}</td><td className={cell}>{s.cancel_at_period_end ? 'Yes' : 'No'}</td>
        </tr>)} />
      </Section>
      <Section title="PayMongo webhook events" subtitle={`Latest ${PAGE_SIZE} saved events · Logs unsigned/ignored requests may be absent`}>
        <Table headers={['Received (PHT)','Event ID','Type','Object ID','Processing','Error']} empty="No recorded webhook events." rows={webhooks.map((w) => <tr key={w.id}>
          <td className={cell}>{formatDate(w.received_at)}</td><td className={cell} title={w.provider_event_id}>{shortId(w.provider_event_id)}</td>
          <td className={cell}>{w.event_type}</td><td className={cell} title={w.provider_object_id || ''}>{shortId(w.provider_object_id)}</td>
          <td className={cell}><Status value={w.processing_status}/></td><td className="p-3 max-w-xs truncate text-rose-300" title={w.processing_error || ''}>{w.processing_error || '—'}</td>
        </tr>)} />
      </Section>
      {environment === 'test' && <Section title="₱1 QR Ph diagnostic orders" subtitle="Monitoring only · No checkout retry, mark-as-paid, or access activation controls">
        <Table headers={['Created (PHT)','Diagnostic order','Amount','Status','Recovery state','Session','Attempted (PHT)']} empty="No diagnostic orders." rows={diagnostics.map((q) => <tr key={q.id}>
          <td className={cell}>{formatDate(q.created_at)}</td><td className={cell} title={q.id}>{shortId(q.id)}</td>
          <td className={cell}>{formatMoney(q.amount_centavos)}</td><td className={cell}><Status value={q.status}/></td>
          <td className={cell}><Status value={q.checkout_attempt_state}/></td>
          <td className={cell} title={q.checkout_session_id || ''}>{shortId(q.checkout_session_id)}</td>
          <td className={cell}>{formatDate(q.checkout_attempted_at)}</td>
        </tr>)} />
      </Section>}
      <p className="text-xs text-slate-500">Billing information is fetched from <code>jb_admin_billing_dashboard_v1</code>. Amounts shown as recorded in the database; no live settlement reconciliation is implied.</p>
    </>}
  </div>;
}
