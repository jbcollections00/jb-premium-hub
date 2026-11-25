import React, { useEffect, useRef, useState } from 'react';
import { Link } from "react-router-dom";
import "../safety/safety-dashboard.css";
import { supabase } from '../../services/supabaseClient';

const categoryLabels = {
  suspected_child_exploitation: 'Suspected child exploitation',
  suspected_nonconsensual_content: 'Suspected non-consensual content',
  uncertain_age_or_consent: 'Uncertain age or consent',
  copyright_or_rights: 'Copyright or publication rights concern',
  other_safety_concern: 'Other safety concern',
};

function EscalationPanel({ userId }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef(false);
  const lock = useRef(false);
  async function load() {
    const { data, error: failure } = await supabase.rpc('jb_admin_safety_reports_v1');
    if (!active.current) return;
    if (failure) { setRows([]); throw new Error('Admin safety report access unavailable.'); }
    setRows(Array.isArray(data) ? data : []);
  }
  useEffect(() => {
    active.current = true;
    load().catch(e => { if (active.current) setError(e.message); })
      .finally(() => { if (active.current) setBusy(false); });
    return () => { active.current = false; };
  }, [userId]);
  async function action(reportId) {
    if (busy || lock.current) return;
    lock.current = true; setBusy(true); setNotice(''); setError('');
    try {
      if (reportId) {
        const { data, error: failure } = await supabase.rpc('jb_admin_escalate_safety_report_v1', { p_report_id: reportId });
        if (failure || data?.status !== 'escalated') throw new Error('Internal escalation was not confirmed.');
        if (active.current) setNotice('Internal escalation recorded. No external report or takedown has been confirmed.');
      }
      await load();
    } catch (e) { if (active.current) setError(e.message); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  return <main className="jbs-shell">
    <div className="jbs-top"><span className="jbs-brand">JB PREMIUM HUB <small>SAFETY WORKSPACE</small></span><Link className="jbs-secondary" to="/profile">← Back to Profile</Link></div>
    <header className="jbs-hero"><div className="jbs-kicker">ADMIN WORKSPACE</div><h1>Safety Escalations</h1><p>Track and escalate reported safety concerns.</p></header>
    <aside className="jbs-warning">Metadata-only safety queue. Suspected exploitation requires immediate specialist handling, restriction of access, and appropriate official reporting. Do not download, attach or redistribute suspected illegal material. Internal escalation does not clear, publish, remove or externally report content.</aside>
    {error && <p className="jbs-error" role="alert">{error}</p>}
    {notice && <p className="jbs-notice" role="status">{notice}</p>}
    {!error && !busy && <div className="jbs-stats"><div className="jbs-stat"><span>Loaded reports</span><strong>{rows.length}</strong><small>Latest queue entries (max 100)</small></div><div className="jbs-stat"><span>Open in loaded queue</span><strong>{rows.filter(r=>r.status==='open').length}</strong></div><div className="jbs-stat"><span>Escalated in loaded queue</span><strong>{rows.filter(r=>r.status==='escalated').length}</strong></div></div>}
    <section className="jbs-panel"><div className="jbs-section-head"><div><h2>Safety report queue</h2><p className="jbs-muted">Internal escalation records</p></div><button className="jbs-secondary" disabled={busy} onClick={()=>action(null)}>Refresh reports</button></div>
    {busy && <p role="status" className="jbs-muted">Processing…</p>}
    {!busy && !error && rows.length===0 && <div className="jbs-empty">No open or escalated reports.</div>}
    {!error && rows.map(row=><article className="jbs-report" key={row.report_id}><div className="jbs-section-head"><h3>{categoryLabels[row.category] || 'Safety concern'}</h3><span className="jbs-chip">{row.status}</span></div><p className="jbs-reference">Case reference: {row.case_reference}</p><p className="jbs-muted">Reported: {new Date(row.created_at).toLocaleString()}</p>{row.escalated_at && <p className="jbs-muted">Internally escalated: {new Date(row.escalated_at).toLocaleString()}</p>}{row.status==='open' && <button className="jbs-primary" disabled={busy} onClick={()=>action(row.report_id)}>Record internal escalation</button>}</article>)}
    </section>
  </main>;
}

export default function AdminSafetyEscalations() {
  const [identity, setIdentity] = useState(undefined);
  useEffect(() => {
    let mounted = true; let authEventSeen = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true;
      if (mounted) setIdentity(session?.user?.id || null);
    });
    supabase.auth.getSession().then(({data: result}) => {
      if (mounted && !authEventSeen) setIdentity(result?.session?.user?.id || null);
    }).catch(() => { if (mounted && !authEventSeen) setIdentity(null); });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);
  if (identity === undefined) return <p>Checking session…</p>;
  if (!identity) return <p>Sign in to access safety reports.</p>;
  return <EscalationPanel key={identity} userId={identity} />;
}
