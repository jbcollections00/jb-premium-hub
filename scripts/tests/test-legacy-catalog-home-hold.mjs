import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const home = read("../../src/pages/public/Home.jsx");
const hold = read("../../src/services/legacyCatalogHold.js");
const privateMedia = read("../../src/services/privateMedia.js");
const freeMedia = read("../../src/services/freePreview.js");
const albumCards = read("../../src/components/home/HomeAlbumCollections.jsx");

test("legacy catalog hold defaults ON and is not a destructive action", () => {
  assert.match(hold, /export const LEGACY_CATALOG_HOME_HOLD = true/);
  assert.doesNotMatch(hold, /TRUNCATE|DELETE FROM|uploadFileToR2|\.delete\(/i);
});

test("Home suppresses legacy grid, popular listings, and selected playback", () => {
  assert.match(home, /if \(LEGACY_CATALOG_HOME_HOLD\) \{\s*setMostWatched\(\[\]\);/);
  assert.match(home, /if \(LEGACY_CATALOG_HOME_HOLD\) \{\s*setMediaList\(\[\]\);\s*setTotalCount\(0\);/);
  assert.match(home, /const selectedCanPlay = !LEGACY_CATALOG_HOME_HOLD/);
  assert.match(home, /const canDownload = !LEGACY_CATALOG_HOME_HOLD/);
  assert.match(home, /if \(LEGACY_CATALOG_HOME_HOLD \|\| !PRIVATE_MEDIA_UI_ENABLED/);
  assert.match(home, /if \(LEGACY_CATALOG_HOME_HOLD \|\| !FREE_PREVIEW_UI_ENABLED/);
  assert.match(home, /Previously listed videos are not displayed here/);
});

test("client video ticket functions fail closed during legacy hold", () => {
  assert.match(privateMedia, /if \(LEGACY_CATALOG_HOME_HOLD\) \{\s*throw new Error/);
  assert.match(freeMedia, /if \(LEGACY_CATALOG_HOME_HOLD\) \{\s*throw new Error/);
});

test("album directory remains visible and old media is not deleted", () => {
  assert.match(home, /<HomeAlbumCollections \/>/);
  assert.match(albumCards, /\.from\("jb_media_albums"\)/);
  assert.ok(home.indexOf("{/* MOST WATCHED VIDEOS SHOWCASE SECTION */}") < home.indexOf("<HomeAlbumCollections />"));
  assert.doesNotMatch(home, /\.from\("media"\)\.delete\(/);
});
