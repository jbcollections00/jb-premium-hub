import React, { useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import {
  DEFAULT_THUMBNAIL_URL,
  handleThumbnailLoadError,
} from "../../services/thumbnailDisplay";

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 400;

export default function AdminAlbumsTab() {
  const [albums, setAlbums] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorText, setErrorText] = useState("");

  const loadAlbums = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("jb_media_albums")
        .select("id, name, description, is_visible, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setAlbums(Array.isArray(data) ? data : []);
      setErrorText("");
    } catch (error) {
      setErrorText(
        error?.code === "42P01"
          ? "Albums table is missing. Apply the Phase 333 SQL migration first."
          : "Unable to load albums: " + (error?.message || "Unknown error")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlbums();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
  };

  const submitAlbum = async (event) => {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanDescription = description.trim();

    if (!cleanName || cleanName.length > MAX_NAME_LENGTH) {
      setErrorText("Album name must contain 1–80 characters.");
      return;
    }
    if (cleanDescription.length > MAX_DESCRIPTION_LENGTH) {
      setErrorText("Description must be 400 characters or fewer.");
      return;
    }

    setSaving(true);
    setErrorText("");
    setNotice("");
    try {
      const payload = { name: cleanName, description: cleanDescription };
      const { error } = editingId
        ? await supabase.from("jb_media_albums").update(payload).eq("id", editingId)
        : await supabase.from("jb_media_albums").insert(payload);

      if (error) throw error;
      setNotice(
        editingId
          ? "Album details updated."
          : "Album created. Its title and neutral cover can now appear on the homepage."
      );
      resetForm();
      await loadAlbums();
    } catch (error) {
      setErrorText(error?.message || "Could not save album.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (album) => {
    setEditingId(album.id);
    setName(album.name);
    setDescription(album.description || "");
    setNotice("");
    setErrorText("");
  };

  const setVisibility = async (album) => {
    setSaving(true);
    setErrorText("");
    setNotice("");
    try {
      const { error } = await supabase
        .from("jb_media_albums")
        .update({ is_visible: !album.is_visible })
        .eq("id", album.id);

      if (error) throw error;
      setNotice(album.is_visible ? "Album hidden from Home." : "Album visible on Home.");
      await loadAlbums();
    } catch (error) {
      setErrorText(error?.message || "Could not update visibility.");
    } finally {
      setSaving(false);
    }
  };

  const deleteAlbum = async (album) => {
    if (!window.confirm(
      'Delete album "' + album.name + '"? This removes album metadata only; it does not delete videos.'
    )) return;

    setSaving(true);
    setErrorText("");
    setNotice("");
    try {
      const { error } = await supabase
        .from("jb_media_albums")
        .delete()
        .eq("id", album.id);

      if (error) throw error;
      if (editingId === album.id) resetForm();
      setNotice("Album metadata deleted. No video files were changed.");
      await loadAlbums();
    } catch (error) {
      setErrorText(error?.message || "Could not delete album.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto max-w-6xl space-y-6" aria-label="Album manager">
      <header className="jbh-admin-page-head">
        <h1 className="text-2xl font-extrabold text-white">Album Manager</h1>
        <p className="mt-2 text-sm text-slate-300">
          Create and organize album titles for the homepage. New visible albums
          appear as collection cards with the neutral JB Collections cover.
          Adding an album does not publish or approve any video.
        </p>
      </header>

      {errorText && (
        <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-950/30 p-3 text-sm text-rose-200">
          {errorText}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-sky-400/30 bg-sky-950/30 p-3 text-sm text-sky-100">
          {notice}
        </p>
      )}

      <form onSubmit={submitAlbum} className="jbh-admin-panel space-y-4 rounded-2xl p-5">
        <h2 className="text-base font-bold text-white">
          {editingId ? "Edit album" : "Create new album"}
        </h2>
        <label className="block text-xs font-semibold text-slate-300">
          Album name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Example: Educational Videos"
            required
            disabled={saving}
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 p-3 text-sm text-white outline-none focus:border-sky-400"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-300">
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_DESCRIPTION_LENGTH}
            rows={3}
            disabled={saving}
            placeholder="Short public description of the collection"
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 p-3 text-sm text-white outline-none focus:border-sky-400"
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className="jbh-admin-primary rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-50">
            {saving ? "Saving…" : editingId ? "Save changes" : "Create album"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} disabled={saving} className="rounded-xl border border-slate-600 px-5 py-2.5 text-sm text-slate-200">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="jbh-admin-panel rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-white">Your albums ({albums.length})</h2>
          <button type="button" onClick={loadAlbums} disabled={loading || saving} className="text-xs font-bold text-sky-300 disabled:opacity-50">
            Refresh
          </button>
        </div>
        {loading ? (
          <p role="status" className="text-sm text-slate-300">Loading albums…</p>
        ) : albums.length === 0 ? (
          <p className="text-sm text-slate-400">No albums yet. Create one above to start the directory.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {albums.map((album) => (
              <li key={album.id} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
                <img
                  src={DEFAULT_THUMBNAIL_URL}
                  onError={handleThumbnailLoadError}
                  alt=""
                  className="aspect-video w-full bg-slate-950 object-contain"
                />
                <div className="space-y-3 p-4">
                  <div>
                    <p className="break-words text-sm font-extrabold text-white">{album.name}</p>
                    <p className="mt-1 break-words text-xs text-slate-400">
                      {album.description || "No description"}
                    </p>
                  </div>
                  <p className="text-xs font-bold text-sky-200">
                    {album.is_visible ? "Visible on Home" : "Hidden from Home"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => startEdit(album)} disabled={saving} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">
                      Edit
                    </button>
                    <button type="button" onClick={() => setVisibility(album)} disabled={saving} className="rounded-lg border border-slate-600 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">
                      {album.is_visible ? "Hide" : "Show"}
                    </button>
                    <button type="button" onClick={() => deleteAlbum(album)} disabled={saving} className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs text-rose-200 disabled:opacity-50">
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
