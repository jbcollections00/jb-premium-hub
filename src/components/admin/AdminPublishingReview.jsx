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
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [rights, setRights] = useState({});
  const [duplicateApproved, setDuplicateApproved] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkRightsConfirmed, setBulkRightsConfirmed] = useState(false);
  const [bulkDuplicatesConfirmed, setBulkDuplicatesConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [errorText, setErrorText] = useState("");
  const [refreshNumber, setRefreshNumber] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorText("");
    request("review-list")
      .then((data) => {
        if (!active) return;
        // Server itself removes published links before signing private artwork.
        const rows = Array.isArray(data.items) ? data.items.filter((item) => !item.published) : [];
        setItems(rows);
        setSelectedIds((ids) => ids.filter((id) => rows.some((row) => row.id === id)));
      })
      .catch((error) => { if (active) setErrorText(error.message || "Review queue unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshNumber]);

  const refresh = () => setRefreshNumber((old) => old + 1);
  const notifyChanged = () => {
    setReviewing(null);
    refresh();
    window.dispatchEvent(new Event("jb-staging-changed"));
  };

  const selected = items.filter((item) => selectedIds.includes(item.id));
  const hasDuplicates = selected.some((item) => item.possibleDuplicate);
  const selectionReady = selected.length > 0 && selected.every((item) => item.albumVisible);

  const updateSelection = (ids) => {
    setSelectedIds(ids);
    // A changed selection needs a new deliberate rights/duplicate attestation.
    setBulkRightsConfirmed(false);
    setBulkDuplicatesConfirmed(false);
  };

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
    if (busyId || bulkBusy || !rights[item.id]) return;
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
            : "Saved private thumbnail available on Home; default public cover retained."));
      setRights((previous) => ({ ...previous, [item.id]: false }));
      updateSelection(selectedIds.filter((id) => id !== item.id));
      notifyChanged();
    } catch (error) {
      setErrorText(error.message || "Could not publish this video.");
    } finally {
      setBusyId("");
    }
  };

  const bulkPublish = async () => {
    if (bulkBusy || busyId || !selectionReady || !bulkRightsConfirmed ||
        (hasDuplicates && !bulkDuplicatesConfirmed)) return;
    if (!window.confirm(
      "Publish " + selected.length + " selected video(s) to the protected member library? " +
      "You confirm that you reviewed each selected video and have the rights to publish its video and audio. " +
      "Videos will become visible to subscribed members."
    )) return;

    setBulkBusy(true);
    setErrorText("");
    setMessage("");
    let completed = 0;
    const failed = [];
    try {
      // Sequential, authenticated, individually audited publishing.
      // The server rechecks staging, R2 object and duplicate attestation per video.
      for (const item of selected) {
        try {
          const response = await request("publish", {
            draftId: item.id,
            rightsConfirmed: true,
            duplicateAcknowledged: item.possibleDuplicate && bulkDuplicatesConfirmed,
          });
          if (!response.published) throw new Error("Publication not confirmed");
          completed += 1;
        } catch (error) {
          failed.push(item.filename + ": " + (error.message || "Rejected"));
        }
      }
      setMessage(completed + " video(s) approved and published.");
      if (failed.length) {
        setErrorText(failed.length + " video(s) could not be published: " + failed.slice(0, 3).join("; "));
      }
      setSelectedIds([]);
      setBulkRightsConfirmed(false);
      setBulkDuplicatesConfirmed(false);
      notifyChanged();
    } finally {
      setBulkBusy(false);
    }
  };

  const deleteDrafts = async (ids, all = false) => {
    if (bulkBusy || busyId || !ids.length) return;
    if (!window.confirm(
      "Permanently delete " + ids.length + " UNPUBLISHED upload(s), including their saved thumbnails? " +
      "Published member videos are protected and cannot be deleted here. This cannot be undone."
    )) return;
    if (all && window.prompt('Type DELETE ALL to confirm deleting ALL unpublished reviews:') !== "DELETE ALL") return;

    setBulkBusy(true);
    setErrorText("");
    setMessage("");
    let deleted = 0;
    const failures = [];
    try {
      for (let index = 0; index < ids.length; index += 50) {
        try {
          const result = await request("delete-unpublished", { draftIds: ids.slice(index, index + 50) });
          deleted += (result.deleted || []).length;
          if (result.rejected?.length) failures.push(result.rejected.length + " protected draft(s)");
          if (result.cleanupPending?.length) failures.push(result.cleanupPending.length + " draft(s) awaiting R2 automatic cleanup");
        } catch (error) {
          failures.push(error.message || "Deletion rejected");
        }
      }
      setMessage(deleted + " unpublished video draft(s) deleted.");
      if (failures.length) setErrorText("Some files need attention: " + failures.join("; "));
      updateSelection([]);
      notifyChanged();
    } finally {
      setBulkBusy(false);
    }
  };

  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  return (
    <section aria-label="Admin review and publishing" className="jbh-admin-panel space-y-4 rounded-2xl border border-sky-300/20 bg-slate-950/30 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-white">Review & Publish</h3>
          <p className="mt-1 text-xs text-slate-300">
            Select uploaded videos, verify each file and confirm publishing rights. Published videos
            automatically disappear from this private review list.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={loading || Boolean(busyId) || bulkBusy}
          className="min-h-10 rounded-lg border border-slate-500 px-3 py-2 text-xs font-bold text-slate-100 disabled:opacity-40">
          Refresh reviews
        </button>
      </div>
      <p className="text-xs text-slate-300" role="status">
        {loading ? "Loading review queue…" : items.length + " awaiting review · published videos are in Media Manager"}
      </p>
      {message && <p role="status" className="rounded-lg border border-emerald-400/30 p-3 text-sm text-emerald-200">{message}</p>}
      {errorText && <p role="alert" className="rounded-lg border border-rose-400/40 p-3 text-sm text-rose-200">{errorText}</p>}

      {!loading && items.length === 0 && (
        <p className="rounded-xl border border-slate-700 p-4 text-xs text-slate-300">
          No files awaiting review. Upload MP4 videos privately first.
        </p>
      )}

      {items.length > 0 && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/70 p-3">
          <label className="flex items-center gap-2 text-xs font-bold text-white">
            <input type="checkbox" aria-label="Select all videos awaiting review"
              checked={allSelected} disabled={bulkBusy || Boolean(busyId)}
              onChange={(event) => updateSelection(event.target.checked ? items.map((item) => item.id) : [])} />
            Select all pending videos ({items.length})
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!selected.length || bulkBusy || Boolean(busyId)}
              onClick={() => deleteDrafts(selectedIds)}
              className="rounded-lg border border-rose-400/40 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-40">
              Delete selected ({selected.length})
            </button>
            <button type="button" disabled={bulkBusy || Boolean(busyId)}
              onClick={() => deleteDrafts(items.map((item) => item.id), true)}
              className="rounded-lg border border-rose-400/40 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-40">
              Delete all unpublished reviews
            </button>
          </div>
          {selected.length > 0 && (
            <div className="space-y-2 border-t border-white/10 pt-3">
              <label className="flex items-start gap-2 text-xs text-slate-200">
                <input type="checkbox" className="mt-0.5 accent-sky-500"
                  checked={bulkRightsConfirmed} onChange={(event) => setBulkRightsConfirmed(event.target.checked)} />
                <span>I reviewed ALL selected videos and confirm I have permission to publish their complete video and audio.</span>
              </label>
              {hasDuplicates && (
                <label className="flex items-start gap-2 text-xs text-amber-200">
                  <input type="checkbox" className="mt-0.5 accent-amber-500"
                    checked={bulkDuplicatesConfirmed} onChange={(event) => setBulkDuplicatesConfirmed(event.target.checked)} />
                  <span>I checked the duplicate filenames and intentionally selected the correct copies.</span>
                </label>
              )}
              {!selectionReady && <p className="text-xs text-rose-200">Some selected albums are hidden. Make them visible before publishing.</p>}
              <button type="button" disabled={!selectionReady || !bulkRightsConfirmed ||
                  (hasDuplicates && !bulkDuplicatesConfirmed) || bulkBusy || Boolean(busyId)}
                onClick={bulkPublish}
                className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
                {bulkBusy ? "Processing…" : "Approve & Publish selected (" + selected.length + ")"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {items.map((item) => (
          <article key={item.id} className="min-w-0 rounded-xl border border-white/10 bg-slate-900/70 p-3 sm:p-4">
            <div className="flex min-w-0 flex-wrap gap-3 sm:flex-nowrap">
              <label className="inline-flex items-start gap-1 pt-1 text-xs text-white">
                <input type="checkbox" aria-label={"Select review video " + item.filename}
                  checked={selectedIds.includes(item.id)}
                  disabled={bulkBusy || Boolean(busyId)}
                  onChange={(event) => updateSelection(event.target.checked
                    ? [...selectedIds, item.id] : selectedIds.filter((id) => id !== item.id))} />
              </label>
              <img src={item.thumbnail || DEFAULT_THUMBNAIL_URL} onError={handleThumbnailLoadError}
                className="h-20 w-32 shrink-0 rounded-lg border border-white/10 object-contain"
                alt={"Private thumbnail for " + item.filename} />
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-bold text-white">{item.filename}</p>
                <p className="mt-1 text-xs text-slate-300">{item.albumName} · {mb(item.sizeBytes)} MB</p>
                <p className="mt-1 text-xs font-semibold text-amber-200">Private · Pending review</p>
                {item.possibleDuplicate && (
                  <p className="mt-1 text-xs text-amber-200">Duplicate filename detected in your upload history. Verify the correct copy.</p>
                )}
                {!item.albumVisible && (
                  <p className="mt-1 text-xs text-rose-200">Destination album is hidden. Publishing is blocked until it is visible.</p>
                )}
              </div>
            </div>
            {reviewing?.id === item.id && (
              <div className="mt-3 space-y-2 rounded-xl border border-sky-300/20 p-3">
                <video controls playsInline preload="metadata" src={reviewing.url}
                  className="max-h-[360px] w-full rounded-lg bg-black" />
                <button type="button" onClick={() => setReviewing(null)}
                  className="rounded-lg border border-slate-500 px-3 py-2 text-xs text-slate-100">
                  Close private preview
                </button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => openReview(item)}
                disabled={bulkBusy || Boolean(busyId)}
                className="min-h-10 rounded-lg border border-sky-500/50 px-3 py-2 text-xs font-semibold text-sky-100 disabled:opacity-40">
                {busyId === item.id ? "Checking…" : "Preview private video"}
              </button>
              <button type="button" onClick={() => deleteDrafts([item.id])}
                disabled={bulkBusy || Boolean(busyId)}
                className="min-h-10 rounded-lg border border-rose-400/40 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-40">
                Delete this draft
              </button>
            </div>
            <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
              <label className="flex items-start gap-2 text-xs text-slate-100">
                <input type="checkbox" className="mt-1 accent-sky-500"
                  checked={Boolean(rights[item.id])}
                  disabled={bulkBusy || Boolean(busyId)}
                  onChange={(event) => setRights((p) => ({ ...p, [item.id]: event.target.checked }))} />
                <span>I reviewed this upload and confirm I have the necessary rights
                  or permission to publish the complete video and audio.</span>
              </label>
              {item.possibleDuplicate && (
                <label className="flex items-start gap-2 text-xs text-amber-100">
                  <input type="checkbox" className="mt-1 accent-amber-500"
                    checked={Boolean(duplicateApproved[item.id])}
                    disabled={bulkBusy || Boolean(busyId)}
                    onChange={(event) => setDuplicateApproved((p) => ({ ...p, [item.id]: event.target.checked }))} />
                  <span>I checked the duplicate filenames and intentionally selected this copy.</span>
                </label>
              )}
              <button type="button" onClick={() => publish(item)}
                disabled={bulkBusy || Boolean(busyId) || !rights[item.id] || !item.albumVisible ||
                  (item.possibleDuplicate && !duplicateApproved[item.id])}
                className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">
                {busyId === item.id ? "Publishing…" : "Approve & Publish"}
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        Published videos are managed in Media Manager, not in this review queue.
        Admin-only publishing re-verifies private R2 objects. Deleting an unpublished
        draft removes its stored video and thumbnail; published media is protected.
      </p>
    </section>
  );
}
