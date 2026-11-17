import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveHomeAudience, getHomeCategory } from "../../src/services/homeAudience.js";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const home = read("../../src/pages/public/Home.jsx");
const albums = read("../../src/components/home/HomeAlbumCollections.jsx");
const billing = read("../../src/services/billingAccess.js");

test("Home uses fail-closed member tiers rather than an account label alone", () => {
  const profile = { id: "user-id" };
  assert.equal(resolveHomeAudience(profile, false, { tier: "vip", canViewAlbums: true }), "pending");
  assert.equal(resolveHomeAudience(null, true, { tier: "vip", canViewAlbums: true }), "pending");
  assert.equal(resolveHomeAudience(profile, true, { tier: "free", canViewAlbums: false }), "free");
  assert.equal(resolveHomeAudience(profile, true, { tier: "standard", canViewAlbums: true }), "member");
  assert.equal(resolveHomeAudience(profile, true, { tier: "vip", canViewAlbums: true }), "member");
  assert.equal(resolveHomeAudience(profile, true, { tier: "admin", canViewAlbums: true }), "member");
  assert.equal(resolveHomeAudience(profile, true, { tier: "free", canViewAlbums: true }), "free");
  assert.equal(resolveHomeAudience(profile, true, { tier: "vip", canViewAlbums: false }), "free");
  assert.match(billing, /getBillingAccess/);
});

test("FREE and unresolved users cannot navigate to album or All Videos categories", () => {
  assert.equal(getHomeCategory("album:some-uuid", "free"), "free");
  assert.equal(getHomeCategory("all", "free"), "free");
  assert.equal(getHomeCategory("album:some-uuid", "pending"), "free");
  assert.equal(getHomeCategory("album:some-uuid", "member"), "album:some-uuid");
  assert.equal(getHomeCategory("all", "member"), "all");
  assert.equal(getHomeCategory("pinay_asian", "member"), "all");
  assert.match(home, /url\.searchParams\.set\("cat", "free"\)/);
  assert.match(home, /const nextCategory = getHomeCategory\(catKey, homeAudience\)/);
});

test("FREE Home shows only Free to Watch; only members render albums and trending", () => {
  assert.match(home, /\{showFreeHome && \(\s*<section/);
  assert.match(home, /\{showFreeHome \? "Free to Watch" : "Media library"\}/);
  assert.match(home, /\{canBrowseMemberAlbums && \(\s*<div className="jbh-surface/);
  assert.match(home, /\{canBrowseMemberAlbums && \(\s*<>/);
  assert.match(home, /<HomeAlbumCollections\s+activeCategory=\{activeCategory\}/);
  assert.match(home, /\{showFreeHome && \(\s*<span aria-current/);
  assert.match(albums, /\.eq\("is_visible", true\)/);
});

test("FREE Home cannot fall through to full member media or bypass current hold", () => {
  const fetchCode = home.slice(home.indexOf("const fetchMedia"),home.indexOf("const handlePageChange"));
  assert.match(fetchCode, /homeAudience === "pending" \|\| \(homeAudience === "free" && !FREE_PREVIEW_UI_ENABLED\)/);
  assert.match(fetchCode, /category = getHomeCategory\(category, homeAudience\)/);
  assert.match(fetchCode, /if \(LEGACY_CATALOG_HOME_HOLD\)/);
  assert.match(fetchCode, /supabase\.rpc\("jb_free_preview_catalog_v1"\)/);
  assert.match(fetchCode, /supabase\.from\("media"\)/);
  assert.match(home, /const selectedCanPlay = !LEGACY_CATALOG_HOME_HOLD/);
});
