import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const slot = readFileSync("src/components/AdSlot.jsx", "utf8");
const home = readFileSync("src/pages/public/Home.jsx", "utf8");
const discovery = readFileSync("src/services/homeDiscovery.js", "utf8");

test("native ad script stays inside an isolated sandbox iframe", () => {
  assert.match(slot, /sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"/);
  assert.doesNotMatch(slot, /allow-same-origin/);
  assert.match(slot, /srcDoc=\{frameHtml\}/);
  assert.match(slot, /event\.source !== frameRef\.current\?\.contentWindow/);
  assert.match(slot, /data\.instanceId !== instanceId\.current/);
});
test("blocked or no-fill creatives collapse and never leave a permanent blank slot", () => {
  assert.match(slot, /hasCreative\(\)/);
  assert.match(slot, /MutationObserver/);
  assert.match(slot, /notify\("empty", 0\)/);
  assert.match(slot, /EMPTY_TIMEOUT_MS = 12000/);
  assert.match(slot, /state === "filled" \? \(POSITIONS\[position\]/);
  assert.match(slot, /style=\{\{ height: state === "filled" \? height : 0 \}\}/);
  assert.match(slot, /loading="eager"/);
  assert.match(slot, /state === "filled" \? 1 : 0/);
  assert.match(slot, /Math\.max\(MIN_HEIGHT, Math\.min\(MAX_HEIGHT/);
});
test("paid access does not accidentally enable ads on VIP or Admin", () => {
  assert.match(discovery, /membership\?\.tier === "standard" \|\| membership\?\.tier === "free"/);
  assert.match(discovery, /membership\?\.showAds === true/);
  assert.match(home, /<AdSlot position="middle" enabled=\{adsEnabled\} \/>/);
});
