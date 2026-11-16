import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import AlbumCover from "../../components/albums/AlbumCover";
import { ALBUM_COVER_STYLES, getAlbumCoverStyle, isAllowedAlbumCoverUrl } from "../../services/albumArtwork";

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 400;

export default function AdminAlbumsTab() {
  const [albums, setAlbums] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverStyle, setCoverStyle] = useState("indigo");
  const [coverUrl, setCoverUrl] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorText, setErrorText] = useState("");

  const filteredAlbums = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const matching = albums.filter((album) => {
      const matchesText = !q || [album.name, album.description].some((value) =>
        String(value || "").toLowerCase().includes(q)
      );
      const matchesVisibility = visibilityFilter === "all" ||
        (visibilityFilter === "visible" ? album.is_visible : !album.is_visible);
      return matchesText && matchesVisibility;
    });
    return [...matching].sort((a, b) => sortBy === "alphabetical"
      ? a.name.localeCompare(b.name)
      : String(b.created_at).localeCompare(String(a.created_at))
    );
  }, [albums, searchTerm, visibilityFilter, sortBy]);

  const loadAlbums = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("jb_media_albums")
        .select("id, name, description, is_visible, cover_style, cover_image_url, created_at")
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
    setCoverStyle("indigo");
    setCoverUrl("");
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

    const cleanCoverUrl = coverUrl.trim();
    if (cleanCoverUrl && !isAllowedAlbumCoverUrl(cleanCoverUrl)) {
      setErrorText("Use an independently cleared PNG, JPG or WEBP image URL from https://assets.jb-premium-hub.vip/album-covers/ only.");
      return;
    }

    setSaving(true);
    setErrorText("");
    setNotice("");
    try {
      const payload = {
        name: cleanName,
        description: cleanDescription,
        cover_style: getAlbumCoverStyle(coverStyle).key,
        cover_image_url: cleanCoverUrl || null,
      };
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
    setCoverStyle(getAlbumCoverStyle(album.cover_style).key);
    setCoverUrl(album.cover_image_url || "");
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
          appear as collection cards with a themed JB Collections cover.
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
        <div className="grid gap-4 rounded-xl border border-slate-700/80 bg-slate-950/50 p-4 sm:grid-cols-[minmax(0,210px)_minmax(0,1fr)]">
          <AlbumCover album={{ cover_style: coverStyle, cover_image_url: coverUrl }} className="rounded-xl border border-slate-700" />
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-xs font-bold text-slate-200">Album cover theme</p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {ALBUM_COVER_STYLES.map((style) => (
                  <button
                    key={style.key}
                    type="button"
                    disabled={saving}
                    aria-label={style.label + " cover"}
                    aria-pressed={coverStyle === style.key}
                    onClick={() => setCoverStyle(style.key)}
                    className={`flex min-h-12 flex-col items-center justify-center rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors ${coverStyle === style.key
                      ? "border-sky-400 bg-sky-500/20 text-white"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    <span aria-hidden="true" className={`mb-1 h-3 w-3 rounded-full ${style.dot}`} />
                    {style.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-xs font-semibold text-slate-300">
              Optional approved custom artwork URL
              <input
                type="url"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                maxLength={250}
                disabled={saving}
                placeholder="https://assets.jb-premium-hub.vip/album-covers/my-cover.webp"
                className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 p-3 text-xs text-white outline-none focus:border-sky-400"
              />
            </label>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Optional, already-reviewed static artwork hosted under the public-assets album-covers folder only.
              This screen does not upload images or extract video frames. Leave blank for the JB Collections logo.
            </p>
          </div>
        </div>
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
        <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="sr-only" htmlFor="album-search">Search albums</label>
          <input
            id="album-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search album name or description"
            className="min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-sky-400"
          />
          <label className="sr-only" htmlFor="album-visibility">Filter visibility</label>
          <select id="album-visibility" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white">
            <option value="all">All visibility</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
          </select>
          <label className="sr-only" htmlFor="album-sort">Sort albums</label>
          <select id="album-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white">
            <option value="recent">Newest first</option>
            <option value="alphabetical">A–Z</option>
          </select>
        </div>
        {loading ? (
          <p role="status" className="text-sm text-slate-300">Loading albums…</p>
        ) : albums.length === 0 ? (
          <p className="text-sm text-slate-400">No albums yet. Create one above to start the directory.</p>
        ) : filteredAlbums.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">No albums match your filters.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAlbums.map((album) => (
              <li key={album.id} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
                <AlbumCover album={album} />
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
