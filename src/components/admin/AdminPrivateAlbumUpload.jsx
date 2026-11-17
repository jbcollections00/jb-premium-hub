import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../services/supabaseClient";

// Private staging only. These uploads never insert into public.media,
// create playback links, or publish files to member/public pages.
const ALLOWED_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "avi"]);
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;
const basenameExtension = (fileName) =>
  String(fileName || "").toLowerCase().split(".").pop();

const getEndpoint = () => {
  const base = String(import.meta.env.VITE_R2_SIGNER_URL || "").replace(/\/+$/, "");
  return base ? base + "/api/jb-admin-staging-upload" : "/api/jb-admin-staging-upload";
};

async function stagingRequest(action, params) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) {
    throw new Error("Admin sign-in required.");
  }
  const response = await fetch(getEndpoint(), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + data.session.access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...params }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Private upload service unavailable.");
  return payload;
}

// XHR is used only for the signed R2 PUT so we can display the actual
// number of bytes sent. fetch() does not expose browser upload progress.
function putPrivateObjectWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(file.size, Math.max(0, event.loaded)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size);
        resolve();
      } else {
        reject(new Error("Private R2 upload returned HTTP " + xhr.status + "."));
      }
    };
    xhr.onerror = () => reject(new Error("Private R2 upload failed. Check network and bucket CORS."));
    xhr.onabort = () => reject(new Error("Private upload was interrupted."));
    xhr.send(file);
  });
}

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const fileProgress = (item) => item.size > 0
  ? Math.round(clamp(item.loaded / item.size, 0, 1) * 100) : 0;

