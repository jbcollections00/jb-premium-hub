import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capturePrivateVideoPreview } from "../../src/services/privateVideoPreview.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const api = read("../../api/jb-admin-staging-upload.js");
const legacy = read("../../api/r2-upload-url.js");
const admin = read("../../src/pages/admin/AdminMediaTab.jsx");
const uploader = read("../../src/components/admin/AdminPrivateAlbumUpload.jsx");
const dashboard = read("../../src/pages/admin/AdminDashboard.jsx");

test("new upload only uses the separate private R2 bucket", () => {
  assert.match(api, /const PRIVATE_BUCKET = "jb-premium-private-videos"/);
  assert.match(api, /JB_STAGING_R2_BUCKET_NAME !== PRIVATE_BUCKET/);
  assert.match(api, /JB_STAGING_R2_BUCKET_NAME === process.env.R2_BUCKET_NAME/);
  assert.doesNotMatch(api, /publicUrl:|R2_PUBLIC_URL/);
});

test("server confirms signed-in admin before issuing upload URLs", () => {
  assert.match(api, /services.supabase.auth.getUser\(token\)/);
  assert.match(api, /isAdmin \? userResult.user : null/);
  assert.match(api, /new PutObjectCommand/);
  assert.match(api, /new HeadObjectCommand/);
  assert.match(api, /Number\(metadata.ContentLength\) !== Number\(row.size_bytes\)/);
  assert.match(api, /status: "pending_review"/);
  assert.doesNotMatch(api, /\.from\(["']media["']\)/);
});

test("server limits upload to supported MP4 with 2GB ceiling", () => {
  assert.match(api, /const MIME_BY_EXTENSION = \{ mp4: "video\/mp4" \}/);
  assert.match(api, /const MAX_SIZE_BYTES = 2 \* 1024 \* 1024 \* 1024/);
  assert.match(uploader, /new Set\(\["mp4"\]\)/);
});

test("old public R2 API refuses video upload signing", () => {
  assert.match(legacy, /Public video uploads are disabled. Use Private Album Upload/);
  assert.match(legacy, /safeFolder === "videos"/);
  assert.match(legacy, /safeFolder.startsWith\("videos\/"\)/);
  assert.match(legacy, /\.status\(410\)/);
});

test("Media Manager mounts private uploader and not old public video uploader", () => {
  assert.match(admin, /<AdminPrivateAlbumUpload \/>/);
  assert.match(admin, /const LEGACY_PUBLIC_VIDEO_UPLOAD_DISABLED = true/);
  assert.match(admin, /!LEGACY_PUBLIC_VIDEO_UPLOAD_DISABLED && activeTab/);
  assert.match(admin, /if \(LEGACY_PUBLIC_VIDEO_UPLOAD_DISABLED\)/);
  assert.match(uploader, /stagingRequest\("begin"/);
  assert.match(uploader, /stagingRequest\("complete"/);
  assert.doesNotMatch(uploader, /createR2UploadUrl|publicUrl|\.from\(["']media["']\)/);
});

test("bulk upload gives individual and aggregate byte progress", () => {
  assert.match(uploader, /new XMLHttpRequest\(\)/);
  assert.match(uploader, /xhr.upload.onprogress/);
  assert.match(uploader, /sentBytes \/ totalBytes \* 100/);
  assert.match(uploader, /aria-label="Overall upload progress"/);
  assert.match(uploader, /role="progressbar"/);
  assert.match(uploader, /for \(let index = 0; index < files.length; index \+= 1\)/);
  assert.match(uploader, /Server verification pending/);
});

test("failed file does not stop the next file in sequential queue", () => {
  assert.match(uploader, /status: "failed"/);
  assert.match(uploader, /status: "verifying"/);
  assert.match(uploader, /status: "done"/);
  assert.match(uploader, /catch \(error\) \{\s*failures \+= 1/);
});

test("only private thumbnail PUT/GET, no public thumbnails from staging", () => {
  assert.match(api, /new GetObjectCommand/);
  assert.match(api, /staging-thumbnails\//);
  assert.match(api, /row.preview_key !== previewKey\(admin.id, row.id\)/);
  assert.match(uploader, /capturePrivateVideoPreview\(file\)/);
  assert.match(uploader, /stagingRequest\("thumbnail-complete"/);
  assert.match(uploader, /DEFAULT_THUMBNAIL_URL/);
});

test("admin mobile drawer has Escape, backdrop, menu, and close controls", () => {
  assert.match(dashboard, /const \[mobileNavOpen, setMobileNavOpen\] = useState\(false\)/);
  assert.match(dashboard, /aria-controls="jbh-admin-sidebar"/);
  assert.match(dashboard, /aria-expanded=\{mobileNavOpen\}/);
  assert.match(dashboard, /lg:translate-x-0/);
  assert.match(dashboard, /-translate-x-full/);
  assert.match(dashboard, /event.key === 'Escape'/);
  assert.match(dashboard, /setMobileNavOpen\(false\)/);
});

test("private API rejects unauthorized requests before credentials or R2", async () => {
  const { default: handler } = await import("../../api/jb-admin-staging-upload.js");
  const response = () => ({
    statusCode: 200, headers: {},
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  });
  const unauthorized = response();
  await handler({ method: "POST", headers: { origin: "https://www.jb-premium-hub.vip" } }, unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  const wrongOrigin = response();
  await handler({ method: "POST", headers: { origin: "https://attacker.example" } }, wrongOrigin);
  assert.equal(wrongOrigin.statusCode, 403);
  const wrongMethod = response();
  await handler({ method: "GET", headers: { origin: "https://www.jb-premium-hub.vip" } }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
});

async function runPreview(portrait, duration) {
  const oldDocument = globalThis.document;
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  const positions = [], draws = [], revoked = [];
  const video = new EventTarget();
  video.duration = duration;
  video.videoWidth = portrait ? 480 : 1920;
  video.videoHeight = portrait ? 960 : 1080;
  video.readyState = 4;
  video.pause = () => {};
  video.removeAttribute = () => {};
  video.load = () => queueMicrotask(() => video.dispatchEvent(new Event("loadedmetadata")));
  let position = 0;
  Object.defineProperty(video, "currentTime", {
    get() { return position; },
    set(value) { position = value; positions.push(value); queueMicrotask(() => video.dispatchEvent(new Event("seeked"))); },
  });
  try {
    globalThis.document = {
      createElement(tag) {
        if (tag === "video") return video;
        if (tag !== "canvas") throw new Error("Unexpected DOM node");
        return {
          width: 0, height: 0,
          getContext: () => ({ drawImage: (...args) => draws.push(args) }),
          toBlob: (cb) => cb(new Blob(["jpeg"], { type: "image/jpeg" })),
        };
      },
    };
    URL.createObjectURL = () => "blob:phase337-test";
    URL.revokeObjectURL = (url) => revoked.push(url);
    const output = await capturePrivateVideoPreview(new Blob(["bytes"], { type: "video/mp4" }));
    return { output, positions, draws, revoked };
  } finally {
    globalThis.document = oldDocument;
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
  }
}

test("landscape thumbnail captures ONE frame near 22 seconds", async () => {
  const r = await runPreview(false, 80);
  assert.equal(r.output?.type, "image/jpeg");
  assert.equal(r.draws.length, 1);
  assert.ok(Math.abs(r.positions[0] - 22) < 0.01);
  assert.deepEqual(r.revoked, ["blob:phase337-test"]);
});

test("portrait thumbnail combines THREE frames starting near 22 seconds", async () => {
  const r = await runPreview(true, 80);
  assert.equal(r.output?.type, "image/jpeg");
  assert.equal(r.draws.length, 3);
  assert.equal(r.positions.length, 3);
  assert.ok(Math.abs(r.positions[0] - 22) < 0.01);
  assert.ok(r.positions[1] > r.positions[0]);
  assert.ok(r.positions[2] > r.positions[1]);
  assert.deepEqual(r.revoked, ["blob:phase337-test"]);
});

test("very short video falls back to a valid mid-video frame", async () => {
  const r = await runPreview(false, 20);
  assert.equal(r.draws.length, 1);
  assert.ok(r.positions[0] > 0 && r.positions[0] < 20);
});

test("empty file returns no thumbnail without generating objects", async () => {
  assert.equal(await capturePrivateVideoPreview(new Blob([])), null);
});
