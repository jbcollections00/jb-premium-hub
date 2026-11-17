import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capturePrivateVideoPreview } from "../../src/services/privateVideoPreview.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const api = read("../../api/jb-admin-staging-upload.js");
const ui = read("../../src/components/admin/AdminPrivateAlbumUpload.jsx");
const util = read("../../src/services/privateVideoPreview.js");
const migration = read("../../supabase/migrations/20261117_phase333m_private_staging_thumbnail_preview.sql");

test("private preview database fields do not change published media or grants", () => {
  assert.match(migration, /ALTER TABLE public\.jb_media_upload_staging/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS preview_key text/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS preview_uploaded_at timestamptz/);
  assert.match(migration, /staging-thumbnails\//);
  assert.doesNotMatch(migration, /UPDATE\s+public\.media|INSERT\s+INTO\s+public\.media|DROP\s+TABLE|GRANT SELECT ON .* TO anon/i);
});

test("preview upload and GET are authenticated, owner-scoped, and private", () => {
  assert.match(api, /const PREVIEW_MIME = "image\/jpeg"/);
  assert.match(api, /const MAX_PREVIEW_BYTES = 1024 \* 1024/);
  assert.match(api, /\.eq\("created_by", admin\.id\)/);
  assert.match(api, /\.eq\("status", "pending_review"\)/);
  assert.match(api, /new PutObjectCommand/);
  assert.match(api, /new HeadObjectCommand/);
  assert.match(api, /new GetObjectCommand/);
  assert.match(api, /"thumbnail-begin"/);
  assert.match(api, /"thumbnail-complete"/);
  assert.match(api, /"thumbnail-previews"/);
  assert.match(api, /row\.preview_key !== previewKey\(admin\.id, row\.id\)/);
  assert.doesNotMatch(api, /R2_PUBLIC_URL|publicUrl:|\.from\(["']media["']\)/);
});

test("browser creates video-frame JPEG privately and cleans temporary URLs", () => {
  assert.match(util, /document\.createElement\("video"\)/);
  assert.match(util, /document\.createElement\("canvas"\)/);
  assert.match(util, /context\.drawImage\(/);
  assert.match(util, /canvas\.toBlob\(/);
  assert.match(util, /URL\.revokeObjectURL\(blobUrl\)/);
  assert.doesNotMatch(util, /PUBLIC_THUMBNAIL_ORIGIN|public-assets|\.from\("media"\)/);
});

test("admin UI shows per-file images and refreshed private thumbnails, fallback logo", () => {
  assert.match(ui, /capturePrivateVideoPreview\(file\)/);
  assert.match(ui, /stagingRequest\("thumbnail-begin"/);
  assert.match(ui, /stagingRequest\("thumbnail-complete"/);
  assert.match(ui, /stagingRequest\("thumbnail-previews"/);
  assert.match(ui, /privatePreviews\[draft\.id\] \|\| DEFAULT_THUMBNAIL_URL/);
  assert.match(ui, /item\.previewUrl \|\| DEFAULT_THUMBNAIL_URL/);
  assert.match(ui, /handleThumbnailLoadError/);
  assert.match(ui, /status: "done"/);
  assert.match(ui, /"pending_review"/);
  assert.doesNotMatch(ui, /\.from\("media"\)|R2_PUBLIC_URL|publicUrl:/);
});

test("browser JPEG poster succeeds for supported video frames and revokes blob URL", async () => {
  const prevDocument = globalThis.document;
  const previousCreate = URL.createObjectURL;
  const previousRevoke = URL.revokeObjectURL;
  const revoked = [];
  let drew = false;
  const mockVideo = new EventTarget();
  mockVideo.duration = 9;
  mockVideo.videoWidth = 1920;
  mockVideo.videoHeight = 1080;
  mockVideo.readyState = 4;
  let currentTime = 0;
  Object.defineProperty(mockVideo, "currentTime", {
    set(value) {
      currentTime = value;
      queueMicrotask(() => mockVideo.dispatchEvent(new Event("seeked")));
    },
    get() { return currentTime; },
  });
  mockVideo.load = () => {
    queueMicrotask(() => mockVideo.dispatchEvent(new Event("loadedmetadata")));
  };
  mockVideo.pause = () => {};
  mockVideo.removeAttribute = () => {};
  try {
    globalThis.document = {
      createElement(tag) {
        if (tag === "video") return mockVideo;
        if (tag !== "canvas") throw new Error("Unexpected tag");
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: () => { drew = true; },
          }),
          toBlob: (callback) =>
            callback(new Blob(["generated-jpeg"], { type: "image/jpeg" })),
        };
      },
    };
    URL.createObjectURL = () => "blob:private-preview-test";
    URL.revokeObjectURL = (url) => revoked.push(url);
    const output = await capturePrivateVideoPreview(new Blob(["test-file"], { type: "video/mp4" }));
    assert.equal(output.type, "image/jpeg");
    assert.ok(output.size > 0);
    assert.equal(currentTime, 1);
    assert.equal(drew, true);
    assert.deepEqual(revoked, ["blob:private-preview-test"]);
  } finally {
    globalThis.document = prevDocument;
    URL.createObjectURL = previousCreate;
    URL.revokeObjectURL = previousRevoke;
  }
});

test("empty files never trigger frame generation", async () => {
  const output = await capturePrivateVideoPreview(new Blob([]));
  assert.equal(output, null);
});
