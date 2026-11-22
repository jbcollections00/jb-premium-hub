import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const migration = readFileSync("supabase/migrations/20261123081000_jb_access_codes_standard_archive_v1.sql", "utf8");
const ui = readFileSync("src/pages/admin/AccessCodesTab.jsx", "utf8");

test("contains matching RPC definitions and JS calls", () => {
  for (const fn of ["jb_admin_create_access_code_v1", "jb_admin_delete_unused_access_code_v1"]) {
    assert.match(migration, new RegExp("create or replace function public\\." + fn + "\\("));
    assert.ok(ui.includes('"' + fn + '"'));
  }
});
test("supports both STANDARD and VIP and actual membership grants", () => {
  assert.match(migration, /v_type not in \('VIP', 'STANDARD'\)/);
  assert.match(migration, /jb_admin_membership_grants/);
  assert.match(migration, /jb_admin_membership_audit/);
  assert.match(migration, /create or replace function public\.redeem_access_code/);
});
test("never deletes redeemed codes and preserves code history", () => {
  assert.match(migration, /c\.is_used is false/);
  assert.match(migration, /c\.used_at is null/);
  assert.match(migration, /jb_protect_redeemed_access_codes_v1/);
  assert.doesNotMatch(ui, /admin_delete_vip_access_code/);
});
test("tabbed UI separates expired from VIP/Standard and includes only unused delete", () => {
  for (const tab of ['VIP Codes', 'Standard Codes', 'Expired / History']) assert.ok(ui.includes(tab));
  assert.match(ui, /stateOf\(row, Date\.now\(\)\) !== "AVAILABLE"/);
});
test("RPC functions do not grant public/anonymous execution", () => {
  assert.match(migration, /revoke all on function public\.redeem_access_code\(text\) from public,anon/);
  assert.match(migration, /grant execute on function public\.redeem_access_code\(text\) to authenticated,service_role/);
});
