import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeAdminPaidTiers,
  getAdminDisplayedTier,
  getAdminDisplayedTierLabel,
  matchAdminMemberTierFilter,
  countAdminDisplayTiers,
} from "../../src/services/adminMemberTierView.js";

const now = Date.parse("2026-11-16T04:00:00Z");
const id = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const users = Array.from({ length: 476 }, (_, i) => ({
  id: id(i + 1), account_type: "standard", role: "user",
}));
const paidRows = [
  { user_id: id(2), tier: "standard", access_expires_at: "2026-12-16T04:00:00Z" },
  { user_id: id(3), tier: "vip", access_expires_at: "2026-12-16T04:00:00Z" },
];

test("476 old standard profiles are not classified as 476 paid Standard", () => {
  const byId = normalizeAdminPaidTiers(paidRows, now);
  const counts = countAdminDisplayTiers(users, byId, "ready");
  assert.deepEqual(counts, { free: 474, standard: 1, vip: 1, unknown: 0 });
  assert.equal(getAdminDisplayedTierLabel(getAdminDisplayedTier(users[0], byId, "ready")), "Free User");
  assert.equal(getAdminDisplayedTierLabel(getAdminDisplayedTier(users[1], byId, "ready")), "Standard User");
  assert.equal(getAdminDisplayedTierLabel(getAdminDisplayedTier(users[2], byId, "ready")), "VIP");
});
test("server unavailable never silently reclassifies everyone as Free", () => {
  for (const state of ["loading", "error"]) {
    assert.equal(getAdminDisplayedTier(users[0], new Map(), state), "unknown");
    assert.deepEqual(countAdminDisplayTiers(users, new Map(), state),
      { free: 0, standard: 0, vip: 0, unknown: 476 });
    assert.equal(getAdminDisplayedTierLabel("unknown"), "Unavailable");
  }
});
test("tampered, duplicate, expired or unexpected paid data is rejected", () => {
  assert.throws(() => normalizeAdminPaidTiers(null, now));
  assert.throws(() => normalizeAdminPaidTiers([...paidRows, paidRows[0]], now));
  assert.throws(() => normalizeAdminPaidTiers([{ ...paidRows[0], tier: "free" }], now));
  assert.throws(() => normalizeAdminPaidTiers([{ ...paidRows[0], access_expires_at: "2026-01-01T00:00:00Z" }], now));
  assert.throws(() => normalizeAdminPaidTiers([{ ...paidRows[0], user_id: "not-a-uuid" }], now));
});
test("only three payment-tier filters, with All as a selector", () => {
  assert.equal(matchAdminMemberTierFilter("free", "FREE"), true);
  assert.equal(matchAdminMemberTierFilter("standard", "FREE"), false);
  assert.equal(matchAdminMemberTierFilter("standard", "STANDARD"), true);
  assert.equal(matchAdminMemberTierFilter("vip", "VIP"), true);
  assert.equal(matchAdminMemberTierFilter("vip", "ALL"), true);
  assert.equal(matchAdminMemberTierFilter("unknown", "VIP"), false);
  assert.equal(matchAdminMemberTierFilter("standard", "ADMIN"), false);
});

const page = readFileSync(new URL("../../src/pages/admin/AdminUsersTab.jsx", import.meta.url), "utf8");
const sql = readFileSync(new URL("../../supabase/sql/phase334_admin_live_paid_tiers_v1.sql", import.meta.url), "utf8");

test("Users UI uses admin-authorized paid RPC, not profile.account_type for tier", () => {
  assert.match(page, /supabase\.rpc\("jb_admin_live_paid_tiers_v1"\)/);
  assert.match(page, /normalizeAdminPaidTiers\(data\)/);
  assert.match(page, /getAdminDisplayedTier\(u, paidTiers, paidStatus\)/);
  assert.match(page, /paidStatus !== "ready"/);
  assert.match(page, /<option value="FREE">Free Users/);
  assert.match(page, /<option value="STANDARD">Standard Users/);
  assert.match(page, /<option value="VIP">VIP/);
  assert.doesNotMatch(page, /Legacy VIP profiles/);
  assert.doesNotMatch(page, /Profile: \{u\.account_type/);
});
test("SQL checks server-side admin, excludes TEST and expired/revoked grants", () => {
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path TO ''/i);
  assert.match(sql, /public\.is_current_user_admin\(\)/);
  assert.match(sql, /g\.provider_environment = 'live'/);
  assert.match(sql, /g\.revoked_at IS NULL/);
  assert.match(sql, /g\.effective_until > now\(\)/);
  assert.match(sql, /g\.effective_from <= now\(\)/);
  assert.match(sql, /DISTINCT ON \(g\.user_id\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION/);
  assert.match(sql, /TO authenticated, service_role/);
  assert.doesNotMatch(sql, /\b(UPDATE|DELETE FROM|INSERT INTO)\b/i);
});
test("other admin controls, separate online-only filter and shared presence preserved", () => {
  assert.match(page, /onlineUserIds = new Set\(\)/);
  assert.doesNotMatch(page, /supabase\.channel\(/);
  assert.match(page, /setOnlineOnly\(e\.target\.checked\)/);
  assert.match(page, /Admin role/);
  for (const entry of ["handleAccessAccount", "handleBanUser", "handleDeleteUser", "AdminMembershipModal"]) {
    assert.ok(page.includes(entry), entry);
  }
});
