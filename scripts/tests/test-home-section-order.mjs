import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync(
  new URL("../../src/pages/public/Home.jsx", import.meta.url),
  "utf8"
);

test("Most Watched appears before Media Library with dynamic album tabs in filters", () => {
  const mostWatched = home.indexOf("{/* MOST WATCHED VIDEOS SHOWCASE SECTION */}");
  const albums = home.indexOf("<HomeAlbumCollections");
  const mediaLibrary = home.indexOf("{/* VAULT MEDIA LIST HEADER */}");
  const mediaGrid = home.indexOf("{/* MAIN VIDEO GRID */}");

  assert.ok(mostWatched !== -1, "Most Watched section must exist");
  assert.ok(albums !== -1, "Dynamic album category tabs must exist");
  assert.ok(mediaLibrary !== -1, "Media library section must exist");
  assert.ok(mediaGrid !== -1, "Media library section must exist");
  assert.ok(mostWatched < mediaLibrary, "Most Watched must precede Media Library");
  assert.ok(mediaLibrary < albums, "Albums must appear in the Media Library filter row");
  assert.ok(albums < mediaGrid, "Album filters must precede the video grid");
  assert.equal(home.split("<HomeAlbumCollections").length - 1, 1, "Album tabs render once");
});
