// Offline release regression for the branded VIP download availability UI.
// This test never calls production endpoints or reads uploaded video files.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const home = read("src/pages/public/Home.jsx");
const service = read("src/services/privateMedia.js");
const endpoint = read("api/jb-branded-download.js");

test("Frontend download availability is opt-in and disabled by default", () => {
  assert.match(service, /export const BRANDED_DOWNLOAD_UI_ENABLED\s*=\s*import\.meta\.env\.VITE_JB_BRANDED_DOWNLOAD_UI_ENABLED === "true"/);
  assert.match(service, /if \(!BRANDED_DOWNLOAD_UI_ENABLED\)/);
  assert.match(service, /throw new Error\("Downloads temporarily unavailable"\)/);
});
test("VIP download button is disabled when UI release flag is off", () => {
  assert.match(home, /disabled=\{downloadBusy \|\| !BRANDED_DOWNLOAD_UI_ENABLED\}/);
  assert.match(home, /if \(!BRANDED_DOWNLOAD_UI_ENABLED \|\| !canDownload/);
  assert.match(home, /Downloads are temporarily unavailable\. VIP playback and ad-free access remain available\./);
  assert.match(home, /\{canDownload && \(/);
});
test("No old original-media download path or browser blob fallback", () => {
  assert.match(home, /requestBrandedDownloadUrl\(mediaId\)/);
  assert.match(home, /window\.location\.assign\(signedUrl\)/);
  assert.doesNotMatch(home, /requestPrivateMediaUrl\(mediaId, "download"\)/);
  assert.match(endpoint, /process\.env\.JB_BRANDED_DOWNLOADS_ENABLED !== "true"/);
  assert.match(endpoint, /job\.status !== "ready"/);
});
