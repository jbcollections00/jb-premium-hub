// Phase 347 — server-only, allowlisted, DB-backed Cloudflare R2 cleanup.
// Both direct admin deletes and cron use the exact same idempotent worker.
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

export const PRIVATE_BUCKET = "jb-premium-private-videos";
export const PUBLIC_BUCKET = "jb-collections-public-assets";
const PUBLIC_ORIGIN = "https://assets.jb-premium-hub.vip";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const VIDEO_KEY = new RegExp("^staging/" + UUID + "/" + UUID + "\\.mp4$");
const BRANDED_KEY = new RegExp("^branding/processed/" + UUID + "/v[0-9]+[.]mp4$");
const PREVIEW_KEY = new RegExp("^staging-thumbnails/" + UUID + "/" + UUID + "\\.jpg$");
const PUBLISHED_KEY = new RegExp("^thumbnails/published/(" + UUID + ")\\.jpg$");
const ERROR_LIMIT = 160;

export function getCleanupServices() {
  const env = process.env;
  if (
    !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY ||
    env.JB_STAGING_R2_BUCKET_NAME !== PRIVATE_BUCKET ||
    env.JB_STAGING_R2_BUCKET_NAME === env.R2_BUCKET_NAME
  ) return null;

  return {
    supabase: createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    r2: new S3Client({
      region: "auto",
      endpoint: "https://" + env.R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    }),
    bucket: PRIVATE_BUCKET,
  };
}

export function validateCleanupJob(job) {
  if (!job || typeof job !== "object" ||
      typeof job.job_id !== "string" ||
      typeof job.lease_token !== "string" ||
      typeof job.entity_id !== "string") return false;
  if (job.bucket_name === PRIVATE_BUCKET) {
    return (job.object_kind === "video" && VIDEO_KEY.test(job.object_key)) ||
           (job.object_kind === "branded_video" && BRANDED_KEY.test(job.object_key)) ||
           (job.object_kind === "private_thumbnail" && PREVIEW_KEY.test(job.object_key));
  }
  if (job.bucket_name === PUBLIC_BUCKET && job.object_kind === "public_thumbnail") {
    return PUBLISHED_KEY.test(job.object_key);
  }
  return false;
}

// DB reads must succeed before ANY R2 DELETE. Protect linked/live objects even
// if the original outbox record is stale or media was restored after deletion.
async function isReferenced(supabase, job) {
  const queries = [];
  if (job.object_kind === "branded_video") {
    queries.push(["jb_video_branding_jobs", "output_key", job.object_key]);
  } else if (job.object_kind === "video") {
    queries.push(["jb_media_upload_staging", "storage_key", job.object_key]);
    queries.push(["media", "media_url", "r2://" + PRIVATE_BUCKET + "/" + job.object_key]);
  } else if (job.object_kind === "private_thumbnail") {
    queries.push(["jb_media_upload_staging", "preview_key", job.object_key]);
  } else if (job.object_kind === "public_thumbnail") {
    const stagingId = job.object_key.match(PUBLISHED_KEY)?.[1];
    if (!stagingId) throw new Error("Unsafe public thumbnail key");
    queries.push(["media", "thumbnail_url", PUBLIC_ORIGIN + "/" + job.object_key]);
    queries.push(["jb_media_publication_links", "staging_id", stagingId]);
  } else {
    throw new Error("Unknown object kind");
  }
  for (const [table, column, value] of queries) {
    const resultColumn = table === "jb_media_publication_links" ? "staging_id"
      : table === "jb_video_branding_jobs" ? "media_id" : "id";
    const { data, error } = await supabase.from(table)
      .select(resultColumn).eq(column, value).limit(1);
    if (error || !Array.isArray(data)) {
      // Fail closed: never remove a file on a failed live-reference lookup.
      throw new Error("R2_REFERENCE_CHECK_UNAVAILABLE");
    }
    if (data.length) return true;
  }
  return false;
}

function notFound(error) {
  const code = String(error?.name || error?.Code || "");
  return error?.$metadata?.httpStatusCode === 404 ||
    ["NotFound", "NoSuchKey", "NoSuchObject"].includes(code);
}

async function deleteAndVerifyObject(r2, bucket, key) {
  await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    throw new Error("R2 object still present after deletion");
  } catch (error) {
    if (!notFound(error)) throw error;
  }
}

