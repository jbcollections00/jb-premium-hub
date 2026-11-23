// Phase 365: security regression, no network calls and no real media.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const client = read("src/services/privateMedia.js");
const home = read("src/pages/public/Home.jsx");
const signer = read("api/jb-branded-download.js");

test("Legacy private-media client supports playback only", () => {
  assert.match(client, /if \(action !== "play"\)/);
  assert.match(client, /Original-file download tickets are disabled/);
  assert.doesNotMatch(client, /action !== "play" && action !== "download"/);
  assert.match(client, /body: \{ media_id: mediaId, action \}/);
});
test("VIP download cannot fall back to old playback ticket endpoint", () => {
  assert.match(home, /requestBrandedDownloadUrl\(mediaId\)/);
  assert.doesNotMatch(home, /requestPrivateMediaUrl\(mediaId, "download"\)/);
  assert.match(client, /VITE_JB_BRANDED_DOWNLOAD_UI_ENABLED === "true"/);
  assert.match(signer, /process\.env\.JB_BRANDED_DOWNLOADS_ENABLED !== "true"/);
});
