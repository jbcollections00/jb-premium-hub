import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../../supabase/migrations/20261117_phase333j_private_album_upload_staging.sql");
const server = read("../../api/jb-admin-staging-upload.js");
const previousSigner = read("../../api/r2-upload-url.js");
const mediaAdmin = read("../../src/pages/admin/AdminMediaTab.jsx");
const privateUploader = read("../../src/components/admin/AdminPrivateAlbumUpload.jsx");

test("staging table has album reference and only admin SELECT or service writes", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.jb_media_upload_staging/);
  assert.match(sql, /album_id uuid NOT NULL REFERENCES public\.jb_media_albums\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /ALTER TABLE public\.jb_media_upload_staging ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.jb_media_upload_staging\s+FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /FOR SELECT TO authenticated\s+USING \(\(SELECT public\.is_current_user_admin\(\)\)\)/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON public\.jb_media_upload_staging TO service_role/);
  assert.match(sql, /status IN \('awaiting_upload', 'pending_review'\)/);
  assert.doesNotMatch(sql, /INSERT INTO public\.media|DELETE FROM public\.media|TRUNCATE|DROP TABLE/i);
});

test("server signs to a strictly separate private bucket and never produces public video URLs", () => {
  assert.match(server, /const PRIVATE_BUCKET = "jb-premium-private-videos"/);
  assert.match(server, /JB_STAGING_R2_BUCKET_NAME !== PRIVATE_BUCKET/);
  assert.match(server, /JB_STAGING_R2_BUCKET_NAME === process\.env\.R2_BUCKET_NAME/);
  assert.match(server, /services\.supabase\.auth\.getUser\(token\)/);
  assert.match(server, /isAdmin \? userResult\.user : null/);
  assert.match(server, /new PutObjectCommand/);
  assert.match(server, /new HeadObjectCommand/);
  assert.match(server, /metadata\.ContentLength/);
  assert.match(server, /"pending_review"/);
  assert.doesNotMatch(server, /publicUrl\s*:|R2_PUBLIC_URL|\.from\(["']media["']\)|upload\.status\s*=\s*["']published["']/);
});

test("public signer blocks video uploads instead of issuing old public URL", () => {
  assert.match(previousSigner, /Public video uploads are disabled\. Use Private Album Upload/);
  assert.match(previousSigner, /safeFolder === "videos"/);
  assert.match(previousSigner, /contentType \|\| ""/);
  assert.match(previousSigner, /\.status\(410\)/);
});

test("admin UI replaces legacy public video upload form and requires a chosen album", () => {
  assert.match(mediaAdmin, /<AdminPrivateAlbumUpload \/>/);
  assert.match(mediaAdmin, /const LEGACY_PUBLIC_VIDEO_UPLOAD_DISABLED = true/);
  assert.match(mediaAdmin, /!LEGACY_PUBLIC_VIDEO_UPLOAD_DISABLED && activeTab/);
  assert.match(privateUploader, /\.from\("jb_media_albums"\)/);
  assert.match(privateUploader, /id="jb-staging-album"/);
  assert.match(privateUploader, /disabled=\{busy \|\| loading \|\| !albumId \|\| !files\.length/);
  assert.match(privateUploader, /stagingRequest\("begin"/);
  assert.match(privateUploader, /stagingRequest\("complete"/);
  assert.match(privateUploader, /finished\.status !== "pending_review"/);
  assert.match(privateUploader, /\.from\("jb_media_upload_staging"\)/);
  assert.doesNotMatch(privateUploader, /createR2UploadUrl|\.from\(["']media["']\)|publicUrl/);
});

test("staging API denies unauthenticated and unwanted origins before any upload", async () => {
  const { default: handler } = await import("../../api/jb-admin-staging-upload.js");
  const response = () => ({
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
  });
  const unauthorized = response();
  await handler({ method: "POST", headers: { origin: "http://localhost:5173" } }, unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  const invalidOrigin = response();
  await handler({ method: "POST", headers: { origin: "https://unauthorized.example" } }, invalidOrigin);
  assert.equal(invalidOrigin.statusCode, 403);
  const badMethod = response();
  await handler({ method: "GET", headers: { origin: "http://localhost:5173" } }, badMethod);
  assert.equal(badMethod.statusCode, 405);

  const branchHost = "jb-premium-hub-git-phase-69f786-jbcollections00-7010s-projects.vercel.app";
  const branchOrigin = "https://" + branchHost;
  const sameOrigin = response();
  await handler({
    method: "POST",
    headers: { host: branchHost, origin: branchOrigin },
  }, sameOrigin);
  assert.equal(sameOrigin.statusCode, 401);
  assert.equal(sameOrigin.headers["Access-Control-Allow-Origin"], branchOrigin);

  const wrongOrigin = response();
  await handler({
    method: "POST",
    headers: { host: branchHost, origin: "https://attacker.example" },
  }, wrongOrigin);
  assert.equal(wrongOrigin.statusCode, 403);
  assert.deepEqual(wrongOrigin.body, { error: "Origin not permitted." });

  const spoofedHost = response();
  await handler({
    method: "POST",
    headers: { host: "attacker.example", origin: "https://attacker.example" },
  }, spoofedHost);
  assert.equal(spoofedHost.statusCode, 403);

  const crossOriginPreview = response();
  await handler({
    method: "POST",
    headers: { host: branchHost, origin: "https://another-preview.example" },
  }, crossOriginPreview);
  assert.equal(crossOriginPreview.statusCode, 403);
});
