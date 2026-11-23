import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const home = readFileSync('src/pages/public/Home.jsx', 'utf8');
const discovery = readFileSync('src/services/homeDiscovery.js','utf8');
const billing = readFileSync('src/services/billingAccess.js','utf8');

test('a missing profile uses a verified Auth identity, never client-generated privileges', () => {
  assert.match(home, /if \(!profile\) \{\s*const \{ data: verified, error: verifyError \} = await supabase\.auth\.getUser\(\)/);
  assert.match(home, /verified\?\.user\?\.id !== user\.id/);
  assert.match(home, /verified\.user\.is_anonymous === true/);
  assert.doesNotMatch(home, /\.from\(["']profiles["']\)\s*\.upsert\(/);
  assert.match(home, /role: profile\?\.role \|\| "user"/);
  assert.match(home, /account_type: profile\?\.account_type \|\| "free"/);
});

test('free member cannot view albums, download, or most-watched paid media', () => {
  assert.match(discovery,/membership\?\.tier === "free"/);
  assert.match(discovery,/membership\?\.canViewAlbums === false/);
  assert.match(home,/setMostWatched\(\[\]\); \/\/ FREE accounts have no Most Watched section/);
  assert.match(billing,/return \{ tier: 'free', canViewAlbums: false, canDownload: false, showAds: true/);
  assert.match(home,/supabase\.rpc\("jb_free_preview_catalog_v1"\)/);
});

test('paid access continues to be sourced from the server', () => {
  assert.match(home,/const result = await getBillingAccess\(\)/);
  assert.match(billing,/supabase\.rpc\('jb_billing_my_access'\)/);
});
