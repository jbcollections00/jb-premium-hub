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
  if (['paid', 'verified', 'active', 'processed', 'completed'].includes(s)) return 'bg-emerald-950 text-emerald-300 border-emerald-800';
  if (['pending', 'received', 'review_required', 'active_pending'].includes(s)) return 'bg-amber-950 text-amber-300 border-amber-800';
  if (['failed', 'rejected', 'error', 'cancelled', 'expired', 'refunded'].includes(s)) return 'bg-rose-950 text-rose-300 border-rose-800';
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


// Local CSV export, using a separate admin-protected, paginated RPC.
// Max 10,000 records per request; exports larger than this fail visibly (never truncate silently).
const EXPORT_BATCH_SIZE = 200;
const EXPORT_MAX_ROWS = 10000;
const CSV_FIELDS = {
  orders: [
    ['id','order_id'], ['user_id','user_id'], ['plan_code','plan'],
    ['billing_mode','billing_mode'], ['provider_environment','environment'],
    ['amount_centavos','amount_centavos'], ['currency','currency'],
    ['status','status'], ['paymongo_checkout_session_id','checkout_session_id'],
    ['paymongo_payment_id','payment_id'], ['paymongo_invoice_id','invoice_id'],
    ['subscription_id','subscription_id'], ['has_checkout_url','has_checkout_url'],
    ['created_at','created_at_utc'], ['updated_at','updated_at_utc'], ['paid_at','paid_at_utc'],
  ],
  webhooks: [
    ['id','id'], ['provider_environment','environment'],
    ['provider_event_id','event_id'], ['event_type','event_type'],
    ['provider_object_id','object_id'], ['processing_status','processing_status'],
    ['processing_error','processing_error'], ['received_at','received_at_utc'],
    ['processed_at','processed_at_utc'],
  ],
  diagnostics: [
    ['id','order_id'], ['user_id','user_id'], ['amount_centavos','amount_centavos'],
    ['currency','currency'], ['provider_environment','environment'],
    ['checkout_session_id','checkout_session_id'], ['has_checkout_url','has_checkout_url'],
    ['status','status'], ['checkout_attempt_state','recovery_state'],
    ['checkout_attempted_at','attempted_at_utc'], ['created_at','created_at_utc'],
    ['paid_at','paid_at_utc'],
  ],
};
const escapeCSV = (value) => {
  let text = value == null ? '' : String(value);
  // Defend against CSV / spreadsheet formula injection, including leading whitespace.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};
const makeCSV = (dataset, rows) => {
  const columns = CSV_FIELDS[dataset];
  return '\uFEFF' + [
    columns.map(([, name]) => escapeCSV(name)).join(','),
    ...rows.map((record) => columns.map(([key]) => escapeCSV(record[key])).join(',')),
  ].join('\r\n') + '\r\n';
};

export default function AdminBillingTab() {
  const [environment, setEnvironment] = useState('test');
  const [status, setStatus] = useState('all');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [page, setPage] = useState(0);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportSuccess, setExportSuccess] = useState('');
  const [monitor, setMonitor] = useState(null);
  const [monitorError, setMonitorError] = useState('');
  const [monitorLoading, setMonitorLoading] = useState(false);
  // Phase 121: TEST-only, admin-protected reconciliation audit history.
  const [verificationStatus, setVerificationStatus] = useState('all');
  const [verificationPage, setVerificationPage] = useState(0);
  const [verificationPayload, setVerificationPayload] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [selectedVerificationId, setSelectedVerificationId] = useState(null);


  const fetchBilling = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (signal.cancelled) return;
      if (authError || !user) throw new Error('Please sign in again.');
      const { data, error: rpcError } = await supabase.rpc('jb_admin_billing_dashboard_v2', {
        p_environment: environment,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
        p_status: status === 'all' ? null : status,
        p_search: search || null,
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
  }, [environment, status, page, search]);

  useEffect(() => {
    const signal = { cancelled: false };
    fetchBilling(signal);
    return () => { signal.cancelled = true; };
  }, [fetchBilling, refresh]);

  useEffect(() => {
    let cancelled = false;
    setMonitorLoading(true);
    setMonitor(null);
    setMonitorError('');
    const load = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error('Please sign in as an approved admin.');
        const { data, error: rpcError } = await supabase.rpc('jb_admin_billing_error_monitor_v1', {
          p_environment: environment,
        });
        if (rpcError) throw rpcError;
        if (!data || data.environment !== environment || !data.counts ||
            !Array.isArray(data.failed_orders) || !Array.isArray(data.pending_without_session) ||
            !Array.isArray(data.webhook_errors) || !Array.isArray(data.diagnostic_reviews)) {
          throw new Error('Error monitor returned an invalid response.');
        }
        if (!cancelled) setMonitor(data);
      } catch (e) {
        if (!cancelled) setMonitorError(e?.message || 'Unable to load error monitoring.');
      } finally {
        if (!cancelled) setMonitorLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [environment, refresh]);

  useEffect(() => {
    let cancelled = false;
    if (environment !== 'test') {
      setVerificationPayload(null);
      setVerificationError('');
      setVerificationLoading(false);
      return () => { cancelled = true; };
    }
    setVerificationLoading(true);
    setVerificationError('');
    setVerificationPayload(null);
    const loadVerifications = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error('Please sign in with an approved admin account.');
        const { data, error: rpcError } = await supabase.rpc('jb_admin_billing_verifications_v1', {
          p_environment: 'test',
          p_status: verificationStatus === 'all' ? null : verificationStatus,
          p_limit: PAGE_SIZE,
          p_offset: verificationPage * PAGE_SIZE,
        });
        if (rpcError) throw rpcError;
        if (!data || data.environment !== 'test' || !data.summary ||
            !Array.isArray(data.records) ||
            !Number.isSafeInteger(Number(data.filtered_total)) ||
            Number(data.filtered_total) < 0 || data.records.length > PAGE_SIZE ||
            !['total', 'verified', 'pending', 'rejected', 'errors'].every(
              (key) => Number.isSafeInteger(Number(data.summary[key])) && Number(data.summary[key]) >= 0
            )) {
          throw new Error('Payment verification service returned an invalid response.');
        }
        if (!cancelled) setVerificationPayload(data);
      } catch (e) {
        if (!cancelled) setVerificationError(e?.message || 'Unable to load verification history.');
      } finally {
        if (!cancelled) setVerificationLoading(false);
      }
    };
    loadVerifications();
    return () => { cancelled = true; };
  }, [environment, verificationStatus, verificationPage, refresh]);

  const summary = payload?.summary || {};
  const orders = Array.isArray(payload?.orders) ? payload.orders : [];
  const subscriptions = Array.isArray(payload?.subscriptions) ? payload.subscriptions : [];
  const webhooks = Array.isArray(payload?.webhook_events) ? payload.webhook_events : [];
  const diagnostics = Array.isArray(payload?.diagnostic_orders) ? payload.diagnostic_orders : [];
  const count = Number(payload?.matching_order_count || 0);
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;
  const applySearch = (event) => {
    event.preventDefault();
    const next = searchDraft.trim();
    if (next && !/^[a-zA-Z0-9_-]{1,100}$/.test(next)) {
      setError('Search must use letters, numbers, hyphens or underscores (max 100 characters).');
      return;
    }
    setSelectedOrderId(null);
    setPage(0);
    setPayload(null);
    setSearch(next);
    setRefresh((value) => value + 1);
  };
  const clearSearch = () => {
    setSearchDraft('');
    setSearch('');
    setRefresh((value) => value + 1);
    setSelectedOrderId(null);
    setPage(0);
    setPayload(null);
  };
  const downloadCSV = async (dataset) => {
    if (exporting || loading) return;
    setExporting(dataset);
    setExportError('');
    setExportSuccess('');
    const selectedEnvironment = environment;
    const selectedStatus = status === 'all' ? null : status;
    const selectedSearch = search || null;
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Sign in to your approved admin account again.');
      const records = [];
      let total = null;
      for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += EXPORT_BATCH_SIZE) {
        const { data, error: rpcError } = await supabase.rpc('jb_admin_billing_export_v1', {
          p_dataset: dataset,
          p_environment: selectedEnvironment,
          p_limit: EXPORT_BATCH_SIZE,
          p_offset: offset,
          p_status: dataset === 'orders' ? selectedStatus : null,
          p_search: dataset === 'orders' ? selectedSearch : null,
        });
        if (rpcError) throw rpcError;
        if (!data || data.dataset !== dataset || data.environment !== selectedEnvironment ||
            !Array.isArray(data.rows) || !Number.isSafeInteger(Number(data.total_count)) ||
            Number(data.total_count) < 0 || data.rows.length > EXPORT_BATCH_SIZE) {
          throw new Error('Export service returned an unexpected response.');
        }
        const pageTotal = Number(data.total_count);
        if (total === null) {
          total = pageTotal;
          if (total > EXPORT_MAX_ROWS) {
            throw new Error(`Report contains ${total} records. Export is limited to ${EXPORT_MAX_ROWS}; narrow the order filters first.`);
          }
        } else if (pageTotal !== total) {
          throw new Error('Records changed during export. Refresh and try again.');
        }
        records.push(...data.rows);
        if (records.length >= total) break;
        if (data.rows.length !== EXPORT_BATCH_SIZE) {
          throw new Error('Incomplete export response. No partial CSV was downloaded.');
        }
      }
      if (records.length !== total) {
        throw new Error('Export did not retrieve all records. No partial CSV was downloaded.');
      }
      const csv = makeCSV(dataset, records);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      const filtered = dataset === 'orders' && (selectedStatus || selectedSearch) ? '-filtered' : '';
      anchor.href = url;
      anchor.download = `jb-billing-${dataset}-${selectedEnvironment}${filtered}-${date}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Release the temporary browser object URL after the click is initiated.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportSuccess(`Exported ${records.length} ${dataset} record${records.length === 1 ? '' : 's'} from ${selectedEnvironment.toUpperCase()}. Keep the CSV private.`);
    } catch (e) {
      setExportError(e?.message || 'Unable to export billing records.');
    } finally {
      setExporting('');
    }
  };
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
        <select value={environment} onChange={(e) => { setEnvironment(e.target.value); setPage(0); setSelectedOrderId(null); setPayload(null); }}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"><option value="test">TEST</option><option value="live">LIVE</option></select></label>
      <label className="text-xs text-slate-300 space-y-1"><span className="block">Order status</span>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); setSelectedOrderId(null); setPayload(null); }}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white">
          <option value="all">All statuses</option>{['pending','paid','failed','cancelled','expired','refunded'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select></label>
      <p className="text-xs text-slate-500 pb-2">Times displayed in Philippine Time (PHT). Totals apply to the selected environment.</p>
    </div>
    <form onSubmit={applySearch} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
      <label className="min-w-56 flex-1 text-xs text-slate-300 space-y-1"><span className="block">Find membership order</span>
        <input type="search" autoComplete="off" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)}
          maxLength={100} placeholder="Order, user, session, payment or invoice ID"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500" />
      </label>
      <button type="submit" disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">Search</button>
      <button type="button" onClick={clearSearch} disabled={loading || (!search && !searchDraft)}
        className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 disabled:opacity-50">Clear</button>
      <p className="w-full text-xs text-slate-500">Server-side search across all membership orders in the selected environment. {search && <>Applied: <strong className="text-slate-300">{search}</strong></>}</p>
    </form>
    <Section title="Export billing reports" subtitle="Read-only CSV downloads for authorized administrators. Order export respects the currently applied Search, Status, and Environment filters; other reports use the selected Environment.">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!!exporting || loading || !payload} onClick={() => downloadCSV('orders')}
          className="rounded-lg border border-indigo-700 bg-indigo-700/20 px-4 py-2 text-sm font-medium text-indigo-100 hover:bg-indigo-800/40 disabled:opacity-40">
          {exporting === 'orders' ? 'Exporting orders…' : 'Export membership orders CSV'}
        </button>
        <button type="button" disabled={!!exporting || loading || !payload} onClick={() => downloadCSV('webhooks')}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-40">
          {exporting === 'webhooks' ? 'Exporting webhooks…' : 'Export webhook events CSV'}
        </button>
        {environment === 'test' && <button type="button" disabled={!!exporting || loading || !payload} onClick={() => downloadCSV('diagnostics')}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-40">
          {exporting === 'diagnostics' ? 'Exporting diagnostic orders…' : 'Export ₱1 diagnostic orders CSV'}
        </button>}
      </div>
      <p className="text-xs text-slate-400">All matching records up to {EXPORT_MAX_ROWS.toLocaleString('en-PH')} per report, not just the visible page. Files include billing identifiers; store securely and do not share publicly. Download is generated locally in your browser.</p>
      {exportError && <p role="alert" className="text-sm text-rose-300">Export failed: {exportError}</p>}
      {exportSuccess && <p role="status" className="text-sm text-emerald-300">{exportSuccess}</p>}
    </Section>
    <Section title="Checkout & webhook error monitor" subtitle="Read-only database monitoring · Most recent 20 rows per category · Refresh data to re-check">
      {monitorLoading && <p role="status" className="text-sm text-slate-400">Loading error monitoring…</p>}
      {monitorError && <p role="alert" className="text-sm text-rose-300">Error monitor unavailable: {monitorError}</p>}
      {monitor && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Failed orders', monitor.counts.failed_orders],
            ['Pending without session', monitor.counts.pending_without_session],
            ['Webhook errors', monitor.counts.webhook_errors],
            ['Diagnostic reviews', monitor.counts.diagnostic_reviews],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-bold text-white">{Number(value || 0)}</p>
          </div>)}
        </div>
        {Number(monitor.counts.stale_pending_without_session || 0) > 0 &&
          <p className="rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
            {monitor.counts.stale_pending_without_session} pending order(s) have no checkout session after 15 minutes.
            This is a review signal, not proof of a payment or gateway failure.
          </p>}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-white">Pending membership orders without checkout session</h3>
          <Table headers={['Created (PHT)', 'Order ID', 'Plan', 'Amount', 'Status']} empty="No matching pending orders." rows={monitor.pending_without_session.map((o) => <tr key={o.id}>
            <td className={cell}>{formatDate(o.created_at)}</td>
            <td className={cell} title={o.id}>{shortId(o.id)}</td>
            <td className={cell}>{o.plan_code}</td>
            <td className={cell}>{formatMoney(o.amount_centavos)}</td>
            <td className={cell}><Status value={o.status}/></td>
          </tr>)} />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-white">Failed membership orders</h3>
          <Table headers={['Created (PHT)', 'Order ID', 'Plan', 'Amount', 'Status']} empty="No failed orders recorded." rows={monitor.failed_orders.map((o) => <tr key={o.id}>
            <td className={cell}>{formatDate(o.created_at)}</td>
            <td className={cell} title={o.id}>{shortId(o.id)}</td>
            <td className={cell}>{o.plan_code}</td>
            <td className={cell}>{formatMoney(o.amount_centavos)}</td>
            <td className={cell}><Status value={o.status}/></td>
          </tr>)} />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-white">Webhook processing errors</h3>
          <Table headers={['Received (PHT)', 'Event ID', 'Type', 'Status', 'Error']} empty="No recorded webhook processing errors." rows={monitor.webhook_errors.map((w) => <tr key={w.id}>
            <td className={cell}>{formatDate(w.received_at)}</td>
            <td className={cell} title={w.provider_event_id}>{shortId(w.provider_event_id)}</td>
            <td className={cell}>{w.event_type}</td>
            <td className={cell}><Status value={w.processing_status}/></td>
            <td className="p-3 max-w-sm break-words text-rose-300">{w.processing_error || '—'}</td>
          </tr>)} />
        </div>
        {environment === 'test' && <div>
          <h3 className="mb-2 text-sm font-semibold text-white">₱1 diagnostic cases needing review</h3>
          <Table headers={['Created (PHT)', 'Order ID', 'Amount', 'Order status', 'Recovery']} empty="No diagnostic cases requiring review." rows={monitor.diagnostic_reviews.map((q) => <tr key={q.id}>
            <td className={cell}>{formatDate(q.created_at)}</td>
            <td className={cell} title={q.id}>{shortId(q.id)}</td>
            <td className={cell}>{formatMoney(q.amount_centavos)}</td>
            <td className={cell}><Status value={q.status}/></td>
            <td className={cell}><Status value={q.checkout_attempt_state}/></td>
          </tr>)} />
        </div>}
        <p className="text-xs text-slate-500">Only persisted database records are monitored. Edge Function HTTP 401/422/502 errors that were not stored in these tables will not appear. No automated remediation or payment status changes.</p>
      </>}
    </Section>
    {environment === 'test' && <Section
      title="Payment verification history"
      subtitle="Independent PayMongo TEST reconciliation audit · Read-only · No order status or membership changes"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="space-y-1 text-xs text-slate-300">
          <span className="block">Verification status</span>
          <select
            value={verificationStatus}
            onChange={(event) => {
              setVerificationStatus(event.target.value);
              setVerificationPage(0);
              setSelectedVerificationId(null);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="all">All statuses</option>
            {['pending', 'verified', 'rejected', 'error'].map((s) =>
              <option key={s} value={s}>{s}</option>
            )}
          </select>
        </label>
        <p className="text-xs text-slate-400">Latest records first · Times shown in Philippine Time (PHT)</p>
      </div>
      {verificationLoading && <p role="status" className="text-sm text-slate-400">Loading payment verification audit…</p>}
      {verificationError && <p role="alert" className="rounded-lg border border-rose-800 bg-rose-950/30 p-3 text-sm text-rose-200">
        Verification history unavailable: {verificationError}
      </p>}
      {verificationPayload && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ['Total audited', verificationPayload.summary.total],
            ['Pending', verificationPayload.summary.pending],
            ['Verified paid', verificationPayload.summary.verified],
            ['Rejected', verificationPayload.summary.rejected],
            ['Errors', verificationPayload.summary.errors],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-bold text-white">{Number(value)}</p>
          </div>)}
        </div>
        <p className="text-xs text-slate-500">Summary totals cover all TEST audit records, regardless of the selected status filter.</p>
        <Table
          headers={['Recorded (PHT)', 'Order ID', 'Checkout session', 'Status', 'Reason', 'Expected', 'Verified', 'Details']}
          empty="No matching TEST verification records."
          rows={verificationPayload.records.map((record) => <tr key={record.id}>
            <td className={cell}>{formatDate(record.created_at)}</td>
            <td className={cell} title={record.order_id || ''}>{shortId(record.order_id)}</td>
            <td className={cell} title={record.provider_checkout_session_id || ''}>{shortId(record.provider_checkout_session_id)}</td>
            <td className={cell}><Status value={record.verification_status} /></td>
            <td className={cell}>{record.verification_reason || '—'}</td>
            <td className={cell}>{record.expected_amount_centavos == null ? '—' : formatMoney(record.expected_amount_centavos)}</td>
            <td className={cell}>{record.verified_amount_centavos == null ? '—' : formatMoney(record.verified_amount_centavos)}</td>
            <td className={cell}><button
              type="button"
              onClick={() => setSelectedVerificationId((current) => current === record.id ? null : record.id)}
              aria-expanded={selectedVerificationId === record.id}
              className="rounded-lg border border-indigo-700 px-3 py-1.5 text-indigo-200 hover:bg-indigo-950"
            >{selectedVerificationId === record.id ? 'Hide' : 'View'}</button></td>
          </tr>)}
        />
        {verificationPayload.records.filter((record) => record.id === selectedVerificationId).map((record) =>
          <div key={record.id} className="rounded-xl border border-indigo-800 bg-slate-950 p-4" aria-label="Payment verification details">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-bold text-white">Verification audit details</h3>
              <button type="button" onClick={() => setSelectedVerificationId(null)} className="text-xs text-slate-300 hover:text-white">Close</button>
            </div>
            <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Audit ID', record.id],
                ['Order ID', record.order_id],
                ['Environment', record.provider_environment],
                ['Event ID', record.provider_event_id],
                ['Checkout session ID', record.provider_checkout_session_id],
                ['Payment ID', record.provider_payment_id],
                ['Status', record.verification_status],
                ['Reason', record.verification_reason],
                ['Expected amount', record.expected_amount_centavos == null ? '—' : formatMoney(record.expected_amount_centavos)],
                ['Verified amount', record.verified_amount_centavos == null ? '—' : formatMoney(record.verified_amount_centavos)],
                ['Currency', record.currency],
                ['Verified (PHT)', formatDate(record.verified_at)],
                ['Recorded (PHT)', formatDate(record.created_at)],
              ].map(([label, value]) => <div key={label} className="min-w-0">
                <dt className="mb-1 font-medium text-slate-400">{label}</dt>
                <dd className="break-all text-slate-100 select-text">{value == null || value === '' ? '—' : String(value)}</dd>
              </div>)}
            </dl>
            <p className="mt-3 text-xs text-amber-300">An audit entry is not proof of settled funds. This panel cannot mark orders paid or grant access.</p>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <span>Showing {Number(verificationPayload.filtered_total) === 0 ? 0 : verificationPage * PAGE_SIZE + 1}–{Math.min((verificationPage + 1) * PAGE_SIZE, Number(verificationPayload.filtered_total))} of {Number(verificationPayload.filtered_total)} matching audits</span>
          <div className="flex gap-2">
            <button type="button" disabled={verificationPage === 0 || verificationLoading}
              onClick={() => { setVerificationPage((value) => Math.max(0, value - 1)); setSelectedVerificationId(null); }}
              className="rounded-lg bg-slate-800 px-3 py-2 disabled:opacity-40">Previous</button>
            <button type="button"
              disabled={verificationLoading || (verificationPage + 1) * PAGE_SIZE >= Number(verificationPayload.filtered_total)}
              onClick={() => { setVerificationPage((value) => value + 1); setSelectedVerificationId(null); }}
              className="rounded-lg bg-slate-800 px-3 py-2 disabled:opacity-40">Next</button>
          </div>
        </div>
      </>}
      <p className="text-xs text-slate-500">Source: <code>jb_admin_billing_verifications_v1</code>. TEST-only reconciliation history, independently loaded from the billing orders. No automatic refresh; use Refresh data above.</p>
    </Section>}
    {error && <div role="alert" className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-200">
      <strong>Billing data unavailable.</strong> {error} <span className="block mt-1">If this is an authorization error, use your approved admin account. Do not bypass the RPC.</span>
    </div>}
    {loading && !payload && <p role="status" className="text-sm text-slate-400">Loading verified billing records…</p>}
    {payload && <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{metrics.map(([label,value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4">
        <p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-xl font-bold text-white break-words">{value ?? 0}</p></div>)}</div>
      <Section title="Membership orders" subtitle="Order status filter applies to this table. Summary totals do not change with the status filter.">
        <Table headers={['Created (PHT)','Order ID','User ID','Plan','Amount','Status','Checkout session','Payment ID','Details']} empty="No matching orders." rows={orders.map((o) => <tr key={o.id}>
          <td className={cell}>{formatDate(o.created_at)}</td><td className={cell} title={o.id}>{shortId(o.id)}</td>
          <td className={cell} title={o.user_id}>{shortId(o.user_id)}</td><td className={cell}>{o.plan_code}</td>
          <td className={cell}>{formatMoney(o.amount_centavos)}</td><td className={cell}><Status value={o.status}/></td>
          <td className={cell} title={o.paymongo_checkout_session_id || ''}>{shortId(o.paymongo_checkout_session_id)}</td>
          <td className={cell} title={o.paymongo_payment_id || ''}>{shortId(o.paymongo_payment_id)}</td>
          <td className={cell}><button type="button" onClick={() => setSelectedOrderId((current) => current === o.id ? null : o.id)}
            aria-expanded={selectedOrderId === o.id} className="rounded-lg border border-indigo-700 px-3 py-1.5 text-indigo-200 hover:bg-indigo-950">{selectedOrderId === o.id ? 'Hide' : 'View'}</button></td>
        </tr>)} />
        {selectedOrder && <div className="rounded-xl border border-indigo-800 bg-slate-950 p-4" aria-label="Selected order details">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-white">Membership order details</h3>
            <button type="button" onClick={() => setSelectedOrderId(null)} className="text-xs text-slate-300 hover:text-white">Close</button>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Order ID', selectedOrder.id], ['User ID', selectedOrder.user_id],
              ['Plan', selectedOrder.plan_code], ['Billing mode', selectedOrder.billing_mode],
              ['Environment', selectedOrder.provider_environment],
              ['Amount', formatMoney(selectedOrder.amount_centavos)],
              ['Currency', selectedOrder.currency], ['Status', selectedOrder.status],
              ['Checkout session ID', selectedOrder.paymongo_checkout_session_id],
              ['Payment ID', selectedOrder.paymongo_payment_id],
              ['Invoice ID', selectedOrder.paymongo_invoice_id],
              ['Subscription ID', selectedOrder.subscription_id],
              ['Checkout URL stored', selectedOrder.has_checkout_url ? 'Yes' : 'No'],
              ['Created (PHT)', formatDate(selectedOrder.created_at)],
              ['Updated (PHT)', formatDate(selectedOrder.updated_at)],
              ['Paid (PHT)', formatDate(selectedOrder.paid_at)],
            ].map(([label, value]) => <div key={label} className="min-w-0">
              <dt className="mb-1 font-medium text-slate-400">{label}</dt>
              <dd className="break-all text-slate-100 select-text">{value == null || value === '' ? '—' : String(value)}</dd>
            </div>)}
          </dl>
          <p className="mt-3 text-xs text-amber-300">Recorded database status only — not independent PayMongo settlement verification. This panel cannot change orders or memberships.</p>
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <span>Showing {count === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} of {count} matching orders</span>
          <div className="flex gap-2"><button type="button" disabled={page === 0 || loading} onClick={() => { setSelectedOrderId(null); setPage((n) => Math.max(0,n-1)); }} className="rounded-lg bg-slate-800 px-3 py-2 disabled:opacity-40">Previous</button>
          <button type="button" disabled={loading || (page + 1) * PAGE_SIZE >= count} onClick={() => { setSelectedOrderId(null); setPage((n) => n+1); }} className="rounded-lg bg-slate-800 px-3 py-2 disabled:opacity-40">Next</button></div>
        </div>
      </Section>
      <Section title="Subscriptions" subtitle={`Latest ${PAGE_SIZE} subscription records · ${environment.toUpperCase()} environment · Not paginated in backend v2`}>
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
      <p className="text-xs text-slate-500">Billing information is fetched from <code>jb_admin_billing_dashboard_v2</code>. Amounts shown as recorded in the database; no live settlement reconciliation is implied.</p>
    </>}
  </div>;
}
