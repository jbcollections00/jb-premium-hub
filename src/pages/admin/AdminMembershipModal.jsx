import React, { useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";

const DEFAULT_REASON = "Complimentary membership";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Invalid date"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function describeStatus(grant) {
  if (grant.revoked_at) return "Revoked";
  const now = Date.now();
  if (new Date(grant.effective_from).getTime() > now) return "Scheduled";
  if (new Date(grant.effective_until).getTime() <= now) return "Expired";
  return "Active";
}

function errorText(error) {
  // Supabase/Postgres can return specific validation errors; do not expose
  // authentication tokens, internal RPC payloads, or stack traces here.
  return error?.message || "Operation failed. Please retry.";
}

export default function AdminMembershipModal({ user, onClose }) {
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState("standard");
  const [days, setDays] = useState("30");
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [feedback, setFeedback] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadGrants() {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("jb_admin_membership_list", {
          p_user_id: user.id,
        });
        if (error) throw error;
        if (!cancelled) setGrants(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!cancelled) {
          setGrants([]);
          setFeedback(`Unable to read memberships: ${errorText(error)}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadGrants();
    return () => { cancelled = true; };
  }, [user.id, reload]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  const displayName = user.full_name || user.email || user.id;
  const parsedDays = Number(days);
  const validDays = Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 365;
  const cleanReason = reason.trim();
  const validReason = cleanReason.length >= 1 && cleanReason.length <= 300;
  const ready = !busy && !loading && validDays && validReason;

  async function runAction(action, label) {
    setBusy(true);
    setFeedback("");
    try {
      const { error } = await action();
      if (error) throw error;
      setFeedback(`${label} saved. Refresh the user's session to see updated billing access.`);
      setReload((n) => n + 1);
    } catch (error) {
      setFeedback(`${label} failed: ${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleGrant(event) {
    event.preventDefault();
    if (!ready) return;
    if (!window.confirm(`Grant ${plan.toUpperCase()} for ${parsedDays} day(s) to ${displayName}?`)) return;
    await runAction(
      () => supabase.rpc("jb_admin_membership_grant", {
        p_user_id: user.id,
        p_plan_code: plan,
        p_duration_days: parsedDays,
        p_reason: cleanReason,
      }),
      "Membership grant"
    );
  }

  async function handleExtend(grant) {
    if (!ready) return;
    if (!window.confirm(`Extend this ${grant.plan_code.toUpperCase()} grant by ${parsedDays} day(s)?`)) return;
    await runAction(
      () => supabase.rpc("jb_admin_membership_extend", {
        p_grant_id: grant.id,
        p_add_days: parsedDays,
        p_reason: cleanReason,
      }),
      "Membership extension"
    );
  }

  async function handleRevoke(grant) {
    if (busy || loading || !validReason) return;
    if (!window.confirm(`Revoke this ${grant.plan_code.toUpperCase()} complimentary grant for ${displayName}? Paid memberships are not affected.`)) return;
    await runAction(
      () => supabase.rpc("jb_admin_membership_revoke", {
        p_grant_id: grant.id,
        p_reason: cleanReason,
      }),
      "Membership revocation"
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-3 sm:p-6" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={`Manage membership for ${displayName}`} className="jbh-admin-dialog max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border text-white shadow-2xl">
        <div className="jbh-admin-dialog-head sticky top-0 z-10 flex items-start justify-between gap-4 border-b p-5 sm:p-6">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold tracking-tight">Membership management</h2>
            <p className="text-sm text-slate-300 break-words">{displayName}</p>
            <p className="font-mono text-[10px] text-slate-500 break-all">{user.id}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="jbh-admin-dialog-quiet rounded-xl px-4 py-2 text-sm disabled:opacity-40">Close</button>
        </div>

        <div className="p-4 sm:p-5 space-y-5">
          <p className="text-xs text-slate-400">
            These controls create, extend, or revoke <strong>complimentary</strong> membership grants.
            Paid PayMongo memberships are separate and are not edited here. The website uses the highest
            valid access tier; media RLS and private-media authorization must also allow that tier.
          </p>

          <form onSubmit={handleGrant} className="jbh-admin-dialog-section space-y-4 rounded-2xl p-5">
            <h3 className="font-bold text-sm text-amber-400">Grant STANDARD / VIP</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs text-slate-300 space-y-1 flex flex-col">
                Membership plan
                <select value={plan} onChange={(e) => setPlan(e.target.value)} disabled={busy} className="p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white">
                  <option value="standard">STANDARD — video + ads, no download</option>
                  <option value="vip">VIP — video + download, no ads</option>
                </select>
              </label>
              <label className="text-xs text-slate-300 space-y-1 flex flex-col">
                Duration / extension (days, 1–365)
                <input type="number" inputMode="numeric" min="1" max="365" step="1" value={days} onChange={(e) => setDays(e.target.value)} disabled={busy} className="p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
              </label>
            </div>
            <label className="text-xs text-slate-300 space-y-1 flex flex-col">
              Audit reason (required; up to 300 characters)
              <input type="text" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} className="p-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white" />
            </label>
            <button type="submit" disabled={!ready} className="jbh-admin-dialog-primary px-5 py-3 text-sm font-bold disabled:opacity-40">
              {busy ? "Saving..." : `Grant ${plan.toUpperCase()}`}
            </button>
          </form>

          {feedback && <p role="status" className="text-xs text-amber-300 border border-slate-700 bg-slate-900 rounded-lg p-3 break-words">{feedback}</p>}

          <section aria-label="Complimentary membership history" className="space-y-3">
            <h3 className="text-sm font-black">Complimentary Grant History</h3>
            {loading ? <p className="text-xs text-slate-400">Loading memberships...</p> : grants.length === 0 ? (
              <p className="text-xs text-slate-500">No complimentary membership grants for this user.</p>
            ) : (
              <div className="space-y-2">
                {grants.map((grant) => {
                  const status = describeStatus(grant);
                  return (
                    <div key={grant.id} className="jbh-admin-dialog-section space-y-2 rounded-xl p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-black text-xs text-white">{String(grant.plan_code).toUpperCase()}</span>
                        <span className={`text-xs font-semibold ${status === "Active" ? "text-emerald-400" : "text-slate-400"}`}>{status}</span>
                      </div>
                      <div className="text-xs text-slate-400">Starts: {formatDate(grant.effective_from)}</div>
                      <div className="text-xs text-slate-400">Expires: {formatDate(grant.effective_until)}</div>
                      {grant.revoked_at && <div className="text-xs text-rose-400">Revoked: {formatDate(grant.revoked_at)}</div>}
                      <div className="text-xs text-slate-500 break-words">Reason: {grant.reason}</div>
                      {!grant.revoked_at && (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={!ready} onClick={() => handleExtend(grant)} className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-sky-700 hover:bg-sky-600 disabled:opacity-40">Extend +{validDays ? parsedDays : "?"} days</button>
                          <button type="button" disabled={busy || loading || !validReason} onClick={() => handleRevoke(grant)} className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-rose-950 border border-rose-700 text-rose-300 hover:bg-rose-900 disabled:opacity-40">Revoke grant</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
