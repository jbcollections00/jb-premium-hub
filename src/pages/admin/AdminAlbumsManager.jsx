import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";

const COLORS = ["indigo", "ocean", "forest", "sunset", "violet", "slate"];
const initialForm = { name: "", description: "", is_visible: true, cover_style: "indigo" };

export default function AdminAlbumsManager() {
  const [albums, setAlbums] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.from("jb_media_albums")
        .select("id,name,description,is_visible,cover_style,created_at")
        .order("name", { ascending: true })
        .limit(200);
      if (error) throw error;
      const rows = data || [];
      setAlbums(rows);

      // Aggregates from the same RLS-filtered published links. No private URLs.
      const { data: links, error: linksError } = await supabase
        .from("jb_media_publication_links").select("album_id").limit(1000);
      if (!linksError && Array.isArray(links) && links.length < 1000) {
        setCounts(links.reduce((out, item) => {
          if (item.album_id) out[item.album_id] = (out[item.album_id] || 0) + 1;
          return out;
        }, {}));
      } else setCounts({});
    } catch {
      setAlbums([]);
      setCounts({});
      setErrorMessage("Albums could not be loaded. Check your admin session.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAlbums(); }, [loadAlbums]);

  const beginCreate = () => {
    if (busy) return;
    setEditingId(null);
    setForm(initialForm);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const beginEdit = (album) => {
    if (busy) return;
    setEditingId(album.id);
    setForm({
      name: album.name || "",
      description: album.description || "",
      is_visible: album.is_visible === true,
      cover_style: COLORS.includes(album.cover_style) ? album.cover_style : "indigo",
    });
    setErrorMessage("");
    setSuccessMessage("");
  };

  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    const name = form.name.trim();
    const description = form.description.trim();
    setErrorMessage("");
    setSuccessMessage("");
    if (!name || name.length > 80) {
      setErrorMessage("Album name must contain 1–80 characters.");
      return;
    }
    if (description.length > 400) {
      setErrorMessage("Description must be 400 characters or fewer.");
      return;
    }
    if (!COLORS.includes(form.cover_style)) {
      setErrorMessage("Invalid cover color.");
      return;
    }
    if (albums.some((row) => row.id !== editingId &&
      row.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setErrorMessage("An album with this name already exists.");
      return;
    }
    setBusy(true);
    try {
      const patch = {
        name, description,
        is_visible: form.is_visible,
        cover_style: form.cover_style,
      };
      if (editingId) {
        const { data, error } = await supabase.from("jb_media_albums")
          .update(patch).eq("id", editingId).select("id").single();
        if (error || !data) throw error || new Error("Album update not confirmed.");
        setSuccessMessage("Album updated successfully.");
      } else {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData?.user?.id) throw new Error("Admin sign-in required.");
        const { data, error } = await supabase.from("jb_media_albums")
          .insert({ ...patch, created_by: authData.user.id })
          .select("id").single();
        if (error || !data) throw error || new Error("Album creation not confirmed.");
        setSuccessMessage("Album created successfully. You can now select it during video upload.");
      }
      setEditingId(null);
      setForm(initialForm);
      await loadAlbums();
    } catch (error) {
      setErrorMessage(error?.code === "42501"
        ? "You do not have administrator permission to manage albums."
        : "Could not save album. Check admin permissions and try again.");
    } finally {
      setBusy(false);
    }
  };

  const setField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const inputClass = "w-full rounded-xl border border-slate-600/70 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400";
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="jbh-admin-hero rounded-3xl p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-sky-200">Media library</p>
        <h1 className="mt-2 text-3xl font-black text-white">Albums</h1>
        <p className="mt-2 text-sm text-slate-300">Create and edit albums used to organize your published videos.</p>
      </header>

      <section className="jbh-admin-panel rounded-2xl p-5 sm:p-6" aria-label="Create or edit an album">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-white">{editingId ? "Edit Album" : "Create New Album"}</h2>
          {editingId && <button type="button" onClick={beginCreate} disabled={busy}
            className="rounded-lg border border-slate-500 px-3 py-2 text-xs font-bold text-slate-200">Cancel edit</button>}
        </div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-200" htmlFor="jb-album-name">Album name</label>
            <input id="jb-album-name" className={inputClass} maxLength={80} value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Educational Videos" required/>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-200" htmlFor="jb-album-desc">Description (optional)</label>
            <textarea id="jb-album-desc" className={inputClass} maxLength={400} rows={3} value={form.description}
              onChange={(e) => setField("description", e.target.value)} placeholder="Short description of the album"/>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={form.is_visible} onChange={(e) => setField("is_visible", e.target.checked)}
                className="h-4 w-4 accent-sky-500"/>
              Visible to Standard/VIP members
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              Cover theme
              <select value={form.cover_style} onChange={(e) => setField("cover_style", e.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white">
                {COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
              </select>
            </label>
          </div>
          {errorMessage && <p role="alert" className="text-sm text-rose-300">{errorMessage}</p>}
          {successMessage && <p role="status" className="text-sm text-emerald-300">{successMessage}</p>}
          <button type="submit" disabled={busy}
            className="jbh-admin-primary min-h-11 rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-50">
            {busy ? "Saving..." : editingId ? "Save Album Changes" : "+ Create Album"}
          </button>
        </form>
      </section>

      <section className="jbh-admin-panel rounded-2xl p-5 sm:p-6" aria-label="Existing albums">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-white">Existing Albums ({albums.length})</h2>
          <button type="button" onClick={loadAlbums} disabled={busy || loading}
            className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Refresh</button>
        </div>
        {loading ? <p role="status" className="text-sm text-slate-300">Loading albums...</p>
          : albums.length === 0 ? <p className="text-sm text-slate-400">No albums found. Use Create New Album above.</p>
          : <div className="divide-y divide-white/10">
            {albums.map((album) => <div key={album.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold text-white">{album.name}</p>
                {album.description && <p className="mt-1 max-w-xl text-xs text-slate-300">{album.description}</p>}
                <p className="mt-1 text-xs text-slate-400">
                  {album.is_visible ? "Visible to members" : "Hidden from members"}
                  {Number.isInteger(counts[album.id]) ? ` · ${counts[album.id]} published` : ""}
                </p>
              </div>
              <button type="button" onClick={() => beginEdit(album)} disabled={busy}
                className="rounded-xl border border-sky-400/50 px-4 py-2 text-xs font-bold text-sky-200 transition hover:bg-sky-500/10 disabled:opacity-50">
                Edit Album
              </button>
            </div>)}
          </div>}
        <p className="mt-4 text-xs text-slate-400">Hiding an album does not delete its videos. Existing video uploads remain untouched.</p>
      </section>
    </div>
  );
}
