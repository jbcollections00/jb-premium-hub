import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  approvedFreeCatalog, freeMostWatched, getHomeMode, shouldDisplayAds,
} from "../../src/services/homeDiscovery.js";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const home = read("src/pages/public/Home.jsx");
const billing = read("src/services/billingAccess.js");
const billingPolicy = billing.slice(billing.indexOf("export function normalizeBillingAccess"));

const membership = (tier) => ({
  tier,
  canViewAlbums: tier !== "free",
  canDownload: tier === "admin" || tier === "vip",
  showAds: tier === "standard" || tier === "free",
});

test("FREE Home shows only FREE, while Standard/VIP/Admin see album names", () => {
  assert.equal(getHomeMode(true, "u1", membership("free"), true), "free");
  for (const tier of ["standard", "vip", "admin"]) {
    assert.equal(getHomeMode(true, "u1", membership(tier), true), "albums", tier);
  }
  assert.equal(getHomeMode(false, "u1", membership("free"), true), "locked");
  assert.equal(getHomeMode(true, null, membership("free"), true), "locked");
  assert.equal(getHomeMode(true, "u1", membership("free"), false), "locked");
  assert.equal(getHomeMode(true, "u1", { ...membership("vip"), canViewAlbums: false }, true), "locked");
});

test("Ads are enabled on FREE and STANDARD only, after authenticated access resolves", () => {
  for (const tier of ["free", "standard"]) {
    assert.equal(shouldDisplayAds(true, "user", membership(tier)), true, tier);
  }
  for (const tier of ["vip", "admin"]) {
    assert.equal(shouldDisplayAds(true, "user", membership(tier)), false, tier);
  }
  assert.equal(shouldDisplayAds(false, "user", membership("free")), false);
  assert.equal(shouldDisplayAds(true, null, membership("free")), false);
  assert.equal(shouldDisplayAds(true, "user", { ...membership("free"), showAds: false }), false);
  assert.match(billingPolicy, /tier: 'free', canViewAlbums: false, canDownload: false, showAds: true/);
  assert.match(home, /<AdSlot position="middle" enabled=\{adsEnabled\}/);
  assert.match(home, /isAdFree=\{billingReady \? !adsEnabled : false\}/);
  assert.match(home, /triggerPopunderForAdSupported/);
  assert.match(home, /POPUNDER_EVERY_N_VIDEOS = 3/);
});

test("FREE catalog never includes more than 20 approved video metadata rows", () => {
  const data = Array.from({ length: 24 }, (_, i) => ({
    id: "free" + i, title: "Video " + i, type: "video",
    is_free_preview: true, views_count: i, thumbnail_url: "/logo.png",
  }));
  assert.equal(approvedFreeCatalog(data).length, 20);
  const invalid = [
    { id: "x", title: "Bad", type: "video", is_free_preview: true, media_url: "r2://private" },
    { id: "y", title: "Bad", type: "video", is_free_preview: true, storage_key: "secret" },
    { id: "z", title: "Bad", type: "image", is_free_preview: true },
    { id: "paid", title: "Bad", type: "video", is_free_preview: false },
  ];
  assert.deepEqual(approvedFreeCatalog(invalid), []);
  assert.throws(() => approvedFreeCatalog(null), /catalog/);
});

test("FREE Most Watched ranks only the authorized FREE catalog, no paid IDs", () => {
  const free = [
    { id: "first", views_count: 5 },
    { id: "second", views_count: 200 },
    { id: "third", views_count: 30 },
  ];
  assert.deepEqual(freeMostWatched(free).map(x => x.id), ["second", "third", "first"]);
  assert.deepEqual(freeMostWatched(free, 2).map(x => x.id), ["second", "third"]);
  assert.deepEqual(free.map(x => x.id), ["first", "second", "third"]);
});

test("FREE fetchMedia uses only the authenticated selected-video RPC and hides Most Watched", () => {
  const method = home.slice(home.indexOf("const fetchMedia = async"),
    home.indexOf("const handleOpenViewers", home.indexOf("const fetchMedia = async")));
  const freeBranch = method.slice(method.indexOf('if (homeMode === "free") {', 50),
    method.indexOf('if (homeMode !== "albums" || !selectedAlbumId)'));
  assert.match(freeBranch, /jb_free_preview_catalog_v1/);
  assert.match(freeBranch, /approvedFreeCatalog\(data\)/);
  assert.match(freeBranch, /setMostWatched\(\[\]\)/);
  assert.doesNotMatch(freeBranch, /freeMostWatched\(approved\)/);
  assert.doesNotMatch(freeBranch, /\.from\("media"\)|\.from\("jb_media_albums"\)/);
  assert.match(home, /requestFreePreviewUrl/);
  assert.match(home, /isSelectedFreePreview/);
});

test("Paid/Admin album list and album filtering use existing RLS, no bypass or hardcoded names", () => {
  assert.match(home, /\.from\("jb_media_albums"\)/);
  assert.match(home, /homeMode !== "albums"/);
  assert.match(home, /aria-label="Member Albums"/);
  assert.match(home, /\{album\.name\}/);
  // Member albums are text-only tabs; cover-style cards were intentionally removed.
  assert.doesNotMatch(home, /ALBUM_COVER_COLORS\[album\.cover_style\]/);
  assert.match(home, /handleSelectAlbum\(album\.id\)/);
  const fetchMedia = home.slice(home.indexOf("const fetchMedia = async"),
    home.indexOf("const handleOpenViewers", home.indexOf("const fetchMedia = async")));
  assert.match(fetchMedia, /\.from\("jb_media_publication_links"\)/);
  assert.match(fetchMedia, /\.eq\("album_id", selectedAlbumId\)/);
  assert.match(fetchMedia, /\.from\("media"\)/);
  assert.match(fetchMedia, /\.in\("id", ids\)/);
  assert.doesNotMatch(home, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("FREE never sees member albums or All Videos navigation on Home", () => {
  assert.match(home, /homeMode === "free" && \(/);
  assert.match(home, /homeMode === "albums" && \(/);
  assert.match(home, /homeMode === "locked" \? \(/);
  assert.doesNotMatch(home, /handleCategoryChange/);
  assert.ok(!home.includes("All Videos</button>"));
  assert.match(home, /Most Watched — Free/);
  assert.match(home, /homeMode === "free" \? "Free to Watch" : "Member library"/);
});

test("Billing privileges and ticket issuers remain unchanged; FREE download remains OFF", () => {
  assert.match(billing, /tier: 'free', canViewAlbums: false, canDownload: false, showAds: true/);
  assert.match(billing, /tier: 'vip', canViewAlbums: true, canDownload: true, showAds: false/);
  assert.match(billing, /tier: 'admin', canViewAlbums: true, canDownload: true, showAds: false/);
  assert.match(home, /requestPrivateMediaUrl\(id, "play"\)/);
  assert.match(home, /requestFreePreviewUrl\(id\)/);
  assert.match(home, /\{canDownload && \(/);
  assert.match(home, /PRIVATE_MEDIA_UI_ENABLED/);
});

test("Home membership switch invalidates stale paid recommendation requests", () => {
  assert.match(home, /const mostWatchedFetchSerialRef = useRef\(0\)/);
  assert.match(home, /if \(homeMode !== "albums"\) \+\+mostWatchedFetchSerialRef\.current/);
  assert.match(home, /requestId === mostWatchedFetchSerialRef\.current/);
  assert.match(home, /requestId !== mediaFetchSerialRef\.current/);
});
