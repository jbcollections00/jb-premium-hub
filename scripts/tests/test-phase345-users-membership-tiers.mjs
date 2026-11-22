import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const ui = read("src/pages/admin/AdminUsersTab.jsx");
const sql = read("supabase/migrations/20261122200000_jb_admin_user_membership_tiers_v1.sql");

test("Account User column renders effective membership status, not legacy profile type", () => {
  assert.match(ui, /<th className="p-4">Account User<\/th>/);
  assert.match(ui, /\{currentTier \|\| "Unavailable"\}/);
  assert.doesNotMatch(ui, /Profile: \{u\.account_type/);
  assert.doesNotMatch(ui, /<th className="p-4">Profile type<\/th>/);
});
test("Account filters include FREE STANDARD and VIP based on verified tiers", () => {
  assert.match(ui, /value="FREE"[^>]+>FREE Account Users/);
  assert.match(ui, /value="STANDARD"[^>]+>STANDARD Account Users/);
  assert.match(ui, /value="VIP"[^>]+>VIP Account Users/);
  assert.match(ui, /const tier = membershipTiersById\[u\.id\]/);
  assert.match(ui, /return matchesSearch && tier === filterType/);
  assert.doesNotMatch(ui, /<option value="STANDARD">Regular profiles<\/option>/);
});
test("Tier map loaded with admin-only RPC batches of no more than 200 user IDs", () => {
  assert.match(ui, /for \(let offset = 0; offset < allProfiles\.length; offset \+= 200\)/);
  assert.match(ui, /allProfiles\.slice\(offset, offset \+ 200\)/);
  assert.match(ui, /supabase\.rpc\(\s*"jb_admin_user_membership_tiers_v1"/);
  assert.match(ui, /p_user_ids: ids/);
});
test("Incomplete or unavailable tier data never substitutes legacy account_type", () => {
  assert.match(ui, /if \(!allProfiles\.every\(\(user\) => Object\.hasOwn\(tiers, user\.id\)\)\)/);
  assert.match(ui, /setMembershipTiersById\(\{\}\)/);
  assert.match(ui, /setMembershipTierError\(true\)/);
  assert.match(ui, /no FREE, STANDARD or VIP status is guessed/);
});
test("Existing user management actions and 50 per page stay available", () => {
  assert.match(ui, /const USERS_PER_PAGE = 50/);
  assert.match(ui, /Manage Membership/);
  assert.match(ui, /Impersonate/);
  assert.match(ui, /handleBanUser/);
  assert.match(ui, /handleDeleteUser/);
  assert.match(ui, /fetchUsers\(\); \}\}/);
});
test("RPC requires server-verified admin before reading cross-user records", () => {
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = ''/);
  assert.match(sql, /\(SELECT auth\.uid\(\)\) IS NULL/);
  assert.match(sql, /\(SELECT public\.is_current_user_admin\(\)\) IS DISTINCT FROM TRUE/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.jb_admin_user_membership_tiers_v1\(uuid\[\]\)/);
  assert.match(sql, /FROM PUBLIC, anon, authenticated/);
});
test("Only requested IDs returned and maximum batch is 200", () => {
  assert.match(sql, /pg_catalog\.cardinality\(p_user_ids\) NOT BETWEEN 1 AND 200/);
  assert.match(sql, /WHERE p\.id = ANY\(p_user_ids\)/);
  assert.match(sql, /GROUP BY p\.id, p\.role, p\.account_type, p\.email/);
});
test("Membership logic matches LIVE and complimentary entitlement precedence", () => {
  assert.match(sql, /g\.provider_environment = 'live'/);
  assert.match(sql, /g\.revoked_at IS NULL/);
  assert.match(sql, /g\.effective_from <= pg_catalog\.now\(\)/);
  assert.match(sql, /g\.effective_until > pg_catalog\.now\(\)/);
  assert.match(sql, /FROM public\.jb_admin_membership_grants/);
  assert.ok(sql.indexOf("bool_or(g.plan_code = 'vip')") < sql.indexOf("bool_or(g.plan_code = 'standard')"));
  assert.match(sql, /THEN 'ADMIN'/);
  assert.match(sql, /THEN 'GUEST'/);
  assert.match(sql, /ELSE 'FREE'/);
});
test("Database migration is read-only for accounts and subscriptions", () => {
  assert.doesNotMatch(sql, /\b(DELETE FROM|UPDATE public\.|INSERT INTO|TRUNCATE)\b/i);
  assert.match(sql, /STABLE/);
});
