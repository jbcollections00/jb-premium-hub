/**
 * JB PREMIUM HUB thumbnail display: preserve approved existing thumbnails,
 * never fetch an image from the retired private video CDN.
 *
 * This is a presentation-only resolver. It NEVER changes media.thumbnail_url,
 * copies an unreviewed object into public storage, or signs a video URL.
 *
 * Source types already present in the library:
 * - embedded data:image covers (legacy)
 * - thumbnails on the dedicated public-assets hostname
 * - old private-CDN / R2 development URLs, which are remapped ONLY to the
 *   corresponding key in public-assets (if that approved object exists there)
 * - null/empty thumbnails, which use the shared default JB Collections logo.
 */
export const PUBLIC_THUMBNAIL_ORIGIN = "https://assets.jb-premium-hub.vip";
export const DEFAULT_THUMBNAIL_URL =
  `${PUBLIC_THUMBNAIL_ORIGIN}/thumbnails/logo_JBCollections.png`;
export const LOCAL_THUMBNAIL_FALLBACK = "/jb-logo.png";

const EMBEDDED_IMAGE_RE =
  /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml)(?:;[^,]*)?,/i;

function isLegacyVideoHost(hostname) {
  return hostname === "cdn.jb-premium-hub.vip" ||
    /^pub-[a-f0-9]+\.r2\.dev$/i.test(hostname);
}

// Approved private staging covers are served through a narrow read-only
// published-artwork endpoint when a video still has the default logo.
// The server independently validates the publication link and exact JPEG key.
const MEDIA_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function verifiedPublishedArt(mediaId) {
  return typeof mediaId === "string" && MEDIA_UUID_RE.test(mediaId)
    ? "/api/jb-published-thumbnail?id=" + mediaId
    : DEFAULT_THUMBNAIL_URL;
}

export function getThumbnailDisplayUrl(thumbnailUrl, publishedMediaId = null) {
  if (typeof thumbnailUrl !== "string" || !thumbnailUrl.trim()) {
    return verifiedPublishedArt(publishedMediaId);
  }

  const raw = thumbnailUrl.trim();
  if (raw === DEFAULT_THUMBNAIL_URL) {
    return verifiedPublishedArt(publishedMediaId);
  }
  // Previously generated inline covers are real, saved thumbnails too.
  // Do not replace them just because they aren't hosted on public-assets.
  if (EMBEDDED_IMAGE_RE.test(raw)) return raw;

  // Already public and intentionally dedicated to static image assets.
  if (raw === LOCAL_THUMBNAIL_FALLBACK) return raw;

  // Old database values may be just an R2 thumbnail object key.
  if (/^\/?thumbnails\/[a-zA-Z0-9_./%+-]+(?:\?.*)?$/i.test(raw)) {
    return `${PUBLIC_THUMBNAIL_ORIGIN}/${raw.replace(/^\/+/, "")}`;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_THUMBNAIL_URL;
    }
    // Do not turn the video-storage CDN back on merely to serve images.
    if (isLegacyVideoHost(url.hostname)) {
      return url.pathname.startsWith("/thumbnails/")
        ? `${PUBLIC_THUMBNAIL_ORIGIN}${url.pathname}`
        : DEFAULT_THUMBNAIL_URL;
    }
    // Public thumbnails were deliberately moved to this separate bucket.
    if (url.hostname === "assets.jb-premium-hub.vip" &&
        url.protocol === "https:") {
      return url.href;
    }
  } catch {
    // An invalid or inaccessible source gets the logo without a DB rewrite.
  }
  return DEFAULT_THUMBNAIL_URL;
}

export function handleThumbnailLoadError(event) {
  const img = event?.currentTarget;
  if (!img) return;
  // One fallback only: no network loops if even the local asset is missing.
  img.onerror = null;
  img.src = LOCAL_THUMBNAIL_FALLBACK;
}
