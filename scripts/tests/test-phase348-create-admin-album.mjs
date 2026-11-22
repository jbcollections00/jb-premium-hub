import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const upload = read("src/components/admin/AdminPrivateAlbumUpload.jsx");
const manager = read("src/pages/admin/AdminMediaTab.jsx");
const api = read("api/jb-admin-staging-upload.js");

test("Admin Media Manager shows the private album uploader", () => {
  assert.match(manager, /<AdminPrivateAlbumUpload \/>/);
  assert.match(upload, /Private Album Upload/);
  assert.match(upload, /\+ Create New Album/);
  assert.match(upload, /Create Album/);
});

test("New-album form is separate from bulk upload form, never nested", () => {
  const createForm = upload.indexOf('<form onSubmit={createAlbum}');
  const uploadForm = upload.indexOf('<form onSubmit={submit}');
  assert.ok(createForm > 0 && uploadForm > createForm);
  assert.ok(upload.indexOf('</form>', createForm) < uploadForm);
  assert.match(upload, /aria-label="Create a new media album"/);
});

test("Only existing admin RLS policy is used; no service role in frontend", () => {
  const start = upload.indexOf("const createAlbum = async");
  const end = upload.indexOf("useEffect(() => { loadAlbums();", start);
  const creator = upload.slice(start, end);
  assert.match(creator, /supabase\.auth\.getUser\(\)/);
  assert.match(creator, /\.from\("jb_media_albums"\)/);
  assert.match(creator, /\.insert\(\{/);
  assert.match(creator, /created_by: userId/);
  assert.match(creator, /\.select\("id, name, is_visible"\)/);
  assert.doesNotMatch(creator, /service_role|SUPABASE_SERVICE_ROLE_KEY|fetch\(/);
  assert.doesNotMatch(upload, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("Name and description respect existing database constraints", () => {
  assert.match(upload, /const name = newAlbumName\.trim\(\)/);
  assert.match(upload, /const description = newAlbumDescription\.trim\(\)/);
  assert.match(upload, /name\.length > 80/);
  assert.match(upload, /description\.length > 400/);
  assert.match(upload, /id="jb-new-album-name" type="text" required maxLength=\{80\}/);
  assert.match(upload, /id="jb-new-album-description" rows=\{2\} maxLength=\{400\}/);
});

test("Prevent duplicate name in current list; show errors, no silent failure", () => {
  assert.match(upload, /toLocaleLowerCase\(\)/);
  assert.match(upload, /An album with this name already exists/);
  assert.match(upload, /if \(insertError \|\| !album\?\.id\)/);
  assert.match(upload, /Only administrators can create albums/);
  assert.match(upload, /role="alert"/);
});

test("Created album is automatically selected for the next video upload", () => {
  assert.match(upload, /setAlbums\(\(previous\) => \[/);
  assert.match(upload, /setAlbumId\(album\.id\)/);
  assert.match(upload, /setAlbumCreationMessage/);
  assert.match(upload, /Destination album/);
  assert.match(upload, /<option key=\{album\.id\} value=\{album\.id\}>/);
  assert.match(upload, /albumId,/);
});

test("Hidden album option is explicit; doesn't publish any video", () => {
  assert.match(upload, /newAlbumVisible, setNewAlbumVisible/);
  assert.match(upload, /is_visible: newAlbumVisible/);
  assert.match(upload, /Visible to eligible members/);
  assert.match(upload, /Uncheck to keep the album hidden/);
  const start = upload.indexOf("const createAlbum = async");
  const end = upload.indexOf("useEffect(() => { loadAlbums();", start);
  assert.doesNotMatch(upload.slice(start, end), /jb_publish_staged_media_v1|\.from\("media"\)/);
  assert.match(api, /"publish"/);
});

test("New album creation does not change upload, deletion, or billing endpoints", () => {
  assert.match(upload, /stagingRequest\("delete-unpublished"/);
  assert.match(upload, /stagingRequest\("begin"/);
  assert.match(manager, /<AdminR2CleanupQueue \/>/);
  assert.match(manager, /<AdminR2OrphanAudit \/>/);
});
