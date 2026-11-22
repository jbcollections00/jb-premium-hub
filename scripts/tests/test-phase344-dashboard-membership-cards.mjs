import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const dashboard = read("src/pages/admin/AdminDashboard.jsx");
const sql = read("supabase/migrations/20261122193000_jb_admin_account_tier_counts_v1.sql");

test("Dashboard renders requested Free, Standard and VIP account user labels", () => {
  assert.match(dashboard, /label: 'Free Account Users'/);
  assert.match(dashboard, /label: 'Standard Account Users'/);
  assert.match(dashboard, /label: 'VIP Account Users'/);
  assert.doesNotMatch(dashboard, /label: 'Admin profiles'/);
  assert.doesNotMatch(dashboard, /label: 'Regular profiles'/);
});
test("User counts come from admin-restricted RPC, not legacy profile account_type", () => {
  assert.match(dashboard, /supabase\.rpc\('jb_admin_account_tier_counts_v1'\)/);
  assert.match(dashboard, /tierCounts\?\.free \?\? null/);
  assert.match(dashboard, /tierCounts\?\.standard \?\? null/);
  assert.match(dashboard, /tierCounts\?\.vip \?\? null/);
  assert.doesNotMatch(dashboard, /vipUsersCount|regularUsersCount|adminUsersCount/);
});
test("Tier counts fail closed with no invented numbers on RPC failure", () => {
  assert.match(dashboard, /setTierCounts\(null\)/);
  assert.match(dashboard, /setTierCountsError\(true\)/);
  assert.match(dashboard, /card\.value === null \? '—'/);
  assert.match(dashboard, /Current membership totals could not be verified/);
});
test("Summary totals retain Registered, Online, Media and Ticket cards", () => {
  for (const label of ['Registered profiles','Online now','Media items','Open tickets']) {
    assert.ok(dashboard.includes("label: '" + label + "'"), label);
  }
  assert.match(dashboard, /const registeredProfileCount = users\.filter/);
});
test("Pie chart shows only membership accounts; admin excluded", () => {
  assert.match(dashboard, /Account membership tiers/);
  assert.match(dashboard, /Excludes admins/);
  assert.match(dashboard, /name: 'Free Account Users'/);
  assert.match(dashboard, /name: 'Standard Account Users'/);
  assert.match(dashboard, /name: 'VIP Account Users'/);
  assert.doesNotMatch(dashboard, /name: 'Admin profiles'/);
});
test("Tier RPC enforces authenticated administrator", () => {
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /\(SELECT auth\.uid\(\)\) IS NULL/);
  assert.match(sql, /\(SELECT public\.is_current_user_admin\(\)\) IS DISTINCT FROM TRUE/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.jb_admin_account_tier_counts_v1\(\)[\s\S]+FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.jb_admin_account_tier_counts_v1\(\)[\s\S]+TO authenticated/);
});
test("Counts derive from LIVE paid grants and complimentary admin grants", () => {
  assert.match(sql, /FROM public\.jb_billing_entitlement_grants g/);
  assert.match(sql, /g\.provider_environment = 'live'/);
  assert.match(sql, /FROM public\.jb_admin_membership_grants g/);
  assert.match(sql, /g\.effective_from <= pg_catalog\.now\(\)/);
  assert.match(sql, /g\.effective_until > pg_catalog\.now\(\)/);
  assert.match(sql, /g\.revoked_at IS NULL/);
});
test("Tier precedence VIP > STANDARD > FREE with distinct registered users", () => {
  assert.ok(sql.indexOf("WHEN pg_catalog.bool_or(g.plan_code = 'vip')") <
     sql.indexOf("WHEN pg_catalog.bool_or(g.plan_code = 'standard')"));
  assert.match(sql, /ELSE 'free'/);
  assert.match(sql, /GROUP BY p\.id/);
  assert.match(sql, /btrim\(p\.email\)/);
  assert.match(sql, /NOT IN \('admin', 'guest', 'anonymous'\)/);
});
test("Migration is read-only for existing data", () => {
  assert.doesNotMatch(sql, /\b(DELETE FROM|UPDATE public\.|INSERT INTO|TRUNCATE)\b/i);
  assert.match(sql, /RETURNS jsonb/);
  assert.match(sql, /STABLE/);
});
