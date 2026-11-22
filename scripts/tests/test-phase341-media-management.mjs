import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import apiHandler from "../../api/jb-admin-staging-upload.js";

const read = (name) => readFileSync(new URL("../../" + name, import.meta.url), "utf8");
const api = read("api/jb-admin-staging-upload.js");
const cleanupSql = read("supabase/migrations/20261122213000_jb_r2_cleanup_outbox_v1.sql");
const cleanupWorker = read("server/r2-cleanup.js");
const queue = read("src/components/admin/AdminPrivateAlbumUpload.jsx");
const review = read("src/components/admin/AdminPublishingReview.jsx");
const manager = read("src/pages/admin/AdminMediaTab.jsx");

test("Admin Media Manager reuses published-video thumbnail proxy", () => {
  assert.match(manager, /getThumbnailDisplayUrl\(item\.thumbnail_url, item\.id\)/);
  assert.doesNotMatch(manager, /getThumbnailDisplayUrl\(item\.thumbnail_url\)/);
});

test("Review list removes published linked staging records before signing JPEGs", () => {
  const source = api.slice(api.indexOf("async function reviewList("), api.indexOf("async function queueList("));
  assert.match(source, /from\("jb_media_publication_links"\)/);
  assert.match(source, /const publishedIds = new Set/);
  assert.match(source, /if \(publishedIds\.has\(row\.id\)\) continue/);
  assert.ok(source.indexOf("if (publishedIds.has(row.id)) continue") < source.indexOf("new GetObjectCommand"));
});

test("Private upload queue only shows unpublished uploads based on trusted links", () => {
  const source = api.slice(api.indexOf("async function queueList("), api.indexOf("async function deleteUnpublished("));
  assert.match(source, /from\("jb_media_publication_links"\)/);
  assert.match(source, /if \(published\.has\(row\.id\)\) continue/);
  assert.match(source, /\.eq\("created_by", admin\.id\)/);
  assert.match(queue, /stagingRequest\("queue-list"\)/);
  assert.doesNotMatch(queue, /\.from\("jb_media_upload_staging"\)/);
});

test("Review supports select all and selected bulk approve with rights attestation", () => {
  assert.match(review, /aria-label="Select all videos awaiting review"/);
  assert.match(review, /aria-label=\{"Select review video " \+ item\.filename\}/);
  assert.match(review, /Approve & Publish selected/);
  assert.match(review, /bulkRightsConfirmed/);
  assert.match(review, /bulkDuplicatesConfirmed/);
  assert.match(review, /I reviewed ALL selected videos/);
  assert.match(review, /I checked the duplicate filenames/);
});

