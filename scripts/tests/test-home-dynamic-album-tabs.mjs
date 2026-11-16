import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const home = read("../../src/pages/public/Home.jsx");
const albumTabs = read("../../src/components/home/HomeAlbumCollections.jsx");

test("Media Library shows admin-created albums as category tabs instead of a separate cards section", () => {
  const header = home.indexOf("{/* VAULT MEDIA LIST HEADER */}");
  const filter = home.indexOf("{/* CATEGORY TABS */}");
  const dynamic = home.indexOf("<HomeAlbumCollections");
  const grid = home.indexOf("{/* MAIN VIDEO GRID */}");

  assert.ok(header >= 0 && filter > header && dynamic > filter && grid > dynamic);
  assert.equal(home.split("<HomeAlbumCollections").length - 1, 1);
  assert.doesNotMatch(home, /Pinay \/ Asian|onClick=\{\(\) => handleCategoryChange\("pinay_asian"\)\}/);
  assert.doesNotMatch(home, /Explore Albums/);
});

test("album categories come only from visible admin album metadata and are selectable", () => {
  assert.match(albumTabs, /\.from\("jb_media_albums"\)/);
  assert.match(albumTabs, /\.eq\("is_visible", true\)/);
  assert.match(albumTabs, /album\.name/);
  assert.match(albumTabs, /onSelectCategory\?\.\(categoryKey\)/);
  assert.match(albumTabs, /"album:" \+ album\.id/);
  assert.match(home, /onSelectCategory=\{handleCategoryChange\}/);
  assert.match(albumTabs, /home-album-search/);
  assert.doesNotMatch(albumTabs, /\.from\("media"\)|<video\b|media_url|requestPrivateMediaUrl|uploadFileToR2/);
});

test("album selection never falls through to unrestricted legacy media queries", () => {
  const categoryBlock = home.indexOf('if (typeof category === "string" && category.startsWith("album:"))');
  const mediaRead = home.indexOf('let query = supabase.from("media")');
  assert.ok(categoryBlock >= 0 && mediaRead > categoryBlock);
  assert.match(home, /category\.startsWith\("album:"\)[\s\S]*?setMediaList\(\[\]\);[\s\S]*?setTotalCount\(0\);[\s\S]*?return;/);
  assert.match(home, /LEGACY_CATALOG_HOME_HOLD/);
});

test("home preserves All Videos and optional Free to Watch access, without old category selector", () => {
  assert.match(home, /handleCategoryChange\("all"\)/);
  assert.match(home, /FREE_PREVIEW_UI_ENABLED && \(/);
  assert.match(home, /handleCategoryChange\("free"\)/);
  assert.doesNotMatch(home, /<option value="pinay_asian"/);
  assert.doesNotMatch(home, /category\.eq\.pinay_asian/);
});
