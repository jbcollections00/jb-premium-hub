// Admin-only private video upload staging.
// Never writes public.media and never returns a public object URL.
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "https://www.jb-premium-hub.vip",
  "https://jb-premium-hub.vip",
]);
if (process.env.JB_STAGING_ALLOWED_ORIGIN) {
  ALLOWED_ORIGINS.add(process.env.JB_STAGING_ALLOWED_ORIGIN);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_BY_EXTENSION = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};
const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_NAME_LENGTH = 200;
const PRIVATE_BUCKET = "jb-premium-private-videos";

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return false;
  return true;
}

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function getServices() {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    JB_STAGING_R2_BUCKET_NAME,
  } = process.env;
  // Fail closed if the private upload bucket is not explicitly configured.
  // Do NOT fall back to the historical upload bucket/public URL.
  if (
    !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY ||
    !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY ||
    JB_STAGING_R2_BUCKET_NAME !== PRIVATE_BUCKET ||
    JB_STAGING_R2_BUCKET_NAME === process.env.R2_BUCKET_NAME
  ) {
    return null;
  }

  return {
    supabase: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    r2: new S3Client({
      region: "auto",
      endpoint: "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    }),
    bucket: PRIVATE_BUCKET,
  };
}

function getMime(fileName) {
  const extension = String(fileName || "").toLowerCase().split(".").pop();
  const contentType = MIME_BY_EXTENSION[extension];
  if (!contentType) return null;
  return { extension, contentType };
}

async function getAdmin(services, token) {
  const { data: userResult, error: userError } = await services.supabase.auth.getUser(token);
  if (userError || !userResult?.user?.id) return null;
  const { data: profile, error: profileError } = await services.supabase
    .from("profiles")
    .select("role, account_type")
    .eq("id", userResult.user.id)
    .maybeSingle();
  if (profileError || !profile) return null;
  const isAdmin =
    String(profile.role || "").toLowerCase() === "admin" ||
    String(profile.account_type || "").toLowerCase() === "admin";
  return isAdmin ? userResult.user : null;
}

async function begin(req, res, services, admin) {
  const { albumId, fileName, fileSize } = req.body || {};
  if (!UUID.test(String(albumId || ""))) return fail(res, 400, "Select a valid album.");
  if (
    typeof fileName !== "string" ||
    !fileName.trim() ||
    fileName.length > MAX_NAME_LENGTH ||
    fileName.includes("/") ||
    fileName.includes(String.fromCharCode(92)) ||
    /[\x00-\x1f]/.test(fileName)
  ) {
    return fail(res, 400, "Invalid video file name.");
  }
  const type = getMime(fileName);
  if (!type) return fail(res, 400, "Unsupported video type. Use MP4, MOV, WEBM, MKV or AVI.");
  if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_SIZE_BYTES) {
    return fail(res, 400, "Video must be between 1 byte and 2 GB.");
  }

  const { data: album, error: albumError } = await services.supabase
    .from("jb_media_albums").select("id").eq("id", albumId).maybeSingle();
  if (albumError || !album) return fail(res, 404, "Album not found.");

  const id = randomUUID();
  const key = "staging/" + admin.id + "/" + id + "." + type.extension;
  const { error: insertError } = await services.supabase.from("jb_media_upload_staging")
    .insert({
      id, album_id: albumId, created_by: admin.id,
      original_filename: fileName.trim(), mime_type: type.contentType,
      size_bytes: fileSize, storage_key: key,
      status: "awaiting_upload",
    });
  if (insertError) {
    console.error("Private staging metadata insert failed:", insertError.code || "unknown");
    return fail(res, 503, "Private upload staging is not configured. Check the new SQL migration.");
  }

  const uploadUrl = await getSignedUrl(
    services.r2,
    new PutObjectCommand({
      Bucket: services.bucket,
      Key: key,
      ContentType: type.contentType,
    }),
    { expiresIn: 3600 }
  );
  return res.status(200).json({
    draftId: id,
    uploadUrl,
    contentType: type.contentType,
    expiresInSeconds: 3600,
  });
}

async function complete(req, res, services, admin) {
  const { draftId } = req.body || {};
  if (!UUID.test(String(draftId || ""))) return fail(res, 400, "Invalid staging ID.");

  const { data: row, error: readError } = await services.supabase
    .from("jb_media_upload_staging")
    .select("id, created_by, storage_key, mime_type, size_bytes, status")
    .eq("id", draftId).eq("created_by", admin.id).maybeSingle();
  if (readError || !row) return fail(res, 404, "Private upload draft not found.");
  if (row.status === "pending_review") {
    return res.status(200).json({ draftId, status: "pending_review" });
  }
  if (row.status !== "awaiting_upload") return fail(res, 409, "Draft cannot be completed.");

  let metadata;
  try {
    metadata = await services.r2.send(new HeadObjectCommand({
      Bucket: services.bucket,
      Key: row.storage_key,
    }));
  } catch {
    return fail(res, 409, "Private upload is not yet available in R2.");
  }
  if (
    Number(metadata.ContentLength) !== Number(row.size_bytes) ||
    (metadata.ContentType && metadata.ContentType !== row.mime_type)
  ) {
    return fail(res, 409, "Uploaded object does not match expected file metadata.");
  }

  const { error: updateError } = await services.supabase
    .from("jb_media_upload_staging")
    .update({ status: "pending_review", uploaded_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("created_by", admin.id)
    .eq("status", "awaiting_upload");
  if (updateError) return fail(res, 503, "Could not finalize private staging metadata.");

  return res.status(200).json({
    draftId,
    status: "pending_review",
  });
}

export default async function handler(req, res) {
  if (!cors(req, res)) return fail(res, 403, "Origin not permitted.");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return fail(res, 405, "Method not allowed.");

  const token = String(req.headers.authorization || "").startsWith("Bearer ")
    ? req.headers.authorization.slice(7) : "";
  if (!token) return fail(res, 401, "Authentication required.");

  const services = getServices();
  if (!services) return fail(res, 503, "Private R2 staging is not enabled.");

  try {
    const admin = await getAdmin(services, token);
    if (!admin) return fail(res, 403, "Admin access required.");

    if (req.body?.action === "begin") return await begin(req, res, services, admin);
    if (req.body?.action === "complete") return await complete(req, res, services, admin);
    return fail(res, 400, "Unknown staging action.");
  } catch (error) {
    console.error("Private staging request failed:", error?.name || "unknown");
    return fail(res, 500, "Private staging request failed.");
  }
}