test("Bulk publish uses the trusted per-video RPC path; no direct browser service role", () => {
  assert.match(review, /for \(const item of selected\)/);
  assert.match(review, /const response = await request\("publish"/);
  assert.match(review, /draftId: item\.id/);
  assert.match(review, /rightsConfirmed: true/);
  assert.doesNotMatch(review, /SUPABASE_SERVICE_ROLE_KEY|jb_publish_staged_media_v1/);
  assert.match(api, /services\.supabase\.rpc\("jb_publish_staged_media_v1"/);
});

test("Delete controls exist in both review and private upload queue", () => {
  for (const component of [review, queue]) {
    assert.match(component, /Delete selected/);
    assert.match(component, /Delete all unpublished/i);
    assert.match(component, /window\.confirm\(/);
    assert.match(component, /window\.prompt\(/);
    assert.match(component, /"DELETE ALL"/);
    assert.match(component, /"delete-unpublished"/);
  }
  assert.match(review, /Delete this draft/);
  assert.match(queue, /aria-label="Select all eligible unpublished drafts"/);
});

test("Delete backend requires admin scope and delegates atomic draft validation to locked RPC", () => {
  const source = api.slice(api.indexOf("async function deleteUnpublished("), api.indexOf("async function reviewVideo("));
  assert.match(source, /draftIds\.length > 50/);
  assert.match(source, /new Set\(draftIds\)\.size !== draftIds\.length/);
  assert.match(source, /"jb_admin_delete_unpublished_drafts_v1"/);
  assert.match(source, /p_admin_id: admin\.id/);
  assert.match(cleanupSql, /v_count NOT BETWEEN 1 AND 50/);
  assert.match(cleanupSql, /s\.created_by = p_admin_id FOR UPDATE/);
  assert.match(api, /const admin = await getAdmin\(services, token\)/);
});
test("Published videos are never removed by staging delete RPC", () => {
  const source = cleanupSql.slice(cleanupSql.indexOf("CREATE OR REPLACE FUNCTION public.jb_admin_delete_unpublished_drafts_v1"),
    cleanupSql.indexOf("CREATE OR REPLACE FUNCTION public.jb_r2_claim_cleanup_v1"));
  assert.match(source, /EXISTS \(SELECT 1 FROM public\.jb_media_publication_links/);
  assert.match(source, /RAISE EXCEPTION 'Published draft cannot be deleted here'/);
  assert.match(source, /DELETE FROM public\.jb_media_upload_staging WHERE id = v_id/);
  assert.doesNotMatch(source, /DELETE FROM public\.media/);
});
test("Active uploads stay protected until presigned PUT expires", () => {
  assert.match(cleanupSql, /v_stage\.status = 'pending_review'/);
  assert.match(cleanupSql, /v_stage\.status = 'awaiting_upload'/);
  assert.match(cleanupSql, /INTERVAL '65 minutes'/);
  assert.match(queue, /Active upload protected/);
});
test("Draft object deletion is transactionally queued with verified deterministic private keys", () => {
  const source = cleanupSql.slice(cleanupSql.indexOf("CREATE OR REPLACE FUNCTION public.jb_admin_delete_unpublished_drafts_v1"),
    cleanupSql.indexOf("CREATE OR REPLACE FUNCTION public.jb_r2_claim_cleanup_v1"));
  assert.match(source, /v_video_key := 'staging\/' \|\| p_admin_id/);
  assert.match(source, /v_thumbnail_key := 'staging-thumbnails\/' \|\| p_admin_id/);
  assert.match(source, /v_stage\.preview_key IS DISTINCT FROM v_thumbnail_key/);
  assert.match(source, /INSERT INTO public\.jb_r2_cleanup_jobs/);
  assert.match(source, /DELETE FROM public\.jb_media_upload_staging WHERE id = v_id/);
  assert.ok(source.indexOf("INSERT INTO public.jb_r2_cleanup_jobs") < source.indexOf("DELETE FROM public.jb_media_upload_staging"));
  assert.match(cleanupWorker, /new DeleteObjectCommand/);
  assert.match(cleanupWorker, /new HeadObjectCommand/);
});
test("Admin actions and saved video snapshots remain unchanged outside staging", () => {
  assert.match(manager, /<AdminPrivateAlbumUpload \/>/);
  assert.match(manager, /<AdminPublishingReview \/>/);
  assert.match(review, /request\("review-video"/);
  assert.match(queue, /stagingRequest\("thumbnail-complete"/);
});

const makeResponse = () => ({
  statusCode: 200, headers: {},
  setHeader(k, v) { this.headers[k] = v; return this; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  end() { return this; },
});

test("Unauthenticated users cannot delete or bulk publish video drafts", async () => {
  for (const action of ["delete-unpublished", "publish"]) {
    const res = makeResponse();
    await apiHandler({
      method: "POST",
      headers: { origin: "https://www.jb-premium-hub.vip" },
      body: { action, draftIds: ["4e9c9061-04d7-42ed-ba99-cd25be749276"], rightsConfirmed: true },
    }, res);
    assert.equal(res.statusCode, 401);
  }
  const attacker = makeResponse();
  await apiHandler({
    method: "POST", headers: { origin: "https://attacker.example" },
    body: { action: "delete-unpublished", draftIds: [] },
  }, attacker);
  assert.equal(attacker.statusCode, 403);
});
