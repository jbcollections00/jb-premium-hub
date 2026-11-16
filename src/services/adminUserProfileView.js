/**
 * Admin Users table: classify stored PROFILE labels only.
 *
 * Profile type is not a trustworthy source of CURRENT paid membership.
 * Never present a legacy VIP flag as a settled PayMongo entitlement.
 * The Billing & memberships report is separate, server-authorized data.
 */
export function getAdminProfileKind(profile) {
  const role = String(profile?.role || "").trim().toLowerCase();
  const accountType = String(profile?.account_type || "").trim().toLowerCase();

  if (profile?.is_anonymous === true ||
      accountType === "anonymous" || accountType === "guest" ||
      !profile?.email) {
    return "guest";
  }
  if (role === "admin" || accountType === "admin") return "admin";
  if (accountType === "vip") return "vip";
  if (accountType === "standard" || accountType === "user" || !accountType) return "standard";
  return "other";
}

export function getAdminProfileLabel(profile) {
  switch (getAdminProfileKind(profile)) {
    case "admin": return "Admin role";
    case "vip": return "Legacy VIP profile";
    case "standard": return "Standard profile";
    case "guest": return "Guest profile";
    default: return "Other profile";
  }
}

export function matchesAdminProfileFilter(profile, filter, onlineIds) {
  const type = getAdminProfileKind(profile);
  switch (filter) {
    case "ALL": return true;
    case "ONLINE": return onlineIds instanceof Set && onlineIds.has(profile?.id);
    case "ADMIN": return type === "admin";
    case "VIP": return type === "vip";
    case "STANDARD": return type === "standard";
    case "GUEST": return type === "guest";
    default: return false;
  }
}
