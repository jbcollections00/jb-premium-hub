import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import { capturePrivateVideoPreview } from "../../services/privateVideoPreview";
import { fingerprintPrivateVideo, uploadResumablePrivateVideo } from "../../services/privateMultipartUpload";
import { DEFAULT_THUMBNAIL_URL, handleThumbnailLoadError } from "../../services/thumbnailDisplay";

// Private staging only. These uploads never insert into public.media,
// create playback links, or publish files to member/public pages.
const ALLOWED_EXTENSIONS = new Set(["mp4"]);
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;
// Until a transcoding workflow exists, only MP4 can be promoted to the
// protected production media library. Other codecs are not auto-published.
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
  const [showAlbumCreator, setShowAlbumCreator] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDescription, setNewAlbumDescription] = useState("");
  const [newAlbumVisible, setNewAlbumVisible] = useState(true);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [albumCreationMessage, setAlbumCreationMessage] = useState("");
  const [albumCreationError, setAlbumCreationError] = useState("");
  const [editingAlbumId, setEditingAlbumId] = useState("");
  const [editAlbumName, setEditAlbumName] = useState("");
  const [editAlbumDescription, setEditAlbumDescription] = useState("");
  const [editAlbumVisible, setEditAlbumVisible] = useState(true);
  const [editAlbumCoverStyle, setEditAlbumCoverStyle] = useState("indigo");
  const [savingAlbum, setSavingAlbum] = useState(false);
  const [albumEditMessage, setAlbumEditMessage] = useState("");
  const [albumEditError, setAlbumEditError] = useState("");
  const [files, setFiles] = useState([]);
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [existingDrafts, setExistingDrafts] = useState([]);
  const [privatePreviews, setPrivatePreviews] = useState({});
  const [selectedDraftIds, setSelectedDraftIds] = useState([]);
  const [deletingDrafts, setDeletingDrafts] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [draftsLoading, setDraftsLoading] = useState(true);
  const pickerRef = useRef(null);
  const mountedRef = useRef(true);
  const localPreviewUrls = useRef(new Set());
  const previewGenerationRef = useRef(0);
  const preselectedJpegs = useRef(new Map());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      previewGenerationRef.current += 1;
      preselectedJpegs.current.clear();
      for (const url of localPreviewUrls.current) URL.revokeObjectURL(url);
      localPreviewUrls.current.clear();
    };
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
      // Server excludes all published media through trusted publication links.
      const data = await stagingRequest("queue-list");
      const rows = Array.isArray(data.items) ? data.items : [];
      if (mountedRef.current) {
        setExistingDrafts(rows);
        setSelectedDraftIds((ids) => ids.filter((id) =>
          rows.some((row) => row.id === id && row.canDelete)
        ));
        setPrivatePreviews(Object.fromEntries(
          rows.filter((row) => row.thumbnail).map((row) => [row.id, row.thumbnail])
        ));
      }
    } catch {
      if (mountedRef.current) {
        setExistingDrafts([]);
        setSelectedDraftIds([]);
        setPrivatePreviews({});
      }
    } finally {
      if (mountedRef.current) setDraftsLoading(false);
    }
  };

  const deleteDrafts = async (ids, deleteAll = false) => {
    if (busy || deletingDrafts || !ids.length) return;
    const eligible = existingDrafts.filter((row) => row.canDelete && ids.includes(row.id));
    if (eligible.length !== ids.length) {
      setCleanupMessage("Some videos are no longer eligible for deletion. Refresh the queue.");
      return;
    }
    if (!window.confirm(
      "Permanently delete " + ids.length + " UNPUBLISHED private upload(s) and their saved thumbnails? " +
      (deleteAll ? "This includes ALL currently eligible unpublished drafts. " : "") +
      "Published videos are protected. This cannot be undone."
    )) return;
    if (deleteAll && window.prompt("Type DELETE ALL to permanently remove all eligible unpublished drafts:") !== "DELETE ALL") return;
    setDeletingDrafts(true);
    setCleanupMessage("");
    let deleted = 0;
    const errors = [];
    try {
      for (let index = 0; index < ids.length; index += 50) {
        const result = await stagingRequest("delete-unpublished", {
          draftIds: ids.slice(index, index + 50),
        });
        deleted += (result.deleted || []).length;
        if (result.rejected?.length) errors.push(result.rejected.length + " protected/rejected");
        if (result.cleanupPending?.length) errors.push(result.cleanupPending.length + " R2 cleanup pending");
      }
      setCleanupMessage(deleted + " unpublished upload(s) deleted." +
        (errors.length ? " Attention: " + errors.join(", ") + "." : ""));
    } catch (error) {
      setCleanupMessage("Deletion stopped: " + (error.message || "Unknown error") +
        ". Refresh the queue to see which items remain.");
    } finally {
      setSelectedDraftIds([]);
      setDeletingDrafts(false);
      await loadStaging();
      window.dispatchEvent(new Event("jb-staging-changed"));
    }
  };

  const eligibleDraftIds = existingDrafts.filter((row) => row.canDelete).map((row) => row.id);

  const loadAlbums = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("jb_media_albums")
        .select("id, name, description, is_visible, cover_style")
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

  // New albums use the existing authenticated admin-only RLS INSERT policy.
  // Do not send a service-role credential or create an album automatically.
  const createAlbum = async (event) => {
    event.preventDefault();
    if (creatingAlbum || busy) return;
    const name = newAlbumName.trim();
    const description = newAlbumDescription.trim();

    setAlbumCreationError("");
    setAlbumCreationMessage("");
    if (!name || name.length > 80) {
      setAlbumCreationError("Album name must be between 1 and 80 characters.");
      return;
    }
    if (description.length > 400) {
      setAlbumCreationError("Album description must be 400 characters or fewer.");
      return;
    }
    if (albums.some((album) => album.name.trim().toLocaleLowerCase() ===
        name.toLocaleLowerCase())) {
      setAlbumCreationError("An album with this name already exists. Select it instead.");
      return;
    }

    setCreatingAlbum(true);
    try {
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      const userId = userResult?.user?.id;
      if (userError || !userId) throw new Error("Admin sign-in expired. Please log in again.");

      // RLS requires current admin AND created_by = auth.uid().
      const { data: album, error: insertError } = await supabase
        .from("jb_media_albums")
        .insert({
          name,
          description,
          is_visible: newAlbumVisible,
          created_by: userId,
        })
        .select("id, name, description, is_visible, cover_style")
        .single();
      if (insertError || !album?.id) {
        throw new Error(insertError?.code === "42501"
          ? "Only administrators can create albums."
          : "Could not create album. Check your admin access and try again.");
      }
      if (!mountedRef.current) return;
      setAlbums((previous) => [
        ...previous.filter((item) => item.id !== album.id),
        album,
      ].sort((a, b) => a.name.localeCompare(b.name)));
      setAlbumId(album.id);
      setNewAlbumName("");
      setNewAlbumDescription("");
      setNewAlbumVisible(true);
      setShowAlbumCreator(false);
      setAlbumCreationMessage('Album "' + album.name + '" created and selected. You can now upload videos.');
      setErrorText("");
    } catch (error) {
      if (mountedRef.current) {
        setAlbumCreationError(error?.message || "Could not create the album.");
      }
    } finally {
      if (mountedRef.current) setCreatingAlbum(false);
    }
  };


  const startEditingAlbum = () => {
    const selectedAlbum = albums.find((album) => album.id === albumId);
    if (!selectedAlbum || busy || creatingAlbum || savingAlbum) return;
    setEditingAlbumId(selectedAlbum.id);
    setEditAlbumName(selectedAlbum.name || "");
    setEditAlbumDescription(selectedAlbum.description || "");
    setEditAlbumVisible(selectedAlbum.is_visible === true);
    setEditAlbumCoverStyle(selectedAlbum.cover_style || "indigo");
    setAlbumEditError("");
    setAlbumEditMessage("");
    setShowAlbumCreator(false);
  };

  const saveEditedAlbum = async () => {
    if (savingAlbum || busy || creatingAlbum || !editingAlbumId) return;
    const name = editAlbumName.trim();
    const description = editAlbumDescription.trim();
    const coverStyle = editAlbumCoverStyle;
    const allowedStyles = ["indigo", "ocean", "forest", "sunset", "violet", "slate"];
    setAlbumEditMessage("");
    setAlbumEditError("");

    if (!name || name.length > 80) {
      setAlbumEditError("Album name must be between 1 and 80 characters.");
      return;
    }
    if (description.length > 400 || !allowedStyles.includes(coverStyle)) {
      setAlbumEditError("Invalid album description or cover color.");
      return;
    }
    if (albums.some((album) => album.id !== editingAlbumId &&
      album.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setAlbumEditError("Another album already uses that name.");
      return;
    }

    setSavingAlbum(true);
    try {
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError || !userResult?.user?.id) {
        throw new Error("Admin session expired. Sign in again.");
      }
      // Existing Supabase RLS requires is_current_user_admin().
      // Only change display fields. IDs, owner, media and uploads are untouched.
      const { data: updated, error: updateError } = await supabase
        .from("jb_media_albums")
        .update({
          name,
          description,
          is_visible: editAlbumVisible,
          cover_style: coverStyle,
        })
        .eq("id", editingAlbumId)
        .select("id, name, description, is_visible, cover_style")
        .single();

      if (updateError || !updated?.id) {
        throw new Error(updateError?.code === "42501"
          ? "Only administrators can edit albums."
          : "Could not save album changes. Check admin permissions and refresh.");
      }
      if (!mountedRef.current) return;
      setAlbums((previous) => previous
        .map((album) => album.id === updated.id ? updated : album)
        .sort((a, b) => a.name.localeCompare(b.name)));
      setEditingAlbumId("");
      setAlbumEditMessage('Album "' + updated.name + '" updated. Existing videos were not changed.');
    } catch (error) {
      if (mountedRef.current) {
        setAlbumEditError(error?.message || "Could not save album changes.");
      }
    } finally {
      if (mountedRef.current) setSavingAlbum(false);
    }
  };

  useEffect(() => { loadAlbums(); loadStaging(); }, []);
  useEffect(() => {
    const refreshHandler = () => { if (!busy && !deletingDrafts) loadStaging(); };
    window.addEventListener("jb-staging-changed", refreshHandler);
    return () => window.removeEventListener("jb-staging-changed", refreshHandler);
  }, [busy, deletingDrafts]);

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

  const previewSelectedFiles = async (selected, generation) => {
    // To conserve memory on phones, preview at most the first 20 selected
    // files before upload. Additional files get previews as they upload.
    for (let index = 0; index < Math.min(selected.length, 20); index += 1) {
      if (!mountedRef.current || previewGenerationRef.current !== generation) return;
      const file = selected[index];
      if (!ALLOWED_EXTENSIONS.has(basenameExtension(file.name))) continue;
      const jpeg = await capturePrivateVideoPreview(file);
      if (!mountedRef.current || previewGenerationRef.current !== generation) return;
      if (!jpeg) continue;
      const previewUrl = URL.createObjectURL(jpeg);
      localPreviewUrls.current.add(previewUrl);
      preselectedJpegs.current.set(index, jpeg);
      updateQueue(index, { previewUrl });
    }
  };

  const selectFiles = (event) => {
    const selected = [...(event.target.files || [])];
    previewGenerationRef.current += 1;
    const generation = previewGenerationRef.current;
    preselectedJpegs.current.clear();
    for (const url of localPreviewUrls.current) URL.revokeObjectURL(url);
    localPreviewUrls.current.clear();
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
      ? "Use MP4 video files between 1 byte and 2 GB each."
      : "");
    if (!invalid) void previewSelectedFiles(selected, generation);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy || savingAlbum || editingAlbumId || !albumId || files.length === 0) return;
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
    // Cancel any in-progress preselection previews while processing the batch.
    previewGenerationRef.current += 1;
    setErrorText("");
    let failures = 0;
    try {
      // Upload one at a time to avoid exhausting mobile bandwidth or memory.
      // Continue to the next file when one file fails.
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        updateQueue(index, { status: "preparing", loaded: 0, message: "Preparing private upload…" });
        try {
          const largeFile = file.size >= 32 * 1024 * 1024;
          if (largeFile) updateQueue(index, { status: "preparing", message: "Fingerprinting video for safe resume…" });
          const fingerprint = largeFile ? await fingerprintPrivateVideo(file) : undefined;
          const draft = await stagingRequest("begin", {
            albumId,
            fileName: file.name,
            fileSize: file.size,
            ...(fingerprint ? { fingerprint } : {}),
          });
          if (draft.status === "published" || !draft.draftId || !draft.contentType ||
              (!draft.multipart && !draft.uploadUrl)) {
            throw new Error("Private upload server returned an invalid staging response.");
          }

          updateQueue(index, {
            status: "uploading",
            message: draft.multipart
              ? (draft.resumed ? "Resuming private R2 upload…" : "Uploading R2 chunks…")
              : "Uploading to private R2…",
          });
          let finished;
          if (draft.multipart) {
            finished = await uploadResumablePrivateVideo({
              file, draft, request: stagingRequest,
              onProgress: (loaded) => updateQueue(index, { loaded, status: "uploading" }),
              onStatus: (message) => updateQueue(index, { message, status: "uploading" }),
            });
          } else {
            await putPrivateObjectWithProgress(draft.uploadUrl, file, draft.contentType, (loaded) => {
              updateQueue(index, { loaded, status: "uploading" });
            });
            updateQueue(index, {
              status: "verifying", loaded: file.size,
              message: "Verifying private file on server…",
            });
            finished = await stagingRequest("complete", { draftId: draft.draftId });
          }
          updateQueue(index, {
            status: "verifying", loaded: file.size,
            message: "Verifying private file on server…",
          });
          if (finished.status !== "pending_review") {
            throw new Error("Private R2 upload was not verified by the server.");
          }
          // Only after the PRIVATE video is verified do we derive its poster.
          // The JPEG is uploaded back to the SAME private staging bucket,
          // with no writes to public.media or the public-assets bucket.
          let thumbnailSaved = false;
          const jpeg = preselectedJpegs.current.get(index) || await capturePrivateVideoPreview(file);
          if (jpeg) {
            const previewUrl = preselectedJpegs.current.has(index)
              ? undefined : URL.createObjectURL(jpeg);
            if (previewUrl) localPreviewUrls.current.add(previewUrl);
            updateQueue(index, {
              status: "thumbnail",
              loaded: file.size,
              ...(previewUrl ? { previewUrl } : {}),
              message: "Saving private video thumbnail…",
            });
            try {
              const thumb = await stagingRequest("thumbnail-begin", {
                draftId: draft.draftId,
                fileSize: jpeg.size,
              });
              if (!thumb.uploadUrl || thumb.contentType !== "image/jpeg") {
                throw new Error("Private thumbnail upload is unavailable.");
              }
              await putPrivateObjectWithProgress(thumb.uploadUrl, jpeg, "image/jpeg", () => {});
              const saved = await stagingRequest("thumbnail-complete", {
                draftId: draft.draftId,
                fileSize: jpeg.size,
              });
              thumbnailSaved = saved.status === "private_preview_saved";
            } catch {
              // Thumbnail failures do not undo a fully verified private video.
              // Show the locally generated image during this session and fall
              // back to the shared JB logo on a future visit if not persisted.
            }
          }
          updateQueue(index, {
            status: "done",
            loaded: file.size,
            message: thumbnailSaved
              ? "Private · Not published · Thumbnail saved"
              : "Private · Not published · Default cover on reload",
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
      preselectedJpegs.current.clear();
      if (failures === 0) {
        setFiles([]);
        if (pickerRef.current) pickerRef.current.value = "";
      } else {
        // Allow reselecting files for a new attempt; do not silently
        // create duplicate staged drafts by restarting completed files.
        setFiles([]);
        if (pickerRef.current) pickerRef.current.value = "";
        setErrorText(
          failures + " file(s) could not finish private staging. For large videos, reselect the exact same file to resume saved R2 chunks. No files were published."
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (item) => {
    if (item.status === "done") return item.message || "Private · Not published";
    if (item.status === "thumbnail") return "Saving private thumbnail…";
    if (item.status === "failed") return item.message;
    if (item.status === "verifying") return "Verifying upload…";
    if (item.status === "uploading") return "Uploading · " + fileProgress(item) + "%";
    if (item.status === "preparing") return "Preparing…";
    return "Queued";
  };

  return (
    <section className="min-w-0 space-y-5" aria-label="Private video upload to album">
      <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-4 text-sm text-sky-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-extrabold">Private Album Upload</h3>
          <button type="button"
            disabled={busy || creatingAlbum}
            onClick={() => {
              setShowAlbumCreator((previous) => !previous);
              setEditingAlbumId("");
              setAlbumEditError("");
              setAlbumEditMessage("");
              setAlbumCreationError("");
              setAlbumCreationMessage("");
            }}
            className="min-h-10 rounded-xl border border-sky-300/50 bg-sky-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {showAlbumCreator ? "Close album creator" : "+ Create New Album"}
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed">
          Select an album and multiple video files. Uploads are stored privately,
          and tracked with per-file and overall progress. No public video links are created.
          Files are not public. Availability on member pages requires content clearance.
        </p>
      </div>

      {albumCreationMessage && (
        <p role="status" className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {albumCreationMessage}
        </p>
      )}
      {showAlbumCreator && (
        <form onSubmit={createAlbum}
          aria-label="Create a new media album"
          className="space-y-4 rounded-2xl border border-sky-400/40 bg-slate-900/70 p-4 sm:p-5"
        >
          <div>
            <h4 className="font-extrabold text-white">Create a new album</h4>
            <p className="mt-1 text-xs text-slate-300">
              This creates an empty album. New videos will go to the selected album after upload.
            </p>
          </div>
          <div>
            <label htmlFor="jb-new-album-name" className="mb-1 block text-sm font-semibold text-white">
              Album name
            </label>
            <input id="jb-new-album-name" type="text" required maxLength={80}
              value={newAlbumName}
              onChange={(event) => setNewAlbumName(event.target.value)}
              disabled={creatingAlbum || busy}
              placeholder="e.g. Learning Videos"
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white"
            />
          </div>
          <div>
            <label htmlFor="jb-new-album-description" className="mb-1 block text-sm font-semibold text-white">
              Description (optional)
            </label>
            <textarea id="jb-new-album-description" rows={2} maxLength={400}
              value={newAlbumDescription}
              onChange={(event) => setNewAlbumDescription(event.target.value)}
              disabled={creatingAlbum || busy}
              placeholder="Briefly describe the album content"
              className="w-full resize-y rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white"
            />
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-white">
            <input type="checkbox" checked={newAlbumVisible}
              onChange={(event) => setNewAlbumVisible(event.target.checked)}
              disabled={creatingAlbum || busy}
              className="mt-1 h-4 w-4 accent-sky-500"
            />
            <span>
              <strong>Visible to eligible members</strong>
              <span className="block text-xs text-slate-300">
                Uncheck to keep the album hidden while preparing its content.
              </span>
            </span>
          </label>
          {albumCreationError && (
            <p role="alert" className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-100">
              {albumCreationError}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={creatingAlbum || busy || !newAlbumName.trim()}
              className="min-h-11 rounded-xl bg-sky-600 px-5 py-2 text-sm font-extrabold text-white hover:bg-sky-500 disabled:opacity-50">
              {creatingAlbum ? "Creating album…" : "Create Album"}
            </button>
            <button type="button" disabled={creatingAlbum}
              onClick={() => { setShowAlbumCreator(false); setAlbumCreationError(""); }}
              className="min-h-11 rounded-xl border border-slate-600 px-5 py-2 text-sm font-bold text-slate-200">
              Cancel
            </button>
          </div>
        </form>
      )}

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
            disabled={busy || loading || savingAlbum}
            required
            onChange={(event) => {
              setAlbumId(event.target.value);
              setEditingAlbumId("");
              setAlbumEditError("");
              setAlbumEditMessage("");
            }}
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
            disabled={busy || loading || savingAlbum}
            onClick={loadAlbums}
            className="min-h-11 rounded-xl border border-slate-600 px-4 py-2 text-xs font-bold text-slate-200 disabled:opacity-50"
          >
            Refresh albums
          </button>
          <button
            type="button"
            disabled={busy || loading || creatingAlbum || savingAlbum || !albumId}
            onClick={startEditingAlbum}
            className="min-h-11 rounded-xl border border-sky-400/50 bg-sky-500/10 px-4 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
          >
            Edit Selected Album
          </button>
        </div>

        {albumEditMessage && (
          <p role="status" className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-xs text-emerald-100">
            {albumEditMessage}
          </p>
        )}
        {editingAlbumId && (
          <div aria-label="Edit selected media album"
            className="space-y-4 rounded-xl border border-sky-400/35 bg-slate-900/70 p-4"
          >
            <div>
              <h4 className="font-extrabold text-white">Edit Album</h4>
              <p className="mt-1 text-xs text-slate-300">
                Change this album's details without changing or deleting its videos.
              </p>
            </div>
            <div>
              <label htmlFor="jb-edit-album-name" className="mb-1 block text-sm font-semibold text-white">
                Album name
              </label>
              <input id="jb-edit-album-name" type="text" maxLength={80} required
                value={editAlbumName}
                onChange={(event) => setEditAlbumName(event.target.value)}
                disabled={busy || savingAlbum}
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="jb-edit-album-description" className="mb-1 block text-sm font-semibold text-white">
                Description
              </label>
              <textarea id="jb-edit-album-description" rows={2} maxLength={400}
                value={editAlbumDescription}
                onChange={(event) => setEditAlbumDescription(event.target.value)}
                disabled={busy || savingAlbum}
                className="w-full resize-y rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="jb-edit-album-cover-style" className="mb-1 block text-sm font-semibold text-white">
                Album cover color
              </label>
              <select id="jb-edit-album-cover-style" value={editAlbumCoverStyle}
                onChange={(event) => setEditAlbumCoverStyle(event.target.value)}
                disabled={busy || savingAlbum}
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white"
              >
                <option value="indigo">Indigo</option>
                <option value="ocean">Ocean</option>
                <option value="forest">Forest</option>
                <option value="sunset">Sunset</option>
                <option value="violet">Violet</option>
                <option value="slate">Slate</option>
              </select>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-white">
              <input type="checkbox" checked={editAlbumVisible}
                onChange={(event) => setEditAlbumVisible(event.target.checked)}
                disabled={busy || savingAlbum}
                className="mt-1 h-4 w-4 accent-sky-500"
              />
              <span>
                <strong>Visible to eligible members</strong>
                <span className="block text-xs text-slate-300">
                  Uncheck to hide this album from members while you prepare its content.
                </span>
              </span>
            </label>
            {albumEditError && (
              <p role="alert" className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-100">
                {albumEditError}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={saveEditedAlbum}
                disabled={busy || savingAlbum || !editAlbumName.trim()}
                className="min-h-11 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {savingAlbum ? "Saving album…" : "Save Album Changes"}
              </button>
              <button type="button" disabled={savingAlbum}
                onClick={() => { setEditingAlbumId(""); setAlbumEditError(""); }}
                className="min-h-11 rounded-xl border border-slate-600 px-4 py-2 text-xs font-bold text-slate-200">
                Cancel Edit
              </button>
            </div>
          </div>
        )}

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
          Thumbnails for the first 20 selected videos appear before upload when supported.
          Private thumbnails are saved automatically after each verified upload. If extraction fails,
          the JB Collections logo is used. No thumbnail is made public before content clearance.
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
                      <img
                        src={item.previewUrl || DEFAULT_THUMBNAIL_URL}
                        alt=""
                        onError={handleThumbnailLoadError}
                        className="h-14 w-24 shrink-0 rounded-md border border-slate-700 object-contain"
                      />
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
          disabled={busy || loading || savingAlbum || Boolean(editingAlbumId) || !albumId || !files.length || Boolean(errorText)}
          className="min-h-11 w-full rounded-xl bg-sky-700 px-5 py-3 text-sm font-extrabold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {busy ? "Uploading privately…" : "Upload Selected Files Privately"}
        </button>
      </form>

      <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-white">Private upload queue · Unpublished only</h4>
          <button
            type="button"
            disabled={busy || draftsLoading || deletingDrafts}
            onClick={loadStaging}
            className="min-h-10 rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 disabled:opacity-50"
          >
            Refresh queue
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-200">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" aria-label="Select all eligible unpublished drafts"
              checked={eligibleDraftIds.length > 0 && eligibleDraftIds.every((id) => selectedDraftIds.includes(id))}
              disabled={busy || deletingDrafts || !eligibleDraftIds.length}
              onChange={(event) => setSelectedDraftIds(event.target.checked ? eligibleDraftIds : [])}
            />
            Select all eligible ({eligibleDraftIds.length})
          </label>
          <button type="button" disabled={busy || deletingDrafts || !selectedDraftIds.length}
            onClick={() => deleteDrafts(selectedDraftIds)}
            className="rounded-lg border border-rose-400/40 px-3 py-2 font-bold text-rose-200 disabled:opacity-40">
            Delete selected ({selectedDraftIds.length})
          </button>
          <button type="button" disabled={busy || deletingDrafts || !eligibleDraftIds.length}
            onClick={() => deleteDrafts(eligibleDraftIds, true)}
            className="rounded-lg border border-rose-400/40 px-3 py-2 font-bold text-rose-200 disabled:opacity-40">
            Delete all unpublished
          </button>
        </div>
        {cleanupMessage && <p role="status" className="mt-2 text-xs text-amber-200">{cleanupMessage}</p>}
        <p className="mt-1 text-[11px] text-slate-400">Only unpublished drafts can be deleted here. In-progress uploads are locked until their upload links expire.</p>
        {draftsLoading ? (
          <p role="status" className="mt-3 text-xs text-slate-400">Loading private drafts…</p>
        ) : existingDrafts.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">No staged uploads yet.</p>
        ) : (
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {existingDrafts.map((draft) => (
              <li key={draft.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 p-3 text-xs">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <input type="checkbox" aria-label={"Select unpublished draft " + draft.original_filename}
                    checked={selectedDraftIds.includes(draft.id)}
                    disabled={!draft.canDelete || busy || deletingDrafts}
                    onChange={(event) => setSelectedDraftIds((previous) => event.target.checked
                      ? [...previous, draft.id] : previous.filter((id) => id !== draft.id))}
                  />
                  <img
                    src={privatePreviews[draft.id] || DEFAULT_THUMBNAIL_URL}
                    alt=""
                    onError={handleThumbnailLoadError}
                    className="h-14 w-24 shrink-0 rounded-md border border-slate-700 object-contain"
                  />
                  <span className="min-w-0 break-all text-slate-200">{draft.original_filename}</span>
                </div>
                <span className="font-semibold text-amber-200">
                  {draft.status === "pending_review" ? "Private · Not published" : draft.canDelete ? "Upload incomplete" : "Upload incomplete · Active upload protected"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
