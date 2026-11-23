// Phase 363: synthetic/static verification only; never reads real media or secrets.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const signer = read("api/jb-branded-download.js");
const sql = read("supabase/migrations/20261124070000_jb_download_safety_clearance_v1.sql");

test("Global safety hold remains first and cannot be overridden by per-video clearance", () => {
  const globalGate = signer.indexOf('process.env.JB_BRANDED_DOWNLOADS_ENABLED !== "true"');
  const clearance = signer.indexOf('serviceDb.from("jb_download_safety_clearances")');
  const signerUrl = signer.indexOf("await getSignedUrl(");
  assert.ok(globalGate >= 0 && clearance > globalGate && signerUrl > clearance);
});
test("Independent approval is separate from published rights and READY branding", () => {
  assert.match(signer, /clearance\?\.review_status === "approved"/);
  assert.match(signer, /clearance\.source_key === job\.source_key/);
  assert.match(signer, /clearance\.reviewed_by !== publication\.published_by/);
  assert.match(signer, /reviewedAt > publishedAt/);
  assert.match(signer, /validUntil > Date\.now\(\)/);
  assert.match(signer, /if \(!safetyApproved\)/);
  assert.match(signer, /403, "This video has not been independently cleared for download"/);
  assert.match(signer, /503, "Content safety verification unavailable"/);
});
test("No existing video is automatically cleared by the schema migration", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.jb_download_safety_clearances/);
  assert.match(sql, /REFERENCES public\.media\(id\) ON DELETE CASCADE/);
  assert.match(sql, /review_status IN \('approved','blocked'\)/);
  assert.doesNotMatch(sql, /INSERT INTO public\.jb_download_safety_clearances/i);
});
test("Anonymous and standard authenticated clients have no read or write rights", () => {
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.jb_download_safety_clearances[\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE[\s\S]*?TO service_role/);
  assert.doesNotMatch(sql, /CREATE POLICY/i);
  assert.doesNotMatch(sql, /GRANT EXECUTE/i);
});
test("Branded signer still checks VIP membership, ready job and verified R2 bytes", () => {
  assert.match(signer, /can_download === true/);
  assert.match(signer, /job\.status !== "ready"/);
  assert.match(signer, /new HeadObjectCommand\(/);
  assert.match(signer, /ResponseContentDisposition:/);
  assert.match(signer, /expiresIn:\s*90/);
});
