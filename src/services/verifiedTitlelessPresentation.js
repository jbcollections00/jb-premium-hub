/**
 * JB Premium Hub — titleless *presentation* for independently cleared videos.
 *
 * This file is not a content review, a moderation tool or an access gate.
 * Only include IDs after independent, documented adult safety review confirms
 * lawful non-explicit content. Never add IDs based only on user statements,
 * renamed titles, filename pattern-matching or existing thumbnails.
 *
 * As of creation, no IDs have been verified for this UI change.
 * Intentionally EMPTY and fail-closed: no existing titles disappear.
 */
const VERIFIED_NONEXPLICIT_TITLELESS_IDS = new Set([]);

export function canOmitPublicTitle(mediaId, isAdmin = false) {
  return !isAdmin &&
    typeof mediaId === "string" &&
    VERIFIED_NONEXPLICIT_TITLELESS_IDS.has(mediaId.toLowerCase());
}

export function videoThumbnailAlt(media, isAdmin = false) {
  if (canOmitPublicTitle(media?.id, isAdmin)) {
    return "Video thumbnail";
  }
  return media?.thumbnail_url ? (media?.title || "Video thumbnail") : "JB Collections";
}
