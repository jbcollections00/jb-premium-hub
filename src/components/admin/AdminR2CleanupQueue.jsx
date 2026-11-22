import React, { useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";

const API = "/api/jb-admin-staging-upload";

async function adminRequest(action) {
  const { data, error } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error("Admin session expired. Sign in again.");
  const response = await fetch(API, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "R2 cleanup service unavailable.");
  return payload;
}

export default function AdminR2CleanupQueue() {
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    adminRequest("cleanup-status")
      .then((data) => { if (active) setSummary(data); })
      .catch((error) => { if (active) setErrorText(error.message); });
    return () => { active = false; };
  }, []);

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setErrorText("");
    setMessage("");
    try {
      const data = await adminRequest(action);
      if (action === "retry-pending-r2-cleanup") {
        setMessage("Processed " + data.claimed + " queued object(s); " +
          data.completed + " confirmed deleted. Failed items remain queued for later retry.");
        setSummary(await adminRequest("cleanup-status"));
      } else {
        setSummary(data);
      }
    } catch (error) {
      setErrorText(error.message || "Cleanup status unavailable.");
    } finally {
      setBusy(false);
    }
  }

  const counts = summary?.counts || {};
  return (
    <section className="rounded-2xl border border-cyan-400/25 bg-slate-950/40 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-white">Automatic R2 Delete Cleanup</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-300">
            Published video and unpublished draft deletions queue exact private video,
            private thumbnail and matching public thumbnail copies for permanent R2 removal.
            Failed deletions are retried automatically by the daily production cron.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => run("cleanup-status")}
            className="rounded-lg border border-slate-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            Refresh cleanup status
          </button>
          <button type="button" disabled={busy} onClick={() => run("retry-pending-r2-cleanup")}
            className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Processing…" : "Retry pending now"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-amber-200">
        Only media explicitly deleted by an admin is cleaned up. The read-only orphan scan
        above never triggers deletion. The scheduled retry requires a configured CRON_SECRET
        on Vercel Production.
      </p>
      {errorText && <p role="alert" className="mt-3 text-xs text-amber-200">{errorText}</p>}
      {message && <p role="status" className="mt-3 text-xs text-emerald-300">{message}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Pending retry", counts.pending ?? "—"],
          ["Processing", counts.processing ?? "—"],
          ["Deleted & verified", counts.complete ?? "—"],
          ["Needs review", counts.blocked ?? "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
            <p className="text-xs text-slate-300">{label}</p>
            <p className="mt-1 text-xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>
      {summary?.truncated && <p className="mt-2 text-xs text-amber-300">
        Summary is truncated at 500 recent jobs; full history remains in Supabase.
      </p>}
      {summary?.blocked?.length > 0 && (
        <div className="mt-4 space-y-1">
          <p className="text-xs font-bold text-amber-300">Items requiring manual investigation</p>
          {summary.blocked.map((item, index) => (
            <p key={item.entityId + ":" + item.kind + ":" + index}
              className="break-all text-xs text-slate-300">
              {item.kind} · {item.attempts} attempts · {item.error || "Failed cleanup"}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
