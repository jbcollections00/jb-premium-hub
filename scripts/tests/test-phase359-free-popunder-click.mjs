import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync("src/pages/public/Home.jsx","utf8");
const discovery = readFileSync("src/services/homeDiscovery.js","utf8");

test("FREE requests an ad on each genuine approved video-card click, never autoplay",()=>{
  assert.match(home,/if \(homeMode === "free" && e\?\.nativeEvent\?\.isTrusted === true\)/);
  assert.match(home,/triggerPopunderForAdSupported\("video-click"\)/);
  assert.match(home,/const isFree = membership\.tier === "free"/);
  assert.match(home,/if \(isFree \? source !== "video-click" : source !== "first-play"\) return/);
  assert.match(home,/homeMode === "free" && \(!item\.is_free_preview/);
});
test("STANDARD keeps three-first-play cadence and VIP/Admin remain ad-free",()=>{
  assert.match(home,/POPUNDER_EVERY_N_VIDEOS = 3/);
  assert.match(home,/triggerPopunderForAdSupported\("first-play"\)/);
  assert.match(home,/if \(!isFree\) \{/);
  assert.match(discovery,/membership\?\.showAds === true/);
  assert.match(discovery,/membership\?\.tier === "standard" \|\| membership\?\.tier === "free"/);
  assert.match(home,/if \(!adsEnabled \|\| !userProfile\?\.id/);
});
test("popunder leaves browser provider popup restrictions intact",()=>{
  assert.doesNotMatch(home,/window\.open\(/);
  assert.match(home,/document\.body\.appendChild\(script\)/);
  assert.match(home,/The browser\/provider may still block or decline the ad/);
});
