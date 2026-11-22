import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const ui = read("src/components/admin/AdminPrivateAlbumUpload.jsx");
const manager = read("src/pages/admin/AdminMediaTab.jsx");

function region(from, to) {
  const start = ui.indexOf(from);
  const end = ui.indexOf(to, start + from.length);
  assert.ok(start !== -1 && end !== -1, "Could not find region: " + from);
  return ui.slice(start, end);
}
const editMethod = region("  const saveEditedAlbum = async () => {", "  useEffect(() => { loadAlbums();");

test("Private Upload presents both Create New Album and Edit Selected Album", () => {
  assert.match(manager, /<AdminPrivateAlbumUpload \/>/);
  assert.match(ui, /\+ Create New Album/);
  assert.match(ui, /Edit Selected Album/);
  assert.match(ui, /Save Album Changes/);
  assert.match(ui, /Cancel Edit/);
  assert.match(ui, /disabled=\{busy \|\| loading \|\| creatingAlbum \|\| savingAlbum \|\| !albumId\}/);
});

test("Edit form preloads all details of selected existing album", () => {
  assert.match(ui, /const selectedAlbum = albums\.find\(\(album\) => album\.id === albumId\)/);
  assert.match(ui, /setEditingAlbumId\(selectedAlbum\.id\)/);
  assert.match(ui, /setEditAlbumName\(selectedAlbum\.name \|\| ""\)/);
  assert.match(ui, /setEditAlbumDescription\(selectedAlbum\.description \|\| ""\)/);
  assert.match(ui, /setEditAlbumVisible\(selectedAlbum\.is_visible === true\)/);
  assert.match(ui, /setEditAlbumCoverStyle\(selectedAlbum\.cover_style \|\| "indigo"\)/);
});

test("Existing album metadata is selected from server and creator returns same metadata", () => {
  assert.match(ui, /\.select\("id, name, description, is_visible, cover_style"\)/);
  assert.match(ui, /setAlbums\(\(previous\) => previous/);
  assert.match(ui, /setEditingAlbumId\(""\)/);
  assert.match(ui, /setAlbumEditMessage/);
});

test("Only known cover colors are permitted, matching Supabase constraints", () => {
  assert.match(editMethod, /const allowedStyles = \["indigo", "ocean", "forest", "sunset", "violet", "slate"\]/);
  assert.match(editMethod, /!allowedStyles\.includes\(coverStyle\)/);
  for (const v of ["indigo","ocean","forest","sunset","violet","slate"]) {
    assert.match(ui, new RegExp('<option value="' + v + '">'));
  }
});

test("Name and description limits and duplicate checks are enforced", () => {
  assert.match(editMethod, /const name = editAlbumName\.trim\(\)/);
  assert.match(editMethod, /const description = editAlbumDescription\.trim\(\)/);
  assert.match(editMethod, /!name \|\| name\.length > 80/);
  assert.match(editMethod, /description\.length > 400/);
  assert.match(editMethod, /album\.id !== editingAlbumId/);
  assert.match(ui, /maxLength=\{80\}/);
  assert.match(ui, /maxLength=\{400\}/);
  assert.match(ui, /role="alert"/);
});

test("Update only album display metadata, never ID, owner, media or private R2", () => {
  assert.match(editMethod, /supabase\.auth\.getUser\(\)/);
  assert.match(editMethod, /\.from\("jb_media_albums"\)\s*\.update\(\{\s*name,\s*description,\s*is_visible: editAlbumVisible,\s*cover_style: coverStyle/);
  assert.match(editMethod, /\.eq\("id", editingAlbumId\)\s*\.select\("id, name, description, is_visible, cover_style"\)\s*\.single\(\)/);
  assert.doesNotMatch(editMethod, /\.delete\(|\.insert\(|\.from\("media"\)|created_by:|SUPABASE_SERVICE_ROLE_KEY|DeleteObjectCommand/);
});

test("Fail closed on denied or missing update; no false successful UI confirmation", () => {
  assert.match(editMethod, /if \(updateError \|\| !updated\?\.id\)/);
  assert.match(editMethod, /Only administrators can edit albums/);
  assert.match(editMethod, /setAlbumEditError\(/);
  assert.match(editMethod, /setSavingAlbum\(false\)/);
});

test("Changing albums cancels editing and does not silently upload", () => {
  assert.match(ui, /setAlbumId\(event\.target\.value\);\s*setEditingAlbumId\(""\)/);
  assert.match(ui, /if \(busy \|\| savingAlbum \|\| editingAlbumId \|\| !albumId/);
  assert.match(ui, /disabled=\{busy \|\| loading \|\| savingAlbum \|\| Boolean\(editingAlbumId\)/);
});

test("Editor does not nest a form inside the private upload form", () => {
  const uploadStart = ui.indexOf('<form onSubmit={submit}');
  const editBox = ui.indexOf('aria-label="Edit selected media album"');
  assert.ok(uploadStart > 0 && editBox > uploadStart);
  const nextClose = ui.indexOf("</form>", uploadStart);
  assert.ok(editBox < nextClose);
  const editor = ui.slice(editBox, nextClose);
  assert.doesNotMatch(editor, /<form/);
  assert.match(editor, /<button type="button" onClick=\{saveEditedAlbum\}/);
});

test("No changes to existing R2 cleanup controls and media upload request", () => {
  assert.match(manager, /<AdminR2CleanupQueue \/>/);
  assert.match(manager, /<AdminR2OrphanAudit \/>/);
  assert.match(ui, /stagingRequest\("delete-unpublished"/);
  assert.match(ui, /stagingRequest\("begin"/);
  assert.match(ui, /Upload Selected Files Privately/);
});
