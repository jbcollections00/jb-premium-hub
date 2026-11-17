import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../../supabase/migrations/20261117_phase333i_member_album_read_rls.sql", import.meta.url),
  "utf8"
);

test("remove public/anon album-directory reading", () => {
  assert.match(sql, /DROP POLICY IF EXISTS jb_albums_public_read_visible/);
  assert.match(sql, /REVOKE SELECT ON public\.jb_media_albums FROM anon/);
  assert.match(sql, /CREATE POLICY jb_albums_paid_read_visible/);
  assert.match(sql, /FOR SELECT TO authenticated/);
});

test("only active member entitlements, existing valid VIP or admin read member albums", () => {
  assert.match(sql, /entitlement\.tier IN \('standard', 'vip'\)/);
  assert.match(sql, /entitlement\.can_view_albums = true/);
  assert.match(sql, /entitlement\.access_expires_at > now\(\)/);
  assert.match(sql, /p\.vip_until > now\(\)/);
  assert.match(sql, /jb_albums_admin_read_all/);
});

test("album read policy change is non-destructive to media and billing", () => {
  assert.doesNotMatch(sql, /DELETE FROM|TRUNCATE|DROP TABLE|ALTER TABLE public\.media|INSERT INTO public\.media/);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
});
