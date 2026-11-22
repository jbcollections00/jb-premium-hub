// Presentation-only Home catalog grouping. Never grant media byte access here.
// Supabase RLS and private Cloudflare ticket issuers remain authoritative.
export function getHomeMode(billingReady, userId, membership, freePreviewEnabled) {
  if (!billingReady || !userId) return "locked";
  if (membership?.canViewAlbums === true &&
      ["admin", "standard", "vip"].includes(membership?.tier)) return "albums";
  if (freePreviewEnabled && membership?.tier === "free" &&
      membership?.canViewAlbums === false) return "free";
  return "locked";
}

export function shouldDisplayAds(billingReady, userId, membership) {
  return Boolean(billingReady && userId &&
    (membership?.tier === "standard" || membership?.tier === "free") &&
    membership?.showAds === true);
}

export function approvedFreeCatalog(raw) {
  if (!Array.isArray(raw)) throw new Error("Invalid Free to Watch catalog");
  return raw.filter(item =>
    item && typeof item.id === "string" &&
    typeof item.title === "string" &&
    item.type === "video" &&
    item.is_free_preview === true &&
    !Object.prototype.hasOwnProperty.call(item, "media_url") &&
    !Object.prototype.hasOwnProperty.call(item, "storage_key")
  ).slice(0, 20);
}

export function freeMostWatched(catalog, limit = 6) {
  // Ranking is calculated ONLY from the 20 authorized free catalog entries.
  return [...catalog].sort((a, b) =>
    (Number(b.views_count) || 0) - (Number(a.views_count) || 0) ||
    String(a.id).localeCompare(String(b.id))
  ).slice(0, limit);
}
