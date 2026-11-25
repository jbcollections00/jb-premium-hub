import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "../safety/safety-dashboard.css";
import { supabase } from "../../services/supabaseClient";

const categories = {
  suspected_child_exploitation: "Suspected child exploitation",
  suspected_nonconsensual_content: "Suspected non-consensual content",
  uncertain_age_or_consent: "Uncertain age or consent",
  copyright_or_rights: "Copyright or publication rights concern",
  other_safety_concern: "Other safety concern",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ReportingPanel() {
  const active = useRef(false);
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [reference, setReference] = useState("");
  const [category, setCategory] = useState("uncertain_age_or_consent");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    const result = await supabase.rpc("jb_my_safety_reporting_status_v1");
    if (!active.current) return;
    if (result.error) { setStatus(null); setHistory([]); throw new Error("Safety reporting is unavailable for this account."); }
    setStatus(result.data);
    if (result.data?.reporting_enabled) {
      const rows = await supabase.rpc("jb_my_safety_report_history_v1");
      if (!active.current) return;
      if (rows.error) { setHistory([]); throw new Error("Unable to load your report history."); }
      setHistory(rows.data || []);
    } else setHistory([]);
  }
  useEffect(() => {
    active.current = true;
    load().catch(e => { if (active.current) setError(e.message); }).finally(() => { if (active.current) setBusy(false); });
    return () => { active.current = false; };
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy || !status?.reporting_enabled || !uuid.test(reference.trim())) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await supabase.rpc("jb_submit_safety_report_v1", { p_case_reference: reference.trim(), p_category: category });
      if (!active.current) return;
      if (result.error || !result.data?.received) throw new Error("Report was not confirmed. Try again.");
      setNotice("Report received. This is not a clearance or takedown confirmation.");
      setReference("");
      await load();
    } catch (e) { if (active.current) setError(e.message); }
    finally { if (active.current) setBusy(false); }
  }
  return <main className="jbs-shell">
    <div className="jbs-top"><span className="jbs-brand">JB PREMIUM HUB <small>SAFETY WORKSPACE</small></span><Link className="jbs-secondary" to="/profile">← Back to Profile</Link></div>
    <header className="jbs-hero"><div className="jbs-kicker">MODERATOR WORKSPACE</div><h1>Safety Reporting</h1><p>Submit and track safety concerns using internal case references.</p></header>
    <aside className="jbs-warning">Do not attach, download, or redistribute suspected illegal material. This workspace does not enable private video access or publication.</aside>
    {error && <p className="jbs-error" role="alert">{error}</p>}
    {notice && <p className="jbs-notice" role="status">{notice}</p>}
    {busy && !status && <p role="status" className="jbs-panel">Loading account status…</p>}
    {status && <div className="jbs-stats">
      <div className="jbs-stat"><span>Onboarding</span><strong className="jbs-status-value">{status.onboarding_status}</strong><small>Independent verification status</small></div>
      <div className="jbs-stat"><span>Reports submitted</span><strong>{status.reports_submitted}</strong><small>Your total safety reports</small></div>
      <div className="jbs-stat"><span>Open reports</span><strong>{status.open_reports}</strong><small>Open or internally escalated</small></div>
    </div>}
    {status && !status.reporting_enabled && <p className="jbs-panel">Safety reporting is not enabled for this account.</p>}
    {status?.reporting_enabled && <>
      <form onSubmit={submit} className="jbs-panel jbs-form">
        <div><h2>Submit safety concern</h2><p className="jbs-muted">Provide metadata only. Use an existing internal case reference.</p></div>
        <label htmlFor="jbs-case">Internal case reference (UUID)</label><input id="jbs-case" required value={reference} onChange={e=>setReference(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" spellCheck={false} disabled={busy} />
        <label htmlFor="jbs-category">Concern category</label><select id="jbs-category" value={category} onChange={e=>setCategory(e.target.value)} disabled={busy}>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
        <button className="jbs-primary" disabled={busy || !uuid.test(reference.trim())} type="submit">{busy?"Processing…":"Submit safety report"}</button>
      </form>
      <section className="jbs-panel"><h2>Your report history</h2><p className="jbs-muted">Latest 100 reports for this account.</p>{history.length===0?<div className="jbs-empty">{busy?"Loading reports…":"No reports submitted."}</div>:<div className="jbs-table-scroll"><table><thead><tr><th>Concern / case reference</th><th>Status</th><th>Submitted</th></tr></thead><tbody>{history.map(row=><tr key={row.report_id}><td>{categories[row.category] || row.category}<small className="jbs-reference">{row.case_reference}</small></td><td><span className="jbs-chip">{row.status}</span></td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>}</section>
    </>}
  </main>;
}

export default function ModeratorSafetyReporting() {
  const [identity, setIdentity] = useState(undefined);
  useEffect(() => {
    let mounted = true;
    let authEventSeen = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true;
      if (mounted) setIdentity(session?.user?.id || null);
    });
    supabase.auth.getSession().then(({ data: result, error }) => {
      if (mounted && !authEventSeen) setIdentity(error ? null : result?.session?.user?.id || null);
    }).catch(() => { if (mounted && !authEventSeen) setIdentity(null); });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);
  if (identity === undefined) return <p>Checking session…</p>;
  if (!identity) return <p>Sign in to access safety reporting.</p>;
  return <ReportingPanel key={identity} />;
}
