import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const slot = readFileSync("src/components/AdSlot.jsx", "utf8");
const home = readFileSync("src/pages/public/Home.jsx", "utf8");
const discovery = readFileSync("src/services/homeDiscovery.js", "utf8");

test("native banner placement is visible again without blank-on-load 0px collapse", () => {
  assert.match(slot, /NATIVE_SCRIPT_URL/);
  assert.match(slot, /NATIVE_CONTAINER_ID/);
  assert.match(slot, /<iframe/);
  assert.match(slot, /srcDoc=\{adHtml\}/);
  assert.doesNotMatch(slot, /state === "filled" \? height : 0/);
  assert.doesNotMatch(slot, /state === "filled" \? \(POSITIONS/);
});

test("restore original sandbox restrictions for third-party native ad iframe", () => {
  assert.match(slot, /sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"/);
  assert.doesNotMatch(slot, /allow-same-origin/);
  assert.match(slot, /event\.source === iframeRef\.current\.contentWindow/);
});

test("native ads remain enabled only for entitled Free and Standard members", () => {
  assert.match(discovery, /membership\?\.tier === "standard" \|\| membership\?\.tier === "free"/);
  assert.match(discovery, /membership\?\.showAds === true/);
  assert.match(home, /<AdSlot position="middle" enabled=\{adsEnabled\} \/>/);
});
