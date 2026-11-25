import React, { useState } from "react";
import { supabase } from "../../services/supabaseClient";

const SCOPES = [
  { value: "private_video", title: "Private videos" },
  { value: "private_thumbnail", title: "Private thumbnails" },
  { value: "public_thumbnail", title: "Published thumbnails" },
];
const MAX_PAGES_PER_SCOPE = 30;

function endpoint() {
  const base = String(import.meta.env.VITE_R2_SIGNER_URL || "").replace(/\/+$/, "");
  return (base || "") + "/api/jb-admin-staging-upload";
}
function prettyBytes(n) {
  if (!Number.isFinite(n)) return "—";
  return n >= 1024 * 1024 * 1024
    ? (n / 1024 ** 3).toFixed(2) + " GB"
    : n >= 1024 * 1024
      ? (n / 1024 ** 2).toFixed(1) + " MB"
      : (n / 1024).toFixed(1) + " KB";
}

export default function AdminR2OrphanAudit() {
  const [scanning, setScanning] = useState(false);
  const [reports, setReports] = useState([]);
  const [errorText, setErrorText] = useState("");
  const [lastScanned, setLastScanned] = useState("");

  async function scan() {
    if (scanning) return;
    setScanning(true);
    setReports([]);
    setErrorText("");
    const completed = [];
    try {
      const { data, error } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (error || !token) throw new Error("Sign in as an administrator again.");

      for (const scope of SCOPES) {
        let cursor = null;
        const report = {
          ...scope, bucket: null, scannedObjects: 0, referenced: 0,
          recentProtected: 0, suspectedOrphans: 0, suspectedBytes: 0,
          examples: [], pages: 0, complete: false,
        };
        for (let page = 0; page < MAX_PAGES_PER_SCOPE; page++) {
          const response = await fetch(endpoint(), {
            method: "POST",
            headers: {
              Authorization: "Bearer " + token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "orphan-audit", scope: scope.value,
              ...(cursor ? { cursor } : {}) }),
            cache: "no-store",
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            // Public thumbnail bucket may not be configured; show this as
            // unscanned, never as zero or a clean bill of health.
            throw new Error(scope.title + ": " +
              (payload.error || "Unable to complete R2 inventory."));
          }
          if (payload.readOnly !== true || payload.scope !== scope.value) {
            throw new Error(scope.title + ": unexpected audit response.");
          }
          report.bucket = payload.bucket;
          report.pages++;
          for (const field of ["scannedObjects", "referenced", "recentProtected",
            "suspectedOrphans", "suspectedBytes"]) {
            report[field] += Number(payload[field]) || 0;
          }
          if (Array.isArray(payload.samples)) {
            report.examples.push(...payload.samples.slice(0,
              Math.max(0, 12 - report.examples.length)));
          }
          cursor = payload.hasMore ? payload.nextCursor : null;
          if (!payload.hasMore) {
            report.complete = true;
            break;
          }
          if (!cursor) throw new Error(scope.title + ": R2 scan cursor missing.");
        }
        completed.push(report);
        setReports([...completed]);
        if (!report.complete) {
          throw new Error(scope.title + ": safety page limit reached. Results are partial; no cleanup should be authorized.");
        }
      }
      setLastScanned(new Date().toLocaleString());
    } catch (error) {
      setErrorText(error.message || "Inventory scan failed.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <section className="rounded-2xl border border-sky-400/25 bg-slate-950/40 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-white">Cloudflare R2 Orphan File Audit</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-300">
            Compare private videos, private thumbnails, and published thumbnails
            against live Supabase references. Only objects older than 72 hours
            without a matching reference are flagged as <strong>suspected</strong> orphans.
            Other buckets and legacy URLs are not audited here.
          </p>
        </div>
        <button type="button" disabled={scanning} onClick={scan}
          className="min-h-10 rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50">
          {scanning ? "Scanning R2 inventory…" : "Run read-only R2 scan"}
        </button>
      </div>
      <p className="mt-3 text-xs font-semibold text-emerald-300">
        Read-only: This tool never deletes, modifies, or automatically cleans files.
      </p>
      <p className="mt-2 text-xs text-slate-400">
        Published thumbnail scanning requires a configured separate public R2 bucket
        and its matching server-side assets origin. If this is not configured,
        the private scopes remain valid but the full three-scope audit stays incomplete.
      </p>
      {lastScanned && <p className="mt-2 text-xs text-slate-400">Completed: {lastScanned}</p>}
      {errorText && <p role="alert" className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-100">
        {errorText} {reports.length > 0 ? "Previous scopes may be complete, but the full audit is NOT complete." : ""}
      </p>}
      {reports.length > 0 && <div className="mt-5 grid gap-3 md:grid-cols-3">
        {reports.map((report) => (
          <div key={report.value} className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-200">
            <p className="font-extrabold text-white">{report.title}</p>
            <p className="mt-1 break-all text-slate-400">{report.bucket}</p>
            <p className="mt-3">Scanned: <strong>{report.scannedObjects}</strong></p>
            <p>Referenced: <strong>{report.referenced}</strong></p>
            <p>Recent/unknown age (protected): <strong>{report.recentProtected}</strong></p>
            <p>Suspected orphan objects: <strong>{report.suspectedOrphans}</strong></p>
            <p>Suspected bytes: <strong>{prettyBytes(report.suspectedBytes)}</strong></p>
            <p className={report.complete ? "mt-2 text-emerald-300" : "mt-2 text-amber-300"}>
              {report.complete ? "Scope scan complete" : "Partial scan — do not act on totals"}
            </p>
            {report.examples.length > 0 && <details className="mt-3">
              <summary className="cursor-pointer font-semibold text-sky-300">Show sample object keys</summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto break-all text-[10px] text-slate-400">
                {report.examples.map((entry) =>
                  <li key={entry.key}>{entry.key} · {prettyBytes(entry.bytes)}</li>)}
              </ul>
            </details>}
          </div>
        ))}
      </div>}
    </section>
  );
}
