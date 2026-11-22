import React, { useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import { DEFAULT_THUMBNAIL_URL, handleThumbnailLoadError } from "../../services/thumbnailDisplay";

function endpoint() {
  const base = String(import.meta.env.VITE_R2_SIGNER_URL || "").replace(/\/+$/, "");
  return (base ? base : "") + "/api/jb-admin-staging-upload";
}

async function request(action, args = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error("Admin sign-in required.");
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + data.session.access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...args }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "Review request failed.");
  return json;
}

const mb = (size) => (Number(size || 0) / 1048576).toFixed(1);

export default function AdminPublishingReview() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [reviewing, setReviewing] = useState(null);
  const [rights, setRights] = useState({});
  const [duplicateApproved, setDuplicateApproved] = useState({});
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");
  const [refreshNumber, setRefreshNumber] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorText("");
    request("review-list")
      .then((data) => { if (active) setItems(Array.isArray(data.items) ? data.items : []); })
      .catch((error) => { if (active) setErrorText(error.message || "Review queue unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshNumber]);

  const refresh = () => setRefreshNumber((old) => old + 1);

  const openReview = async (item) => {
    setErrorText("");
    setMessage("");
    setBusyId(item.id);
    try {
      const data = await request("review-video", { draftId: item.id });
      if (!data.url) throw new Error("Could not get private review video.");
      setReviewing({ id: item.id, url: data.url });
    } catch (error) {
      setErrorText(error.message || "Private preview unavailable.");
    } finally {
      setBusyId("");
    }
  };

  const publish = async (item) => {
    if (item.published || !rights[item.id]) return;
    if (item.possibleDuplicate && !duplicateApproved[item.id]) return;
    const confirmed = window.confirm(
      'Publish "' + item.filename + '" to the members-only library? ' +
      "This is a public-facing catalog change and can be reversed only with another admin action."
    );
    if (!confirmed) return;
    setBusyId(item.id);
    setErrorText("");
    setMessage("");
    try {
      const response = await request("publish", {
        draftId: item.id,
        rightsConfirmed: true,
        duplicateAcknowledged: Boolean(duplicateApproved[item.id]),
      });
      if (!response.published) throw new Error("Publication was not confirmed.");
      setMessage(response.alreadyPublished
        ? "Already published. No duplicate catalog item was created."
        : "Published to the protected member library. " +
          (response.thumbnailSavedToPublic
            ? "Automatic thumbnail published."
            : "Default JB logo used for the public cover; private preview retained."));
      setRights((p) => ({ ...p, [item.id]: false }));
      setReviewing(null);
      refresh();
    } catch (error) {
      setErrorText(error.message || "Could not publish this video.");
    } finally {
      setBusyId("");
    }
  };

  const pending = items.filter((item) => !item.published);
  const published = items.filter((item) => item.published);

  return (
    <section aria-label="Admin review and publishing" className="jbh-admin-panel space-y-4 rounded-2xl border border-sky-300/20 bg-slate-950/30 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-white">Review & Publish</h3>
          <p className="mt-1 text-xs text-slate-300">
            Watch private uploads and confirm publishing rights before making them
            visible in the protected member library.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={loading || Boolean(busyId)}
          className="min-h-10 rounded-lg border border-slate-500 px-3 py-2 text-xs font-bold text-slate-100 disabled:opacity-40">
          Refresh reviews
        </button>
      </div>
      <p className="text-xs text-slate-300" role="status">
        {loading ? "Loading review queue…" : pending.length + " awaiting review · " + published.length + " already published"}
      </p>
      {message && <p role="status" className="rounded-lg border border-emerald-400/30 p-3 text-sm text-emerald-200">{message}</p>}
      {errorText && <p role="alert" className="rounded-lg border border-rose-400/40 p-3 text-sm text-rose-200">{errorText}</p>}

      {!loading && items.length === 0 && (
        <p className="rounded-xl border border-slate-700 p-4 text-xs text-slate-300">
          No files awaiting review. Upload MP4 videos privately first.
        </p>
      )}
      <div className="space-y-4">
        {items.map((item) => (
          <article key={item.id} className="min-w-0 rounded-xl border border-white/10 bg-slate-900/70 p-3 sm:p-4">
            <div className="flex min-w-0 flex-wrap gap-3 sm:flex-nowrap">
              <img src={item.thumbnail || DEFAULT_THUMBNAIL_URL} onError={handleThumbnailLoadError}
                className="h-20 w-32 shrink-0 rounded-lg border border-white/10 object-contain"
                alt={"Private thumbnail for " + item.filename} />
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-bold text-white">{item.filename}</p>
                <p className="mt-1 text-xs text-slate-300">
                  {item.albumName} · {mb(item.sizeBytes)} MB
                </p>
                <p className="mt-1 text-xs font-semibold text-amber-200">
                  {item.published ? "Published · Protected member library" : "Private · Pending review"}
                </p>
                {item.possibleDuplicate && (
                  <p className="mt-1 text-xs text-amber-200">
                    Duplicate filename detected in your upload history. Verify the correct copy.
                  </p>
                )}
                {!item.albumVisible && (
                  <p className="mt-1 text-xs text-rose-200">
                    Destination album is hidden. Publishing is blocked until it is visible.
                  </p>
                )}
              </div>
            </div>
            {reviewing?.id === item.id && (
              <div className="mt-3 space-y-2 rounded-xl border border-sky-300/20 p-3">
                <video controls playsInline preload="metadata"
                  src={reviewing.url} className="max-h-[360px] w-full rounded-lg bg-black" />
                <button type="button" onClick={() => setReviewing(null)}
                  className="rounded-lg border border-slate-500 px-3 py-2 text-xs text-slate-100">
                  Close private preview
                </button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button"
                onClick={() => openReview(item)}
                disabled={Boolean(busyId)}
                className="min-h-10 rounded-lg border border-sky-500/50 px-3 py-2 text-xs font-semibold text-sky-100 disabled:opacity-40">
                {busyId === item.id ? "Checking…" : "Preview private video"}
              </button>
            </div>
            {!item.published && (
              <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                <label className="flex items-start gap-2 text-xs text-slate-100">
                  <input type="checkbox" className="mt-1 accent-sky-500"
                    checked={Boolean(rights[item.id])}
                    onChange={(event) => setRights((p) => ({ ...p, [item.id]: event.target.checked }))} />
                  <span>I reviewed this upload and confirm I have the necessary rights
                    or permission to publish the complete video and audio.</span>
                </label>
                {item.possibleDuplicate && (
                  <label className="flex items-start gap-2 text-xs text-amber-100">
                    <input type="checkbox" className="mt-1 accent-amber-500"
                      checked={Boolean(duplicateApproved[item.id])}
                      onChange={(event) => setDuplicateApproved((p) => ({ ...p, [item.id]: event.target.checked }))} />
                    <span>I checked the duplicate filenames and intentionally selected this copy.</span>
                  </label>
                )}
                <button type="button"
                  onClick={() => publish(item)}
                  disabled={
                    Boolean(busyId) || !rights[item.id] || !item.albumVisible ||
                    (item.possibleDuplicate && !duplicateApproved[item.id])
                  }
                  className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">
                  {busyId === item.id ? "Publishing…" : "Approve & Publish"}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        Publish is admin-only and rechecks the video object in private R2.
        No upload is published automatically. The public cover uses the JB logo
        if a verified public-thumbnail copy is not configured.
      </p>
    </section>
  );
}
