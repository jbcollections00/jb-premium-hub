import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync(
  new URL("../../src/pages/public/Home.jsx", import.meta.url),
  "utf8"
);

test("Most Watched appears before Explore Albums, followed by media grid", () => {
  const mostWatched = home.indexOf("{/* MOST WATCHED VIDEOS SHOWCASE SECTION */}");
  const albums = home.indexOf("<HomeAlbumCollections />");
  const mediaGrid = home.indexOf("{/* VAULT MEDIA LIST HEADER */}");

  assert.ok(mostWatched !== -1, "Most Watched section must exist");
  assert.ok(albums !== -1, "Explore Albums section must exist");
  assert.ok(mediaGrid !== -1, "Media library section must exist");
  assert.ok(mostWatched < albums, "Most Watched must precede Explore Albums");
  assert.ok(albums < mediaGrid, "Explore Albums must precede the media library");
  assert.equal(home.split("<HomeAlbumCollections />").length - 1, 1, "Album cards appear once");
});
