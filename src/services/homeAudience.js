/**
 * Home layout decision only. Actual membership and video authorization are
 * enforced by trusted backend policies/ticket issuers, not these UI helpers.
 */
export function resolveHomeAudience(profile, billingReady, membership) {
  if (!billingReady || !profile?.id) return "pending";
  return membership?.canViewAlbums === true &&
    ["admin", "standard", "vip"].includes(membership?.tier)
    ? "member"
    : "free";
}

export function getHomeCategory(category, audience) {
  if (audience !== "member") return "free";
  if (typeof category !== "string" || !category.trim()) return "all";
  if (category === "pinay_asian") return "all";
  return category;
}
