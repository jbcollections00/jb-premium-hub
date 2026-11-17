import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const dashboard = read("../../src/pages/admin/AdminDashboard.jsx");
const uploader = read("../../src/components/admin/AdminPrivateAlbumUpload.jsx");
const previousAdmin = read("../../src/pages/admin/AdminMediaTab.jsx");
const stagingAPI = read("../../api/jb-admin-staging-upload.js");
const thumbnails = read("../../src/services/thumbnailDisplay.js");

test("Admin sidebar works as mobile/narrow-window drawer with menu and close controls", () => {
  assert.match(dashboard, /const \[mobileNavOpen, setMobileNavOpen\] = useState\(false\)/);
  assert.match(dashboard, /aria-controls="jbh-admin-sidebar"/);
  assert.match(dashboard, /aria-expanded=\{mobileNavOpen\}/);
  assert.match(dashboard, /lg:hidden/);
  assert.match(dashboard, /lg:translate-x-0/);
  assert.match(dashboard, /-translate-x-full/);
  assert.match(dashboard, /aria-label="Close admin navigation"/);
  assert.match(dashboard, /event\.key === 'Escape'/);
  assert.match(dashboard, /setActiveTab\(item\.id\); setMobileNavOpen\(false\)/);
  assert.match(dashboard, /id="jbh-admin-sidebar"/);
  assert.match(dashboard, /className="flex flex-col gap-1\.5" aria-label="Admin workspace navigation"/);
});

test("bulk private upload displays real per-file and overall byte progress", () => {
  assert.match(uploader, /multiple\s+disabled=\{busy\}/);
  assert.match(uploader, /new XMLHttpRequest\(\)/);
  assert.match(uploader, /xhr\.upload\.onprogress/);
  assert.match(uploader, /onProgress\(Math\.min\(file\.size/);
  assert.match(uploader, /sentBytes \/ totalBytes \* 100/);
  assert.match(uploader, /aria-label="Overall upload progress"/);
  assert.match(uploader, /aria-label=\{"Upload " \+ item\.name\}/);
  assert.match(uploader, /role="progressbar"/);
  assert.match(uploader, /doneCount/);
  assert.match(uploader, /failedCount/);
  assert.match(uploader, /for \(let index = 0; index < files\.length; index \+= 1\)/);
  assert.match(uploader, /100% transferred means bytes were sent/);
  assert.match(uploader, /Server verification pending/);
});

test("upload failures are represented per file, and later files can continue", () => {
  assert.match(uploader, /for \(let index = 0; index < files\.length; index \+= 1\)/);
  assert.match(uploader, /catch \(error\) \{\s*failures \+= 1;\s*updateQueue\(index,/);
  assert.match(uploader, /status: "failed"/);
  assert.match(uploader, /status: "verifying"/);
  assert.match(uploader, /status: "done"/);
  assert.match(uploader, /status: "preparing"/);
  assert.match(uploader, /status: "uploading"/);
});

test("new progress UI does not publish or extract video-frame thumbnails", () => {
  assert.match(uploader, /stagingRequest\("begin"/);
  assert.match(uploader, /stagingRequest\("complete"/);
  assert.match(uploader, /\.from\("jb_media_upload_staging"\)/);
  assert.match(stagingAPI, /"pending_review"/);
  assert.match(previousAdmin, /LEGACY_PUBLIC_VIDEO_UPLOAD_DISABLED = true/);
  assert.match(thumbnails, /DEFAULT_THUMBNAIL_URL/);
  assert.doesNotMatch(uploader, /\.from\("media"\)|publicUrl|canvas\.toDataURL|ffmpeg|createImageBitmap/);
});
