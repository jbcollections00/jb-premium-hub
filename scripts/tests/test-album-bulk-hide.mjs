import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync(
  new URL("../../src/pages/admin/AdminAlbumsTab.jsx", import.meta.url), "utf8"
);
const sql = readFileSync(
  new URL("../../supabase/migrations/20261116_phase333_media_albums.sql", import.meta.url), "utf8"
);

test("bulk hide has deliberate confirmation and only updates album visibility", () => {
  assert.match(admin, /const hideAllAlbums = async \(\) =>/);
  assert.match(admin, /answer !== 'HIDE ALL'/);
  assert.match(admin, /\.from\('jb_media_albums'\)\s*\.update\(\{ is_visible: false \}\)\s*\.eq\('is_visible', true\)/);
  assert.match(admin, /onClick=\{hideAllAlbums\}/);
  assert.match(admin, /Hide All Albums/);
  assert.doesNotMatch(admin.slice(admin.indexOf("const hideAllAlbums"),admin.indexOf("const deleteAlbum")), /delete\(|remove\(|truncate|media_url|storage\.|uploadFileToR2/i);
});

test("album bulk visibility remains protected by existing admin RLS update policy", () => {
  assert.match(sql, /CREATE POLICY jb_albums_admin_update/);
  assert.match(sql, /FOR UPDATE TO authenticated\s+USING \(\(SELECT public\.is_current_user_admin\(\)\)\)/);
});

test("UI discloses scope: not video hiding or file deletion", () => {
  assert.match(admin, /does not remove old video listings/);
  assert.match(admin, /It does not remove old video listings, restrict video API access, or delete R2\/database records/);
  assert.match(admin, /can be reversed with each album's Show button/);
});
