import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALBUM_COVER_STYLES,
  isAllowedAlbumCoverUrl,
  getApprovedAlbumCoverUrl,
  getAlbumCoverStyle,
} from "../../src/services/albumArtwork.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const manager = read("../../src/pages/admin/AdminAlbumsTab.jsx");
const home = read("../../src/components/home/HomeAlbumCollections.jsx");
const artwork = read("../../src/components/albums/AlbumCover.jsx");
const migration = read("../../supabase/migrations/20261117_phase333e_album_artwork.sql");

test("safe artwork URL accepts only the isolated public album-covers path", () => {
  const ok = "https://assets.jb-premium-hub.vip/album-covers/Educational_2026.webp";
  assert.equal(isAllowedAlbumCoverUrl(ok), true);
  assert.equal(getApprovedAlbumCoverUrl(ok), ok);
  for (const bad of [
    "",
    "https://cdn.jb-premium-hub.vip/videos/unsafe.mp4",
    "https://assets.jb-premium-hub.vip/thumbnails/legacy.jpg",
    "https://assets.jb-premium-hub.vip/album-covers/nested/file.jpg",
    "https://assets.jb-premium-hub.vip/album-covers/../unsafe.jpg",
    "https://assets.jb-premium-hub.vip/album-covers/unsafe.svg",
    "https://assets.jb-premium-hub.vip/album-covers/test.png?token=unsafe",
    "http://assets.jb-premium-hub.vip/album-covers/a.png",
    "https://other.example/album-covers/a.png",
  ]) {
    assert.equal(isAllowedAlbumCoverUrl(bad), false, bad);
    assert.equal(getApprovedAlbumCoverUrl(bad), null, bad);
  }
});

test("album appearance presets are limited and have neutral fallback", () => {
  assert.equal(ALBUM_COVER_STYLES.length, 6);
  assert.equal(getAlbumCoverStyle("ocean").key, "ocean");
  assert.equal(getAlbumCoverStyle("unknown").key, "indigo");
  assert.equal(getAlbumCoverStyle(null).key, "indigo");
});

test("admin album editor has search, responsive layout and custom static cover metadata", () => {
  assert.match(manager, /cover_image_url: cleanCoverUrl \|\| null/);
  assert.match(manager, /isAllowedAlbumCoverUrl\(cleanCoverUrl\)/);
  assert.match(manager, /setVisibility/);
  assert.match(manager, /deleteAlbum/);
  assert.match(manager, /searchTerm/);
  assert.match(manager, /visibilityFilter/);
  assert.match(manager, /sortBy/);
  assert.match(manager, /<AlbumCover album=\{album\} \/>/);
  assert.doesNotMatch(manager, /uploadFileToR2|requestPrivateMediaUrl|\.from\("media"\)/);
});

test("Home category tabs read album metadata only; custom covers stay in Admin", () => {
  assert.match(home, /select\("id, name, description, cover_style, cover_image_url"\)/);
  assert.match(home, /\.eq\("is_visible", true\)/);
  assert.match(home, /onSelectCategory/);
  assert.doesNotMatch(home, /<AlbumCover/);
  assert.match(home, /home-album-search/);
  assert.match(artwork, /getApprovedAlbumCoverUrl/);
  assert.match(artwork, /DEFAULT_THUMBNAIL_URL/);
  assert.doesNotMatch(home + artwork, /<video\b|\.from\("media"\)|video_url|media_url|uploadFileToR2/);
});

test("migration expands only album metadata and rejects external cover URLs", () => {
  assert.match(migration, /ALTER TABLE public\.jb_media_albums/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS cover_style/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS cover_image_url/);
  assert.match(migration, /jb_media_albums_cover_url_allowed/);
  assert.match(migration, /assets\\\.jb-premium-hub\\\.vip\/album-covers/);
  assert.doesNotMatch(migration, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public\.media|ALTER TABLE public\.media)\b/i);
});