export default function AdminPrivateAlbumUpload() {
  const [albums, setAlbums] = useState([]);
  const [albumId, setAlbumId] = useState("");
  const [files, setFiles] = useState([]);
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [existingDrafts, setExistingDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const pickerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const updateQueue = (index, patch) => {
    if (!mountedRef.current) return;
    setQueue((previous) => previous.map((item, i) =>
      i === index ? { ...item, ...patch } : item
    ));
  };

  const loadStaging = async () => {
    setDraftsLoading(true);
    try {
      const { data, error } = await supabase
        .from("jb_media_upload_staging")
        .select("id, album_id, original_filename, status, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      if (mountedRef.current) setExistingDrafts(Array.isArray(data) ? data : []);
    } catch {
      if (mountedRef.current) setExistingDrafts([]);
    } finally {
      if (mountedRef.current) setDraftsLoading(false);
    }
  };

  const loadAlbums = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("jb_media_albums")
        .select("id, name, is_visible")
        .order("name", { ascending: true })
        .limit(200);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      if (mountedRef.current) {
        setAlbums(rows);
        setAlbumId((previous) => rows.some((row) => row.id === previous) ? previous : "");
        setErrorText("");
      }
    } catch {
      if (mountedRef.current) {
        setAlbums([]);
        setErrorText("Unable to load album names. Check admin permissions and connection.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => { loadAlbums(); loadStaging(); }, []);

  const totalBytes = useMemo(
    () => queue.reduce((total, item) => total + item.size, 0),
    [queue]
  );
  const sentBytes = useMemo(
    () => queue.reduce((total, item) => total + clamp(item.loaded, 0, item.size), 0),
    [queue]
  );
  const overallPercent = totalBytes > 0 ? Math.round(sentBytes / totalBytes * 100) : 0;
  const doneCount = queue.filter((item) => item.status === "done").length;
  const failedCount = queue.filter((item) => item.status === "failed").length;

  const selectFiles = (event) => {
    const selected = [...(event.target.files || [])];
    setFiles(selected);
    setQueue(selected.map((file) => ({
      name: file.name,
      size: file.size,
      loaded: 0,
      status: "queued",
      message: "",
    })));
    const invalid = selected.some((file) =>
      !ALLOWED_EXTENSIONS.has(basenameExtension(file.name)) ||
      file.name.length > 200 || file.size < 1 || file.size > MAX_VIDEO_SIZE
    );
    setErrorText(invalid
      ? "Use MP4, MOV, WEBM, MKV or AVI files between 1 byte and 2 GB each."
      : "");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy || !albumId || files.length === 0) return;
    if (!albums.some((album) => album.id === albumId)) {
      setErrorText("Please select a valid album.");
      return;
    }
    if (files.some((file) =>
      !ALLOWED_EXTENSIONS.has(basenameExtension(file.name)) ||
      file.name.length > 200 || file.size < 1 || file.size > MAX_VIDEO_SIZE
    )) {
      setErrorText("One or more video files are not supported.");
      return;
    }

    setBusy(true);
    setErrorText("");
    let failures = 0;
    try {
      // Upload one at a time to avoid exhausting mobile bandwidth or memory.
      // Continue to the next file when one file fails.
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        updateQueue(index, { status: "preparing", loaded: 0, message: "Preparing private upload…" });
        try {
          const draft = await stagingRequest("begin", {
            albumId,
            fileName: file.name,
            fileSize: file.size,
          });
          if (!draft.uploadUrl || draft.status === "published" || !draft.draftId || !draft.contentType) {
            throw new Error("Private upload server returned an invalid staging response.");
          }

          updateQueue(index, { status: "uploading", message: "Uploading to private R2…" });
          await putPrivateObjectWithProgress(draft.uploadUrl, file, draft.contentType, (loaded) => {
            updateQueue(index, { loaded, status: "uploading" });
          });

          updateQueue(index, {
            status: "verifying",
            loaded: file.size,
            message: "Verifying private file on server…",
          });
          const finished = await stagingRequest("complete", { draftId: draft.draftId });
          if (finished.status !== "pending_review") {
            throw new Error("Private R2 upload was not verified by the server.");
          }
          updateQueue(index, {
            status: "done",
            loaded: file.size,
            message: "Private · Pending review",
          });
        } catch (error) {
          failures += 1;
          updateQueue(index, {
            status: "failed",
            message: error?.message || "Private upload failed.",
          });
        }
      }

      await loadStaging();
      if (failures === 0) {
        setFiles([]);
        if (pickerRef.current) pickerRef.current.value = "";
      } else {
        // Allow reselecting files for a new attempt; do not silently
        // create duplicate staged drafts by restarting completed files.
        setFiles([]);
        if (pickerRef.current) pickerRef.current.value = "";
        setErrorText(
          failures + " file(s) could not finish private staging. Check the status below before starting a new batch. No files were published."
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (item) => {
    if (item.status === "done") return "Private · Pending review";
    if (item.status === "failed") return item.message;
    if (item.status === "verifying") return "Verifying upload…";
    if (item.status === "uploading") return "Uploading · " + fileProgress(item) + "%";
    if (item.status === "preparing") return "Preparing…";
    return "Queued";
  };

  return (
    <section className="min-w-0 space-y-5" aria-label="Private video upload to album">
      <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-4 text-sm text-sky-100">
        <h3 className="font-extrabold">Private Album Upload</h3>
        <p className="mt-1 text-xs leading-relaxed">
          Select an album and multiple video files. Uploads are stored privately,
          and tracked with per-file and overall progress. No public video links are created.
          All uploaded videos remain Pending Review.
        </p>
      </div>

      {errorText && (
        <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/40 p-3 text-sm text-rose-100">
          {errorText}
        </p>
      )}

      <form onSubmit={submit} className="min-w-0 space-y-5 rounded-2xl border border-slate-700 bg-slate-950/40 p-4 sm:p-6">
        <label htmlFor="jb-staging-album" className="block text-sm font-semibold text-white">
          Destination album
        </label>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
          <select
            id="jb-staging-album"
            value={albumId}
            disabled={busy || loading}
            required
            onChange={(event) => setAlbumId(event.target.value)}
            className="w-full min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-sm text-white"
          >
            <option value="">Select an album</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.name}{album.is_visible ? "" : " (Hidden)"}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || loading}
            onClick={loadAlbums}
            className="min-h-11 rounded-xl border border-slate-600 px-4 py-2 text-xs font-bold text-slate-200 disabled:opacity-50"
          >
            Refresh albums
          </button>
        </div>

        <label htmlFor="jb-staged-video-files" className="block text-sm font-semibold text-white">
          Video files (bulk selection)
        </label>
        <input
          ref={pickerRef}
          id="jb-staged-video-files"
          type="file"
          accept=".mp4,.mov,.webm,.mkv,.avi,video/*"
          multiple
          disabled={busy}
          onChange={selectFiles}
          className="block w-full min-w-0 rounded-xl border border-slate-600 bg-slate-900 p-3 text-xs text-slate-200 file:mr-4 file:rounded-md file:border-0 file:bg-sky-700 file:px-3 file:py-2 file:text-white"
        />
        <p className="text-xs text-slate-400">
          Maximum 2 GB per file. Album: {albums.find((a) => a.id === albumId)?.name || "None"}.
          Videos must be cleared before they can be published.
          Default JB logo is used for missing public thumbnail artwork; this intake does not extract video frames.
        </p>

        {queue.length > 0 && (
          <div aria-label="Bulk upload progress" className="min-w-0 space-y-3 rounded-xl border border-sky-400/20 bg-slate-900/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-100">
              <strong>{busy ? "Bulk upload in progress" : "Last batch"}</strong>
              <span>{doneCount}/{queue.length} completed · {failedCount} failed</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
              <span>Overall bytes transferred</span>
              <span className="tabular-nums">{overallPercent}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Overall upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={overallPercent}
              className="h-3 overflow-hidden rounded-full bg-slate-700"
            >
              <div className="h-full rounded-full bg-sky-400 transition-[width] duration-150" style={{ width: overallPercent + "%" }} />
            </div>
            <ul className="max-h-96 space-y-3 overflow-y-auto">
              {queue.map((item, index) => {
                const percent = fileProgress(item);
                return (
                  <li key={index} className="min-w-0 rounded-lg border border-slate-700/80 bg-slate-950/50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
                      <span className="min-w-0 flex-1 break-all text-slate-100">{item.name}</span>
                      <span className={
                        item.status === "failed" ? "text-rose-300" :
                        item.status === "done" ? "text-emerald-300" : "text-sky-200"
                      }>{statusLabel(item)}</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={"Upload " + item.name}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-700"
                    >
                      <div className={
                        "h-full rounded-full transition-[width] duration-150 " +
                        (item.status === "failed" ? "bg-rose-400" : item.status === "done" ? "bg-emerald-400" : "bg-sky-400")
                      } style={{ width: percent + "%" }} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {(item.size / 1048576).toFixed(1)} MB · {percent}% transferred
                      {item.status === "verifying" ? " · Server verification pending" : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-slate-400">
              100% transferred means bytes were sent. A file is completed only after server verification.
              Progress requires this browser tab to stay open.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || loading || !albumId || !files.length || Boolean(errorText)}
          className="min-h-11 w-full rounded-xl bg-sky-700 px-5 py-3 text-sm font-extrabold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {busy ? "Uploading privately…" : "Upload Selected Files Privately"}
        </button>
      </form>

      <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-white">Private upload queue</h4>
          <button
            type="button"
            disabled={busy || draftsLoading}
            onClick={loadStaging}
            className="min-h-10 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 disabled:opacity-50"
          >
            Refresh queue
          </button>
        </div>
        {draftsLoading ? (
          <p role="status" className="mt-3 text-xs text-slate-400">Loading private drafts…</p>
        ) : existingDrafts.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">No staged uploads yet.</p>
        ) : (
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {existingDrafts.map((draft) => (
              <li key={draft.id} className="flex min-w-0 flex-wrap justify-between gap-2 rounded-lg border border-slate-800 p-3 text-xs">
                <span className="min-w-0 break-all text-slate-200">{draft.original_filename}</span>
                <span className="font-semibold text-amber-200">
                  {draft.status === "pending_review" ? "Pending review" : "Upload incomplete"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
