/**
 * JB Premium Hub — titleless *presentation* for independently cleared videos.
 *
 * NOT a content review, moderation tool, entitlement check or access gate.
 * IDs may be added ONLY after documented, independent adult content-safety
 * clearance confirms lawful non-explicit material. A title edit, screenshot,
 * existing cover or blanket statement is never proof of approval.
 *
 * Until such evidence exists the production list is EMPTY, so titles remain.
 */
const VERIFIED_NONEXPLICIT_TITLELESS_IDS = new Set([]);

export function isTitlelessForVerifiedId(mediaId, isAdmin, verifiedIds) {
  return !isAdmin &&
    typeof mediaId === "string" &&
    verifiedIds instanceof Set &&
    verifiedIds.has(mediaId.toLowerCase());
}

export function canOmitPublicTitle(mediaId, isAdmin = false) {
  return isTitlelessForVerifiedId(mediaId, isAdmin, VERIFIED_NONEXPLICIT_TITLELESS_IDS);
}

export function videoThumbnailAlt(media, isAdmin = false) {
  if (canOmitPublicTitle(media?.id, isAdmin)) {
    return "Video thumbnail";
  }
  return media?.thumbnail_url ? (media?.title || "Video thumbnail") : "JB Collections";
}
