import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getAdminProfileKind, getAdminProfileLabel, matchesAdminProfileFilter,
} from "../../src/services/adminUserProfileView.js";

const id = "00000000-0000-4000-8000-000000000001";
const sample = (type, role="user") => ({id, email:"test@example.invalid", account_type:type, role});

test("legacy profile type is not presented as active paid membership", () => {
  assert.equal(getAdminProfileKind(sample("standard")), "standard");
  assert.equal(getAdminProfileLabel(sample("standard")), "Standard profile");
  assert.equal(getAdminProfileKind(sample("vip")), "vip");
  assert.equal(getAdminProfileLabel(sample("vip")), "Legacy VIP profile");
  assert.equal(getAdminProfileLabel(sample("standard","admin")), "Admin role");
});
test("guest, unknown, and admin profile categories remain distinct", () => {
  assert.equal(getAdminProfileKind({id,is_anonymous:true}), "guest");
  assert.equal(getAdminProfileKind(sample("guest")), "guest");
  assert.equal(getAdminProfileKind(sample("custom")), "other");
  assert.equal(getAdminProfileKind(sample("standard","admin")), "admin");
});
test("filter selection does not label guests/admins as regular profiles", () => {
  const online = new Set([id]);
  assert.equal(matchesAdminProfileFilter(sample("standard"),"STANDARD",online),true);
  assert.equal(matchesAdminProfileFilter(sample("vip"),"STANDARD",online),false);
  assert.equal(matchesAdminProfileFilter(sample("guest"),"STANDARD",online),false);
  assert.equal(matchesAdminProfileFilter(sample("standard","admin"),"STANDARD",online),false);
  assert.equal(matchesAdminProfileFilter(sample("standard"),"ONLINE",online),true);
  assert.equal(matchesAdminProfileFilter(sample("standard"),"ONLINE",new Set()),false);
  assert.equal(matchesAdminProfileFilter(sample("vip"),"VIP",online),true);
});
const users = readFileSync(new URL("../../src/pages/admin/AdminUsersTab.jsx",import.meta.url),"utf8");
const dashboard = readFileSync(new URL("../../src/pages/admin/AdminDashboard.jsx",import.meta.url),"utf8");

test("Users tab reuses parent presence and never creates/removes dashboard channel", () => {
  assert.match(users,/function AdminUsers\(\{ onlineUserIds = new Set\(\) \}\)/);
  assert.doesNotMatch(users,/supabase\.channel\(/);
  assert.doesNotMatch(users,/supabase\.removeChannel\(/);
  assert.match(dashboard,/onlineUserIds=\{onlineUserIds\}/);
});
test("profile and paid billing data are explicitly distinguished, filter is accessible", () => {
  assert.match(users,/legacy account fields, not current PayMongo subscription tiers/);
  assert.match(users,/Legacy VIP profiles/);
  assert.match(users,/htmlFor="admin-users-profile-filter"/);
  assert.match(users,/style=\{\{ colorScheme: "dark" \}\}/);
});
test("existing account management controls and fetch failure message remain", () => {
  assert.match(users,/<AdminMembershipModal/);
  assert.match(users,/handleBanUser/);
  assert.match(users,/handleAccessAccount/);
  assert.match(users,/handleDeleteUser/);
  assert.match(users,/role="alert"/);
  assert.match(users,/requestSerialRef\.current \+= 1/);
});
