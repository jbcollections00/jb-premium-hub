import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const sql = read("../../supabase/migrations/20261116_phase333_media_albums.sql");
const adminPage = read("../../src/pages/admin/AdminDashboard.jsx");
const albumsTab = read("../../src/pages/admin/AdminAlbumsTab.jsx");
const homePage = read("../../src/pages/public/Home.jsx");
const albumCards = read("../../src/components/home/HomeAlbumCollections.jsx");
const mediaTab = read("../../src/pages/admin/AdminMediaTab.jsx");

test("album migration contains a separate RLS-protected metadata table", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.jb_media_albums/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FOR SELECT TO anon, authenticated\s+USING \(is_visible = true\)/);
  assert.match(sql, /FOR SELECT TO authenticated\s+USING \(\(SELECT public\.is_current_user_admin\(\)\)\)/);
  for (const action of ["INSERT", "UPDATE", "DELETE"]) {
    assert.match(sql, new RegExp("FOR " + action + " TO authenticated"));
  }
  assert.doesNotMatch(sql, /\b(?:TRUNCATE|DROP TABLE|DELETE FROM|ALTER TABLE public\.media)\b/i);
});

test("admin dashboard exposes Album Manager with a lazy workspace", () => {
  assert.match(adminPage, /const AdminAlbumsTab = lazy\(\(\) => import\('\.\/AdminAlbumsTab'\)\)/);
  assert.match(adminPage, /id: 'albums', icon: FolderOpen, label: 'Albums'/);
  assert.match(adminPage, /activeTab === 'albums' && <AdminAlbumsTab \/>/);
  assert.match(adminPage, /<ProtectedRoute adminOnly>/);
});

test("album manager performs metadata-only administration", () => {
  assert.match(albumsTab, /\.from\("jb_media_albums"\)/);
  assert.match(albumsTab, /Create new album/);
  assert.match(albumsTab, /setVisibility/);
  assert.match(albumsTab, /deleteAlbum/);
  assert.doesNotMatch(albumsTab, /\.from\("media"\)|uploadFileToR2|fetch\(/);
});

test("homepage queries visible album titles and does not expose media through album cards", () => {
  assert.match(homePage, /<HomeAlbumCollections \/>/);
  assert.match(albumCards, /\.from\("jb_media_albums"\)/);
  assert.match(albumCards, /\.eq\("is_visible", true\)/);
  assert.match(albumCards, /DEFAULT_THUMBNAIL_URL/);
  assert.doesNotMatch(albumCards, /\.from\("media"\)|media_url|<video\b|requestPrivateMediaUrl|uploadFileToR2/);
});

test("existing media-upload behavior is not changed by album directory phase", () => {
  assert.match(mediaTab, /handleBulkUploadToCloudflare/);
  assert.match(mediaTab, /category:\s*"JB Media"/);
  assert.match(mediaTab, /NewCatalogReadiness/);
});
