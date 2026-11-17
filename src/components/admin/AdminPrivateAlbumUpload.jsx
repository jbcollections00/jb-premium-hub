import React, { useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";

// This uploader NEVER inserts into public.media. Every upload is a private
// R2 staging object, which is not visible on any public/paid video page.
const ALLOWED_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "avi"]);
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;

const basenameExtension = (fileName) =>
  String(fileName || "").toLowerCase().split(".").pop();

const getEndpoint = () => {
  const base = String(import.meta.env.VITE_R2_SIGNER_URL || "").replace(/\/+$/, "");
  return base
    ? base + "/api/jb-admin-staging-upload"
    : "/api/jb-admin-staging-upload";
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
  if (!response.ok) {
    throw new Error(payload?.error || "Private upload service unavailable.");
  }
  return payload;
}

export default function AdminPrivateAlbumUpload() {
  const [albums, setAlbums] = useState([]);
  const [albumId, setAlbumId] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [results, setResults] = useState([]);
  const [existingDrafts, setExistingDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(true);

  const loadStaging = async () => {
    setDraftsLoading(true);
    try {
      const { data, error } = await supabase
        .from("jb_media_upload_staging")
        .select("id, album_id, original_filename, status, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setExistingDrafts(Array.isArray(data) ? data : []);
    } catch {
      // Missing staging migration is expected before setup; upload requests
      // will also fail closed until server-side staging is configured.
      setExistingDrafts([]);
    } finally {
      setDraftsLoading(false);
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
      setAlbums(rows);
      setAlbumId((previous) => rows.some((row) => row.id === previous) ? previous : "");
      setErrorText("");
    } catch {
      setErrorText("Unable to load album names. Check admin permissions and connection.");
      setAlbums([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAlbums(); loadStaging(); }, []);

  const selectFiles = (event) => {
    const selected = [...(event.target.files || [])];
    setResults([]);
    setFiles(selected);
    if (selected.some((file) =>
      !ALLOWED_EXTENSIONS.has(basenameExtension(file.name)) ||
      file.name.length > 200 ||
      file.size < 1 ||
      file.size > MAX_VIDEO_SIZE
    )) {
      setErrorText("Only MP4, MOV, WEBM, MKV or AVI files from 1 byte to 2 GB are accepted.");
    } else {
      setErrorText("");
    }
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
      file.name.length > 200 ||
      file.size < 1 ||
      file.size > MAX_VIDEO_SIZE
    )) {
      setErrorText("One or more video files are not supported.");
      return;
    }

    setBusy(true);
    setErrorText("");
    const completed = [];

    try {
      for (const file of files) {
        // Begin stores only admin-only staging metadata, then returns a short
        // lived signed PUT URL for the explicitly configured private bucket.
        const draft = await stagingRequest("begin", {
          albumId,
          fileName: file.name,
          fileSize: file.size,
        });

        if (
          !draft.uploadUrl ||
          draft.status === "published" ||
          !draft.draftId ||
          !draft.contentType
        ) {
          throw new Error("Private upload server returned an invalid staging response.");
        }

        // Files remain private; this URL is a temporary upload capability,
        // never a video playback or public download URL.
        const put = await fetch(draft.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": draft.contentType },
          body: file,
        });
        if (!put.ok) throw new Error("Private R2 upload failed for " + file.name + ".");

        const finished = await stagingRequest("complete", { draftId: draft.draftId });
        if (finished.status !== "pending_review") {
          throw new Error("Private R2 upload was not verified by the server.");
        }

        completed.push({ name: file.name, status: "Private · Pending review" });
        setResults([...completed]);
      }
      setFiles([]);
      await loadStaging();
      const picker = document.getElementById("jb-staged-video-files");
      if (picker) picker.value = "";
    } catch (error) {
      setErrorText((error?.message || "Private upload failed.") +
        " Any successfully uploaded files remain in private staging; no video was published.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-5" aria-label="Private video upload to album">
      <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-4 text-sm text-sky-100">
        <h3 className="font-extrabold">Private Album Upload</h3>
        <p className="mt-1 text-xs leading-relaxed">
          New files go to a private R2 staging bucket and are marked Pending Review.
          They do not appear on Home, Free to Watch, Most Watched, or member album pages.
          No public playback URL is generated.
        </p>
      </div>

      {errorText && (
        <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/40 p-3 text-sm text-rose-100">
          {errorText}
        </p>
      )}

      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-700 bg-slate-950/40 p-4 sm:p-6">
        <label htmlFor="jb-staging-album" className="block text-sm font-semibold text-white">
          Destination album
        </label>
        <div className="flex flex-wrap gap-3">
          <select
            id="jb-staging-album"
            value={albumId}
            disabled={busy || loading}
            required
            onChange={(event) => setAlbumId(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-sm text-white"
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
            className="rounded-xl border border-slate-600 px-4 py-2 text-xs font-bold text-slate-200 disabled:opacity-50"
          >
            Refresh albums
          </button>
        </div>

        <label htmlFor="jb-staged-video-files" className="block text-sm font-semibold text-white">
          Video files
        </label>
        <input
          id="jb-staged-video-files"
          type="file"
          accept=".mp4,.mov,.webm,.mkv,.avi,video/*"
          multiple
          disabled={busy}
          onChange={selectFiles}
          className="block w-full rounded-xl border border-slate-600 bg-slate-900 p-3 text-xs text-slate-200 file:mr-4 file:rounded-md file:border-0 file:bg-sky-700 file:px-3 file:py-2 file:text-white"
        />
        <p className="text-xs text-slate-400">
          Maximum 2 GB per file. Selected album: {albums.find((a) => a.id === albumId)?.name || "None"}.
          Original video content must be independently verified before any publication.
        </p>

        {files.length > 0 && (
          <ul className="space-y-1 text-xs text-slate-300" aria-label="Selected files">
            {files.map((file, index) => (
              <li key={index} className="break-all rounded-md bg-slate-900 p-2">
                {file.name} — {(file.size / (1024 * 1024)).toFixed(1)} MB
              </li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          disabled={busy || loading || !albumId || !files.length || Boolean(errorText)}
          className="rounded-xl bg-sky-700 px-5 py-3 text-sm font-extrabold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Uploading privately…" : "Upload to Private Staging"}
        </button>
      </form>

      <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-white">
            Private upload queue
          </h4>
          <button
            type="button"
            disabled={busy || draftsLoading}
            onClick={loadStaging}
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 disabled:opacity-50"
          >
            Refresh queue
          </button>
        </div>
        {draftsLoading ? (
          <p role="status" className="mt-3 text-xs text-slate-400">Loading private drafts…</p>
        ) : existingDrafts.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">
            No staged uploads yet. Only private pending-review records will appear here.
          </p>
        ) : (
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {existingDrafts.map((draft) => (
              <li key={draft.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-800 p-3 text-xs">
                <span className="min-w-0 break-all text-slate-200">{draft.original_filename}</span>
                <span className="font-semibold text-amber-200">
                  {draft.status === "pending_review" ? "Pending review" : "Upload incomplete"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {results.length > 0 && (
        <div role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-950/20 p-4">
          <h4 className="text-sm font-bold text-white">Completed private uploads</h4>
          <ul className="mt-2 space-y-1 text-xs text-emerald-200">
            {results.map((result, index) => (
              <li key={index} className="break-all">{result.name} — {result.status}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
