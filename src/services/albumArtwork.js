/**
 * Album cover metadata rules. No media URLs, private CDN, remote image upload
 * or video processing is permitted here. This only displays already reviewed
 * static artwork under the public-assets album-covers prefix.
 */
export const ALBUM_COVER_STYLES = Object.freeze([
  { key: "indigo", label: "Indigo", gradient: "from-indigo-700 via-slate-900 to-sky-950", dot: "bg-indigo-400" },
  { key: "ocean", label: "Ocean", gradient: "from-cyan-800 via-blue-950 to-slate-950", dot: "bg-cyan-400" },
  { key: "forest", label: "Forest", gradient: "from-emerald-800 via-teal-950 to-slate-950", dot: "bg-emerald-400" },
  { key: "sunset", label: "Sunset", gradient: "from-amber-700 via-rose-950 to-slate-950", dot: "bg-amber-400" },
  { key: "violet", label: "Violet", gradient: "from-violet-800 via-purple-950 to-slate-950", dot: "bg-violet-400" },
  { key: "slate", label: "Slate", gradient: "from-slate-600 via-slate-900 to-slate-950", dot: "bg-slate-400" },
]);

const COVER_URL_PATTERN =
  /^https:\/\/assets\.jb-premium-hub\.vip\/album-covers\/[A-Za-z0-9_-]{1,100}\.(?:png|jpg|jpeg|webp)$/;

export function isAllowedAlbumCoverUrl(value) {
  return typeof value === "string" && COVER_URL_PATTERN.test(value);
}

export function getAlbumCoverStyle(value) {
  return ALBUM_COVER_STYLES.find((style) => style.key === value) || ALBUM_COVER_STYLES[0];
}

export function getApprovedAlbumCoverUrl(value) {
  return isAllowedAlbumCoverUrl(value) ? value : null;
}
