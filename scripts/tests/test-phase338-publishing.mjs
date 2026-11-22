import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL("../../" + name, import.meta.url), "utf8");
const server = read("api/jb-admin-staging-upload.js");
const review = read("src/components/admin/AdminPublishingReview.jsx");
const mediaManager = read("src/pages/admin/AdminMediaTab.jsx");
const privateUploader = read("src/components/admin/AdminPrivateAlbumUpload.jsx");
const legacySigner = read("api/r2-upload-url.js");

test("Review/Publish UI is reachable from the existing private uploader tab", () => {
  assert.match(mediaManager, /import AdminPublishingReview from/);
  assert.match(mediaManager, /<AdminPrivateAlbumUpload \/>[\s\S]*<AdminPublishingReview \/>/);
});

test("All admin review actions reuse the authenticated staging API", () => {
  for (const action of ["review-list", "review-video", "publish"]) {
    assert.ok(server.includes('req.body?.action === "' + action + '"'));
    assert.ok(review.includes('request("' + action + '"'));
  }
  assert.match(review, /Authorization: "Bearer " \+ data\.session\.access_token/);
});

test("Publishing cannot happen through a direct browser service-role RPC", () => {
  assert.doesNotMatch(review, /\.rpc\(\s*["']jb_publish_staged_media_v1/);
  assert.match(server, /services\.supabase\.rpc\("jb_publish_staged_media_v1"/);
  assert.match(server, /p_publisher_id: admin\.id/);
  assert.doesNotMatch(review, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("Server validates admin from Supabase Auth and profiles before action dispatch", () => {
  const guard = server.indexOf("const admin = await getAdmin(services, token)");
  const firstDispatch = server.indexOf('req.body?.action === "review-list"');
  assert.ok(guard >= 0 && firstDispatch > guard);
  assert.match(server, /services\.supabase\.auth\.getUser\(token\)/);
  assert.match(server, /String\(profile\.role \|\| ""\)\.toLowerCase\(\) === "admin"/);
});

test("Review queue and playback preview are scoped to uploader identity", () => {
  assert.match(server, /async function reviewList\(/);
  assert.match(server, /async function reviewVideo\(/);
  assert.match(server, /\.eq\("created_by", admin\.id\)/);
  assert.match(server, /\.eq\("status", "pending_review"\)/);
  assert.match(server, /"staging\/" \+ admin\.id \+ "\/" \+ draftId \+ "\.mp4"/);
  assert.match(server, /expiresIn: 300/);
  assert.match(review, /<video controls playsInline preload="metadata"/);
});

test("Server refuses publishing without explicit rights confirmation", () => {
  assert.match(server, /rightsConfirmed !== true/);
  assert.match(server, /Confirm that you have permission to publish this video/);
  assert.match(review, /I reviewed this upload and confirm I have the necessary rights/);
  assert.match(review, /window\.confirm\(/);
});

test("Server requires acknowledgement of duplicate filenames", () => {
  assert.match(server, /duplicateAcknowledged !== true/);
  assert.match(server, /Another draft has the same filename/);
  assert.match(server, /original_filename", row\.original_filename/);
  assert.match(review, /Duplicate filename detected in your upload history/);
  assert.match(review, /I checked the duplicate filenames/);
});

test("Publishing is gated by status, ownership and a fresh R2 HEAD", () => {
  const body = server.slice(server.indexOf("async function publishReviewed("), server.indexOf("export default async function handler("));
  assert.match(body, /row\.status !== "pending_review"/);
  assert.match(body, /row\.storage_key !== "staging\/" \+ admin\.id/);
  assert.match(body, /row\.mime_type !== "video\/mp4"/);
  assert.match(body, /new HeadObjectCommand\(/);
  assert.match(body, /Number\(head\.ContentLength\) !== Number\(row\.size_bytes\)/);
  assert.match(body, /head\.ContentType !== "video\/mp4"/);
  assert.ok(body.indexOf("new HeadObjectCommand") < body.indexOf('rpc("jb_publish_staged_media_v1"'));
});

test("Repeated publishing does not create another media record", () => {
  assert.match(server, /\.from\("jb_media_publication_links"\)/);
  assert.match(server, /alreadyPublished: true/);
  assert.match(server, /alreadyPublished: result\.was_created === false/);
  assert.doesNotMatch(server, /\.from\(["']media["']\)\.insert/);
});

test("Thumbnail publication only targets explicit trusted public asset bucket", () => {
  assert.match(server, /JB_PUBLIC_THUMBNAIL_R2_BUCKET_NAME/);
  assert.match(server, /JB_PUBLIC_THUMBNAIL_ORIGIN !== "https:\/\/assets\.jb-premium-hub\.vip"/);
  assert.match(server, /publicBucket === services\.bucket/);
  assert.match(server, /"thumbnails\/published\/" \+ row\.id \+ "\.jpg"/);
  assert.match(server, /Bucket: publicBucket/);
  assert.match(server, /LOGO_COVER, saved: false/);
  assert.match(server, /new GetObjectCommand/);
  assert.match(server, /new PutObjectCommand/);
});

test("Publishing never turns a staged upload into FREE access", () => {
  assert.doesNotMatch(server, /is_free_preview.*true/);
  assert.match(privateUploader, /Private staging only/);
  assert.match(legacySigner, /Public video uploads are disabled/);
});

test("Incomplete uploads and browser-only attempts do not auto-publish", () => {
  assert.doesNotMatch(privateUploader, /jb_publish_staged_media_v1/);
  assert.doesNotMatch(privateUploader, /request\(["']publish["']/);
  assert.doesNotMatch(review, /useEffect\([\s\S]{0,600}request\(["']publish["']/);
});

test("Untrusted or anonymous API calls are rejected without contacting R2", async () => {
  const { default: handler } = await import("../../api/jb-admin-staging-upload.js");
  const response = () => ({
    statusCode: 200, headers: {},
    setHeader(k,v) { this.headers[k]=v; return this; },
    status(v) { this.statusCode=v; return this; },
    json(v) { this.body=v; return this; },
    end() { return this; },
  });
  const denied = response();
  await handler({ method: "POST", headers: { origin: "https://bad.example" }, body: { action: "publish", rightsConfirmed: true } }, denied);
  assert.equal(denied.statusCode, 403);

  const unauthorized = response();
  await handler({ method: "POST", headers: { origin: "https://www.jb-premium-hub.vip" }, body: { action: "publish", rightsConfirmed: true } }, unauthorized);
  assert.equal(unauthorized.statusCode, 401);
});