async function finishJob(supabase, job, success, errorCode = null) {
  const { error } = await supabase.rpc("jb_r2_finish_cleanup_v1", {
    p_job_id: job.job_id,
    p_lease_token: job.lease_token,
    p_success: success,
    // Never store object keys, API credentials, or arbitrary response bodies.
    p_error: errorCode ? String(errorCode).slice(0, ERROR_LIMIT) : null,
  });
  if (error) throw new Error("Cleanup acknowledgement failed: " + (error.code || "UNKNOWN"));
}

async function runOneJob(services, job) {
  let success = false;
  let reason = null;
  try {
    if (!validateCleanupJob(job)) throw new Error("INVALID_JOB_OBJECT_KEY");

    if (job.bucket_name === PUBLIC_BUCKET && (
      process.env.JB_PUBLIC_THUMBNAIL_R2_BUCKET_NAME !== PUBLIC_BUCKET ||
      process.env.JB_PUBLIC_THUMBNAIL_ORIGIN !== PUBLIC_ORIGIN
    )) {
      throw new Error("PUBLIC_R2_CONFIGURATION_MISSING");
    }

    if (await isReferenced(services.supabase, job)) {
      throw new Error("R2_OBJECT_HAS_LIVE_REFERENCE");
    }
    await deleteAndVerifyObject(services.r2, job.bucket_name, job.object_key);
    success = true;
  } catch (error) {
    reason = String(error?.message || error?.name || "R2_DELETE_FAILED").slice(0, ERROR_LIMIT);
    console.error("R2 queued cleanup failed:", job.object_kind, error?.name || "ERROR");
  }
  await finishJob(services.supabase, job, success, reason);
  return { entity_id: job.entity_id, kind: job.object_kind, success };
}

/**
 * Never deletes arbitrary R2 paths or scanner-suspected orphans.
 * Only jobs inserted by verified server-side transactional DELETE RPCs.
 */
export async function processCleanupJobs(services, { entityIds = null, maxJobs = 12 } = {}) {
  if (!services?.supabase || !services?.r2 || services.bucket !== PRIVATE_BUCKET) {
    throw new Error("Cleanup services are unavailable");
  }
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 40) {
    throw new Error("Invalid cleanup batch limit");
  }
  const { data, error } = await services.supabase.rpc("jb_r2_claim_cleanup_v1", {
    p_limit: maxJobs,
    p_entity_ids: entityIds,
  });
  if (error || !Array.isArray(data)) {
    throw new Error("Could not claim R2 cleanup jobs");
  }

  const results = [];
  // Bound outstanding R2 operations so small Vercel functions cannot overflow.
  for (let index = 0; index < data.length; index += 3) {
    const batch = await Promise.allSettled(
      data.slice(index, index + 3).map(job => runOneJob(services, job))
    );
    for (const item of batch) {
      if (item.status === "fulfilled") results.push(item.value);
      else results.push({ success: false, acknowledgmentFailed: true });
    }
  }
  return {
    claimed: data.length,
    completed: results.filter(item => item.success).length,
    pending: results.filter(item => !item.success).length,
    acknowledgmentsFailed: results.filter(item => item.acknowledgmentFailed).length,
  };
}

export async function getCleanupSummary(supabase, entityIds = null) {
  let query = supabase.from("jb_r2_cleanup_jobs")
    .select("entity_id,entity_kind,object_kind,status,last_error,attempts,updated_at")
    .order("updated_at", { ascending: false }).limit(500);
  if (Array.isArray(entityIds) && entityIds.length) {
    query = query.in("entity_id", entityIds);
  }
  const { data, error } = await query;
  if (error || !Array.isArray(data)) throw new Error("Cleanup summary unavailable");
  const counts = { pending: 0, processing: 0, complete: 0, blocked: 0 };
  for (const j of data) {
    if (Object.hasOwn(counts, j.status)) counts[j.status]++;
  }
  return {
    counts,
    // A pending status is never reported as a completed cloud delete.
    pendingEntityIds: [...new Set(data
      .filter(j => j.status !== "complete").map(j => j.entity_id))],
    blocked: data.filter(j => j.status === "blocked").slice(0, 10).map(j => ({
      entityId: j.entity_id, kind: j.object_kind,
      attempts: j.attempts, error: j.last_error,
    })),
    truncated: data.length >= 500,
  };
}
