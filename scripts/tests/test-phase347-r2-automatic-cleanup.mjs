import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { processCleanupJobs, validateCleanupJob, PRIVATE_BUCKET, PUBLIC_BUCKET } from "../../server/r2-cleanup.js";
import cron from "../../api/jb-r2-cleanup-cron.js";
import stagingHandler from "../../api/jb-admin-staging-upload.js";

const read = p => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261122213000_jb_r2_cleanup_outbox_v1.sql");
const worker = read("server/r2-cleanup.js");
const admin = read("api/jb-admin-staging-upload.js");
const cronCode = read("api/jb-r2-cleanup-cron.js");
const settings = JSON.parse(read("vercel.json"));
const manager = read("src/pages/admin/AdminMediaTab.jsx");
const panel = read("src/components/admin/AdminR2CleanupQueue.jsx");

const adminId = "21939b62-927e-46a2-b2e0-abc65023d81b";
const stageId = "417458a1-9bb3-4ba8-8e01-5c0ae14be638";
const mediaId = "b93f441c-f88d-4bc6-93a9-b808f9296764";
const lease = "8afbfabf-1179-4535-89cc-185b83373993";
function makeJob(kind = "video") {
  return {
    job_id: "7b8f6b10-8282-4c32-9bad-ab0c03bbaa0e",
    lease_token: lease,
    entity_id: mediaId,
    entity_kind: "published",
    object_kind: kind,
    bucket_name: kind === "public_thumbnail" ? PUBLIC_BUCKET : PRIVATE_BUCKET,
    object_key: kind === "video"
      ? "staging/" + adminId + "/" + stageId + ".mp4"
      : kind === "private_thumbnail"
        ? "staging-thumbnails/" + adminId + "/" + stageId + ".jpg"
        : "thumbnails/published/" + stageId + ".jpg",
  };
}
function fakeServices({ job = makeJob(), protectedObject = false, deleteFails = false } = {}) {
  const events = { deletes: [], heads: [], acknowledgements: [] };
  const supabase = {
    async rpc(name, args) {
      if (name === "jb_r2_claim_cleanup_v1") {
        return { data: [job], error: null };
      }
      if (name === "jb_r2_finish_cleanup_v1") {
        events.acknowledgements.push(args);
        return { data: null, error: null };
      }
      throw new Error("Unexpected RPC");
    },
    from(table) {
      return {
        select(col) {
          return {
            eq(field,value) {
              return {
                async limit() {
                  return { data: protectedObject ? [{ [col]: mediaId }] : [], error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  const r2 = {
    async send(cmd) {
      if (cmd instanceof DeleteObjectCommand) {
        events.deletes.push(cmd.input);
        if (deleteFails) throw new Error("R2_TIMEOUT");
        return {};
      }
      if (cmd instanceof HeadObjectCommand) {
        events.heads.push(cmd.input);
        const err = new Error("NotFound");
        err.name = "NotFound";
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      throw new Error("Unexpected AWS operation");
    },
  };
  return { services: { supabase, r2, bucket: PRIVATE_BUCKET }, events };
}
function resp() {
  return {
    statusCode: 200, headers: {},
    setHeader(k,v) { this.headers[k] = v; return this; },
    status(n) { this.statusCode = n; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}
test("Transactional published deletion queues private video, private JPEG and EXACT matching public thumbnail", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.jb_r2_cleanup_jobs/);
  assert.match(sql, /v_public_key := 'thumbnails\/published\/' \|\| v_stage\.id/);
  assert.match(sql, /v_media\.thumbnail_url IS DISTINCT FROM/);
  assert.match(sql, /'https:\/\/assets\.jb-premium-hub\.vip\/' \|\| v_public_key/);
  assert.match(sql, /'published', v_id, 'video'/);
  assert.match(sql, /'published', v_id, 'private_thumbnail'/);
  assert.match(sql, /'published', v_id, 'public_thumbnail'/);
  assert.ok(sql.indexOf("INSERT INTO public.jb_r2_cleanup_jobs") <
    sql.indexOf("DELETE FROM public.jb_media_publication_links"));
});
test("Draft delete atomically enqueues verified private keys and validates expired upload lease", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.jb_admin_delete_unpublished_drafts_v1/);
  assert.match(sql, /v_stage\.created_at < pg_catalog\.now\(\) - INTERVAL '65 minutes'/);
  assert.match(sql, /'staging\/' \|\| p_admin_id::text \|\| '\/' \|\| v_id::text \|\| '\.mp4'/);
  assert.match(sql, /v_stage\.preview_key IS DISTINCT FROM v_thumbnail_key/);
  assert.match(sql, /'draft', v_id, 'video'/);
  assert.match(sql, /'draft', v_id, 'private_thumbnail'/);
  assert.match(sql, /DELETE FROM public\.jb_media_upload_staging WHERE id = v_id/);
  assert.match(admin, /rpc\(\s*"jb_admin_delete_unpublished_drafts_v1"/);
});
test("Non-admin clients cannot invoke destructive DB functions, jobs have RLS", () => {
  assert.match(sql, /ALTER TABLE public\.jb_r2_cleanup_jobs ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.jb_r2_cleanup_jobs FROM PUBLIC, anon, authenticated/);
  for (const name of ["jb_admin_delete_published_media_v1","jb_admin_delete_unpublished_drafts_v1","jb_r2_claim_cleanup_v1","jb_r2_finish_cleanup_v1"]) {
    assert.match(sql, new RegExp("REVOKE ALL ON FUNCTION public\\." + name + "[\\s\\S]*?FROM PUBLIC, anon, authenticated"));
  }
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.jb_r2_claim_cleanup_v1/);
});
test("Jobs only contain allowlisted buckets and exact key shapes", () => {
  assert.match(sql, /CONSTRAINT jb_r2_cleanup_jobs_exact_ownership CHECK/);
  assert.match(sql, /jb-collections-public-assets/);
  assert.match(sql, /jb-premium-private-videos/);
  for (const kind of ["video", "private_thumbnail", "public_thumbnail"]) {
    assert.equal(validateCleanupJob(makeJob(kind)), true, kind);
  }
  assert.equal(validateCleanupJob({ ...makeJob(), bucket_name: "random-public-bucket" }), false);
  assert.equal(validateCleanupJob({ ...makeJob(), object_key: "../../users.csv" }), false);
  assert.equal(validateCleanupJob({ ...makeJob(), object_key: "thumbnails/logo_JBCollections.png" }), false);
});
test("Claim uses SKIP LOCKED, bounded leases and retries with exponential backoff", () => {
  assert.match(sql, /FOR UPDATE SKIP LOCKED LIMIT p_limit/);
  assert.match(sql, /lease_token = gen_random_uuid\(\)/);
  assert.match(sql, /lease_expires_at = pg_catalog\.now\(\) \+ INTERVAL '5 minutes'/);
  assert.match(sql, /WHERE j\.id = p_job_id AND j\.lease_token = p_lease_token/);
  assert.match(sql, /j\.attempts >= 12 THEN 'blocked'/);
  assert.match(sql, /pg_catalog\.make_interval\(/);
  assert.match(sql, /v_entity_kind = 'published'/);
  assert.match(sql, /cleanup_status =/);
});
test("Branded MP4 cleanup checks the branding table by media_id", async () => {
  const job = {
    ...makeJob("video"),
    object_kind: "branded_video",
    object_key: "branding/processed/" + mediaId + "/v1.mp4",
  };
  const { services, events } = fakeServices({ job });
  const originalFrom = services.supabase.from.bind(services.supabase);
  services.supabase.from = (table) => ({
    select(column) {
      if (table === "jb_video_branding_jobs") {
        assert.equal(column, "media_id", "branding jobs have no id column");
      }
      return originalFrom(table).select(column);
    },
  });
  const result = await processCleanupJobs(services, { maxJobs: 1 });
  assert.equal(result.completed, 1);
  assert.equal(events.deletes.length, 1);
  assert.equal(events.deletes[0].Key, job.object_key);
  assert.equal(events.acknowledgements[0].p_success, true);
});
test("Branded MP4 with a live branding reference cannot be deleted", async () => {
  const job = {
    ...makeJob("video"),
    object_kind: "branded_video",
    object_key: "branding/processed/" + mediaId + "/v1.mp4",
  };
  const { services, events } = fakeServices({ job, protectedObject: true });
  const result = await processCleanupJobs(services, { maxJobs: 1 });
  assert.equal(result.pending, 1);
  assert.equal(events.deletes.length, 0);
  assert.equal(events.acknowledgements[0].p_error, "R2_OBJECT_HAS_LIVE_REFERENCE");
});
test("Successful deletion requires cloud DELETE plus HEAD 404 confirmation", async () => {
  const { services, events } = fakeServices();
  const result = await processCleanupJobs(services, { entityIds: [mediaId], maxJobs: 1 });
  assert.equal(result.claimed, 1);
  assert.equal(result.completed, 1);
  assert.equal(events.deletes.length, 1);
  assert.equal(events.heads.length, 1);
  assert.equal(events.deletes[0].Bucket, PRIVATE_BUCKET);
  assert.equal(events.acknowledgements[0].p_success, true);
});
test("A live DB reference prevents any Cloudflare DeleteObject call", async () => {
  const { services, events } = fakeServices({ protectedObject: true });
  const result = await processCleanupJobs(services, { maxJobs: 1 });
  assert.equal(result.pending, 1);
  assert.equal(events.deletes.length, 0);
  assert.equal(events.acknowledgements[0].p_success, false);
  assert.equal(events.acknowledgements[0].p_error, "R2_OBJECT_HAS_LIVE_REFERENCE");
});
test("Cloudflare failures always preserve the queued job for later retry", async () => {
  const { services, events } = fakeServices({ deleteFails: true });
  const result = await processCleanupJobs(services, { maxJobs: 1 });
  assert.equal(result.pending, 1);
  assert.equal(events.deletes.length, 1);
  assert.equal(events.acknowledgements[0].p_success, false);
  assert.equal(events.acknowledgements[0].p_error, "R2_TIMEOUT");
});
test("No orphan-scan output can feed automatic cleanup", () => {
  assert.doesNotMatch(worker, /orphan-audit|suspectedOrphans|scanR2Orphans/);
  assert.match(worker, /jb_r2_claim_cleanup_v1/);
  assert.match(worker, /jb_r2_finish_cleanup_v1/);
  assert.match(panel, /Only media explicitly deleted by an admin/);
  assert.match(manager, /<AdminR2OrphanAudit \/>/);
  assert.match(manager, /<AdminR2CleanupQueue \/>/);
});
test("Daily cron is authenticated with a secret, and never uses browser tokens", async () => {
  assert.deepEqual(settings.crons, [{path:"/api/jb-r2-cleanup-cron",schedule:"0 3 * * *"}]);
  assert.match(cronCode, /timingSafeEqual/);
  assert.match(cronCode, /secret\.length < 32/);
  assert.match(cronCode, /getCleanupServices/);
  assert.match(cronCode, /maxJobs: 20/);
  assert.doesNotMatch(cronCode, /req\.query/);
  const old = process.env.CRON_SECRET;
  try {
    process.env.CRON_SECRET = "abcdef0123456789".repeat(3);
    const missing = resp();
    await cron({ method:"GET", headers:{} },missing);
    assert.equal(missing.statusCode, 401);
    const wrongMethod = resp();
    await cron({ method:"POST", headers:{} },wrongMethod);
    assert.equal(wrongMethod.statusCode, 405);
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = old;
  }
});
test("Admin media endpoints preserve role + origin checks, cleanup-status is auth-only", async () => {
  assert.match(admin, /const admin = await getAdmin\(services, token\)/);
  assert.match(admin, /if \(!admin\) return fail\(res, 403/);
  assert.match(admin, /if \(!cors\(req, res\)\)/);
  assert.match(admin, /retry-pending-r2-cleanup/);
  assert.match(admin, /cleanup-status/);
  assert.doesNotMatch(admin.slice(admin.indexOf("async function deletePublishedMedia(")), /req\.body\.object_key/);
  const unauthorized = resp();
  await stagingHandler({method:"POST",headers:{origin:"https://www.jb-premium-hub.vip"},
    body:{action:"retry-pending-r2-cleanup"}},unauthorized);
  assert.equal(unauthorized.statusCode,401);
});
