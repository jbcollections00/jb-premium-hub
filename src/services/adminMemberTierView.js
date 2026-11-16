/**
 * Phase 334 — ADMIN display-only membership tiers.
 *
 * Do not use profiles.account_type or role to infer paid access.
 * Do not call jb_billing_my_access() for another user: that RPC only reports
 * auth.uid(). Only jb_admin_live_paid_tiers_v1() (server-authorized) may supply
 * the active LIVE paid membership result for this table.
 *
 * If the authoritative RPC cannot be loaded, do not claim Free.
 */
export const ADMIN_MEMBER_FILTERS = ["ALL", "FREE", "STANDARD", "VIP"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeAdminPaidTiers(raw, at = Date.now()) {
  if (!Array.isArray(raw)) {
    throw new Error("Billing tier response is not an array.");
  }
  if (!Number.isFinite(at)) throw new Error("Invalid date.");
  const tiers = new Map();
  for (const row of raw) {
    const userId = String(row?.user_id || "").toLowerCase();
    const tier = String(row?.tier || "").toLowerCase();
    const expiry = Date.parse(row?.access_expires_at || "");
    if (!UUID.test(userId) || (tier !== "standard" && tier !== "vip") ||
        !Number.isFinite(expiry) || expiry <= at || tiers.has(userId)) {
      throw new Error("Invalid, duplicate, or expired LIVE paid membership row.");
    }
    tiers.set(userId, Object.freeze({ tier, access_expires_at: row.access_expires_at }));
  }
  return tiers;
}

export function getAdminDisplayedTier(profile, paidTiers, status) {
  if (status !== "ready" || !(paidTiers instanceof Map)) return "unknown";
  const id = String(profile?.id || "").toLowerCase();
  const record = paidTiers.get(id);
  return record?.tier === "vip" ? "vip" :
    record?.tier === "standard" ? "standard" : "free";
}

export function getAdminDisplayedTierLabel(tier) {
  switch (tier) {
    case "vip": return "VIP";
    case "standard": return "Standard User";
    case "free": return "Free User";
    default: return "Unavailable";
  }
}

export function matchAdminMemberTierFilter(tier, filter) {
  if (!ADMIN_MEMBER_FILTERS.includes(filter)) return false;
  if (filter === "ALL") return true;
  return tier.toUpperCase() === filter;
}

export function countAdminDisplayTiers(profiles, paidTiers, status) {
  const counts = { free: 0, standard: 0, vip: 0, unknown: 0 };
  for (const profile of profiles) {
    counts[getAdminDisplayedTier(profile, paidTiers, status)] += 1;
  }
  return counts;
}
