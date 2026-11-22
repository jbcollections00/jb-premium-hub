import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getThumbnailDisplayUrl, DEFAULT_THUMBNAIL_URL } from "../../src/services/thumbnailDisplay.js";
import thumbnailHandler, { approvedThumbnailKey } from "../../api/jb-published-thumbnail.js";

const home = readFileSync(new URL("../../src/pages/public/Home.jsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../../api/jb-published-thumbnail.js", import.meta.url), "utf8");
const mediaId = "4e9c9061-04d7-42ed-ba99-cd25be749276";
const otherId = "2ce36534-ddf0-49fb-a820-9610f2b2b8f2";
const userId = "dfcdc689-f6a9-4fb1-af3c-c04080865239";
const stagingKey = "staging/" + userId + "/" + mediaId + ".mp4";
const thumbnailKey = "staging-thumbnails/" + userId + "/" + mediaId + ".jpg";
const media = { id: mediaId, type: "video", media_url: "r2://jb-premium-private-videos/" + stagingKey };
const link = { staging_id: mediaId };
const staged = {
  id: mediaId, created_by: userId,
  uploaded_at: "2026-11-22T08:30:00Z",
  preview_uploaded_at: "2026-11-22T08:31:00Z",
  preview_key: thumbnailKey, storage_key: stagingKey,
};

test("Home removes Pinay/Asian category filter and controls completely", () => {
  for (const expression of [
    /pinay_asian/i,
    /Pinay \/ Asian/i,
    /handleUpdateCategory/,
    /Tag Category:/,
    /category\.ilike\.\%pinay/i,
  ]) {
    assert.doesNotMatch(home, expression);
  }
  // Phase 350 replaced the old All/Free category tabs with role-aware albums.
  assert.doesNotMatch(home, /handleCategoryChange/);
  assert.ok(!home.includes("All Videos</button>"));
  assert.ok(home.includes("getHomeMode("));
  assert.match(home, /jb_free_preview_catalog_v1/);
  assert.match(home, /jb_media_publication_links/);
});

test("Home and Most Watched display an approved artwork endpoint for default cover videos", () => {
  assert.equal(home.split("getThumbnailDisplayUrl(item.thumbnail_url, item.id)").length - 1, 2);
  assert.equal(
    getThumbnailDisplayUrl(DEFAULT_THUMBNAIL_URL, mediaId),
    "/api/jb-published-thumbnail?id=" + mediaId
  );
  assert.equal(getThumbnailDisplayUrl(null, mediaId), "/api/jb-published-thumbnail?id=" + mediaId);
});

test("Existing custom asset covers remain untouched", () => {
  const alreadyPublic = "https://assets.jb-premium-hub.vip/thumbnails/published/" + otherId + ".jpg";
  assert.equal(getThumbnailDisplayUrl(alreadyPublic, mediaId), alreadyPublic);
  assert.equal(getThumbnailDisplayUrl("data:image/png;base64,AAAA", mediaId), "data:image/png;base64,AAAA");
  assert.equal(getThumbnailDisplayUrl(DEFAULT_THUMBNAIL_URL), DEFAULT_THUMBNAIL_URL);
  assert.equal(getThumbnailDisplayUrl(DEFAULT_THUMBNAIL_URL, "../../etc/passwd"), DEFAULT_THUMBNAIL_URL);
});

test("Exactly published, linked private MP4 yields its approved JPEG key", () => {
  assert.equal(approvedThumbnailKey(media, link, staged, mediaId), thumbnailKey);
});

test("Unpublished media cannot expose a private staging thumbnail", () => {
  assert.equal(approvedThumbnailKey(media, null, staged, mediaId), null);
  assert.equal(approvedThumbnailKey(null, link, staged, mediaId), null);
  assert.equal(approvedThumbnailKey(media, { staging_id: otherId }, staged, mediaId), null);
  assert.equal(approvedThumbnailKey({ ...media, type: "image" }, link, staged, mediaId), null);
});

test("Only exact staged JPEG/video keys and media IDs are accepted", () => {
  assert.equal(approvedThumbnailKey(media, link, { ...staged, preview_key: "staging-thumbnails/" + userId + "/" + otherId + ".jpg" }, mediaId), null);
  assert.equal(approvedThumbnailKey(media, link, { ...staged, storage_key: "staging/" + userId + "/" + otherId + ".mp4" }, mediaId), null);
  assert.equal(approvedThumbnailKey({ ...media, media_url: "r2://another-bucket/" + stagingKey }, link, staged, mediaId), null);
  assert.equal(approvedThumbnailKey({ ...media, id: otherId }, link, staged, mediaId), null);
  assert.equal(approvedThumbnailKey(media, link, staged, otherId), null);
});

test("Unverified/missing thumbnail metadata blocks public image access", () => {
  assert.equal(approvedThumbnailKey(media, link, { ...staged, preview_uploaded_at: null }, mediaId), null);
  assert.equal(approvedThumbnailKey(media, link, { ...staged, uploaded_at: null }, mediaId), null);
  assert.equal(approvedThumbnailKey(media, link, { ...staged, created_by: "invalid" }, mediaId), null);
});

function fakeResponse() {
  return {
    statusCode: 200, headers: {}, sent: false,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(s) { this.statusCode = s; return this; },
    end() { this.sent = true; return this; }
  };
}

test("Read-only endpoint refuses POST and invalid media IDs before cloud access", async () => {
  for (const req of [
    { method: "POST", query: { id: mediaId } },
    { method: "GET", query: { id: "not-a-uuid" } },
    { method: "GET", query: { id: ["id", "another"] } },
  ]) {
    const res = fakeResponse();
    await thumbnailHandler(req, res);
    assert.equal(res.statusCode, req.method === "POST" ? 405 : 404);
    assert.equal(res.headers["Cache-Control"], "private, no-store, max-age=0");
    assert.equal(res.sent, true);
  }
});

test("Endpoint re-checks publication link and live media before touching R2", () => {
  assert.match(api, /\.from\("media"\)/);
  assert.match(api, /\.from\("jb_media_publication_links"\)/);
  assert.match(api, /\.from\("jb_media_upload_staging"\)/);
  assert.match(api, /approvedThumbnailKey\(media, link, staged, input\)/);
  assert.ok(api.indexOf('approvedThumbnailKey(media, link, staged, input)') < api.indexOf("new HeadObjectCommand"));
});

test("Endpoint reads JPEG only; never emits an R2 signed URL or private video bytes", () => {
  assert.match(api, /new HeadObjectCommand/);
  assert.match(api, /new GetObjectCommand/);
  assert.match(api, /head\.ContentType !== "image\/jpeg"/);
  assert.match(api, /Content-Type", "image\/jpeg"/);
  assert.match(api, /bytes\[0\] !== 0xff/);
  assert.match(api, /MAX_JPEG_BYTES = 1024 \* 1024/);
  assert.doesNotMatch(api, /getSignedUrl/);
  assert.doesNotMatch(api, /PutObjectCommand/);
});

test("Existing paid/private video playback and FREE membership logic preserved", () => {
  assert.match(home, /requestPrivateMediaUrl/);
  assert.match(home, /requestFreePreviewUrl/);
  assert.match(home, /getBillingAccess/);
  assert.match(home, /shouldDisplayAds/);
  assert.match(home, /adsEnabled/);
  assert.match(home, /jb_free_preview_catalog_v1/);
});
