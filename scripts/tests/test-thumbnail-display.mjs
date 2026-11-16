// JB Premium Hub — non-content static thumbnail fallback regression tests.
// Does not request or inspect video media or remote thumbnails.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getThumbnailDisplayUrl,
  handleThumbnailLoadError,
  PUBLIC_THUMBNAIL_ORIGIN,
  DEFAULT_THUMBNAIL_URL,
  LOCAL_THUMBNAIL_FALLBACK,
} from "../../src/services/thumbnailDisplay.js";

test("null, empty and invalid thumbnail values use shared JB logo", () => {
  for (const v of [null, undefined, "", " ", "javascript:alert(1)", "blob:local", "https://untrusted.example/image.jpg"]) {
    assert.equal(getThumbnailDisplayUrl(v), DEFAULT_THUMBNAIL_URL);
  }
});

test("preserves already published public-assets thumbnail and legacy embedded image data", () => {
  const url = PUBLIC_THUMBNAIL_ORIGIN + "/thumbnails/auto/317g/test.jpg";
  assert.equal(getThumbnailDisplayUrl(url), url);
  const svg = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
  assert.equal(getThumbnailDisplayUrl(svg),svg);
});

test("never fetches video CDN for thumbnail fallback", () => {
  assert.equal(getThumbnailDisplayUrl("https://cdn.jb-premium-hub.vip/video.mp4"),DEFAULT_THUMBNAIL_URL);
  assert.equal(getThumbnailDisplayUrl("https://pub-ab12cd34.r2.dev/video.mp4"),DEFAULT_THUMBNAIL_URL);
  assert.equal(getThumbnailDisplayUrl("/thumbnails/logo.png"),PUBLIC_THUMBNAIL_ORIGIN + "/thumbnails/logo.png");
});

test("image-load error falls back once to local static logo", () => {
  const img={src:"https://example.invalid/broken.jpg",onerror:()=>{}};
  handleThumbnailLoadError({currentTarget:img});
  assert.equal(img.src,LOCAL_THUMBNAIL_FALLBACK);
  assert.equal(img.onerror,null);
});

test("home cards never request video metadata for thumbnail generation", async () => {
  const home=await readFile(new URL("../../src/pages/public/Home.jsx",import.meta.url),"utf8");
  assert.equal((home.match(/src=\{getThumbnailDisplayUrl\(item\.thumbnail_url\)\}/g)||[]).length,2);
  assert.equal((home.match(/#t=1/g)||[]).length,0);
  assert.equal((home.match(/onError=\{handleThumbnailLoadError\}/g)||[]).length,2);
  assert.ok(!home.includes("Preview unavailable"));
});

test("local JB logo fallback file exists and has PNG header", async () => {
  const img=await readFile(new URL("../../public/jb-logo.png",import.meta.url));
  assert.ok(img.length>8);
  assert.equal(img.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
});
