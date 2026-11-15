import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_THUMBNAIL_URL,
  LOCAL_THUMBNAIL_FALLBACK,
  getThumbnailDisplayUrl,
  handleThumbnailLoadError,
} from "../../src/services/thumbnailDisplay.js";

test("missing thumbnails use the shared logo without saving placeholders", () => {
  assert.equal(getThumbnailDisplayUrl(null), DEFAULT_THUMBNAIL_URL);
  assert.equal(getThumbnailDisplayUrl(""), DEFAULT_THUMBNAIL_URL);
  assert.equal(getThumbnailDisplayUrl("   "), DEFAULT_THUMBNAIL_URL);
  assert.equal(getThumbnailDisplayUrl(undefined), DEFAULT_THUMBNAIL_URL);
});

test("existing inline thumbnails are preserved, including older SVG data images", () => {
  for (const url of [
    "data:image/png;base64,aGVsbG8=",
    "data:image/jpeg;base64,aGVsbG8=",
    "data:image/svg+xml;charset=UTF-8,%3Csvg%3E%3C/svg%3E",
  ]) assert.equal(getThumbnailDisplayUrl(url), url);
});

test("already-public images retain their asset URLs", () => {
  const uri = "https://assets.jb-premium-hub.vip/thumbnails/approved-cover.webp";
  assert.equal(getThumbnailDisplayUrl(uri), uri);
  assert.equal(
    getThumbnailDisplayUrl("thumbnails/approved-cover.webp"),
    uri
  );
});

test("retired private-CDN thumbnail paths try only approved public-assets copies", () => {
  for (const host of [
    "https://cdn.jb-premium-hub.vip",
    "https://pub-0123456789abcdef.r2.dev",
  ]) {
    assert.equal(
      getThumbnailDisplayUrl(`${host}/thumbnails/approved-cover.jpg`),
      "https://assets.jb-premium-hub.vip/thumbnails/approved-cover.jpg"
    );
    assert.equal(
      getThumbnailDisplayUrl(`${host}/videos/private.mp4`),
      DEFAULT_THUMBNAIL_URL
    );
  }
});

test("untrusted URLs and non-image data never become thumbnail sources", () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,<img>",
    "https://untrusted.example/video.jpg",
    "ftp://assets.jb-premium-hub.vip/thumbnails/x.jpg",
    "/videos/private.mp4",
  ]) {
    assert.equal(getThumbnailDisplayUrl(bad), DEFAULT_THUMBNAIL_URL);
  }
});

test("a failed image falls back exactly once to the bundled logo", () => {
  const img = { src: "https://assets.jb-premium-hub.vip/thumbnails/test.jpg", onerror() {} };
  handleThumbnailLoadError({ currentTarget: img });
  assert.equal(img.src, LOCAL_THUMBNAIL_FALLBACK);
  assert.equal(img.onerror, null);
});
