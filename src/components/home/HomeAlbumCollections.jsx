import React, { useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import {
  DEFAULT_THUMBNAIL_URL,
  handleThumbnailLoadError,
} from "../../services/thumbnailDisplay";

/**
 * Public-facing album DIRECTORY only.
 *
 * This component reads album metadata but does not query, select, link to,
 * or play any media. Media publication remains separately restricted.
 */
export default function HomeAlbumCollections() {
  const [albums, setAlbums] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data, error } = await supabase
        .from("jb_media_albums")
        .select("id, name, description")
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!active) return;

      if (error) {
        setErrorText(
          error.code === "42P01"
            ? "Album directory is not available yet."
            : "Unable to load albums right now."
        );
        setAlbums([]);
      } else {
        setErrorText("");
        setAlbums(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    };

    load();
    const refreshOnFocus = () => { load(); };
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      active = false;
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);

  const selected = albums.find((album) => album.id === selectedId);

  return (
    <section
      className="jbh-surface mb-10 rounded-2xl border border-white/10 p-5 sm:p-7"
      aria-label="Explore albums"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-sky-300">
            Browse by collection
          </p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">
            Explore Albums
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Albums created by the site administrator appear here.
          </p>
        </div>
        {albums.length > 0 && (
          <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200">
            {albums.length} collection{albums.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <p role="status" className="py-10 text-center text-sm text-slate-400">
          Loading albums…
        </p>
      ) : errorText ? (
        <p role="status" className="rounded-xl border border-slate-700 p-5 text-sm text-slate-300">
          {errorText}
        </p>
      ) : albums.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-8 text-center">
          <img src={DEFAULT_THUMBNAIL_URL} onError={handleThumbnailLoadError} alt="" className="mx-auto mb-3 h-16 w-28 object-contain" />
          <p className="text-sm font-bold text-white">No albums yet</p>
          <p className="mt-1 text-xs text-slate-400">New collections will appear here when created.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {albums.map((album) => (
              <button
                type="button"
                key={album.id}
                aria-pressed={selectedId === album.id}
                onClick={() => setSelectedId((previous) => previous === album.id ? null : album.id)}
                className={`overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400 ${
                  selectedId === album.id
                    ? "border-sky-400 bg-sky-950/40"
                    : "border-slate-700 bg-slate-900 hover:border-sky-500/50"
                }`}
              >
                <img
                  src={DEFAULT_THUMBNAIL_URL}
                  onError={handleThumbnailLoadError}
                  alt=""
                  className="aspect-video w-full bg-slate-950 object-contain"
                  loading="lazy"
                />
                <span className="block p-3">
                  <span className="block break-words text-sm font-bold text-white">
                    {album.name}
                  </span>
                  <span className="mt-1 block break-words text-xs text-slate-400">
                    {album.description || "Collection"}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <div className="mt-4 rounded-xl border border-sky-500/20 bg-slate-950/60 p-4" role="status">
              <p className="text-sm font-bold text-white">{selected.name}</p>
              <p className="mt-1 text-xs text-slate-300">
                This album directory is ready. Video listings remain unavailable until
                the separate, verified media-publication workflow is complete.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
