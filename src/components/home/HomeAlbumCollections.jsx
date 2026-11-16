import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabaseClient";

/**
 * Dynamic album tabs in the Media Library filter row.
 * Album titles/descriptions are metadata only. This never queries media,
 * opens playback, generates video thumbnails, or grants publishing access.
 */
export default function HomeAlbumCollections({ activeCategory = "all", onSelectCategory }) {
  const [albums, setAlbums] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("jb_media_albums")
          .select("id, name, description, cover_style, cover_image_url")
          .eq("is_visible", true)
          .order("created_at", { ascending: false })
          .limit(200);

        if (!active) return;
        if (error) throw error;
        setAlbums(Array.isArray(data) ? data : []);
        setErrorText("");
      } catch (error) {
        if (!active) return;
        setAlbums([]);
        setErrorText(
          error?.code === "42P01"
            ? "Albums are not configured yet."
            : "Album categories are temporarily unavailable."
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    const onFocus = () => { load(); };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const filteredAlbums = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return albums;
    return albums.filter((album) =>
      [album.name, album.description].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    );
  }, [albums, search]);

  if (loading) {
    return <span role="status" className="shrink-0 text-xs text-slate-400">Loading albums…</span>;
  }

  if (errorText) {
    return <span role="status" className="shrink-0 text-xs text-amber-200">{errorText}</span>;
  }

  if (albums.length === 0) {
    return <span className="shrink-0 text-xs text-slate-500">No albums yet</span>;
  }

  return (
    <>
      {albums.length > 8 && (
        <>
          <label htmlFor="home-album-search" className="sr-only">
            Search album categories
          </label>
          <input
            id="home-album-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find album..."
            className="w-36 shrink-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-sky-400 sm:w-44"
          />
        </>
      )}
      {filteredAlbums.map((album) => {
        const categoryKey = "album:" + album.id;
        const isActive = activeCategory === categoryKey;

        return (
          <button
            key={album.id}
            type="button"
            title={album.description || album.name}
            aria-pressed={isActive}
            onClick={() => onSelectCategory?.(categoryKey)}
            className={
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-2.5 text-xs font-bold transition-colors " +
              (isActive
                ? "border-sky-500 bg-sky-600 text-white"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:border-sky-500/60 hover:text-white")
            }
          >
            <span aria-hidden="true">📁</span>
            <span>{album.name}</span>
          </button>
        );
      })}
      {filteredAlbums.length === 0 && (
        <span role="status" className="shrink-0 text-xs text-slate-400">
          No matching album
        </span>
      )}
    </>
  );
}
