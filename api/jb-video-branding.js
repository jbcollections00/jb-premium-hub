// Phase 351: ADMIN-ONLY branding asset settings in PRIVATE R2 storage.
// No public URLs, no raw bytes through Vercel, no service credentials in browsers.
// This is configuration/staging. Processing worker and protected download routing
// must be separately enabled AFTER validating branded output.
import { randomUUID } from "node:crypto";
import { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

const PRIVATE_BUCKET = "jb-premium-private-videos";
const CONFIG_KEY = "branding/settings/current.json";
const ORIGINS = new Set([
  "https://www.jb-premium-hub.vip", "https://jb-premium-hub.vip",
  "http://localhost:5173", "http://127.0.0.1:5173",
  "http://localhost:5174", "http://127.0.0.1:5174",
]);
const TYPES = {
  intro: { mime: "video/mp4", ext: "mp4", limit: 100 * 1024 * 1024 },
  watermark: { mime: "image/png", ext: "png", limit: 5 * 1024 * 1024 },
  logo: { mime: "image/png", ext: "png", limit: 5 * 1024 * 1024 },
};
const KEY_RE = /^branding\/assets\/(intro|watermark|logo)\/[0-9a-f-]{36}\.(mp4|png)$/;
const fail = (res, status, reason) => res.status(status).json({ error: reason });
function trusted(req) {
  const origin = String(req.headers.origin || "");
  if (!origin) return true; // Bearer auth still required.
  if (ORIGINS.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    const host = String(req.headers.host || "").toLowerCase();
    return parsed.protocol === "https:" && parsed.host.toLowerCase() === host &&
      (/^jb-premium-[a-z0-9-]+-jbcollections00-7010s-projects\.vercel\.app$/i.test(host) ||
       /^jb-premium-hub(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(host));
  } catch { return false; }
}
function services() {
  const env = process.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY ||
      !env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY ||
      env.JB_STAGING_R2_BUCKET_NAME !== PRIVATE_BUCKET ||
      env.R2_BUCKET_NAME === PRIVATE_BUCKET) return null;
  return {
    db: createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    r2: new S3Client({
      region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    }),
  };
}
async function adminUser(db, token) {
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user?.id) return false;
  const { data: profile, error: profileError } = await db.from("profiles")
    .select("role,account_type").eq("id", data.user.id).maybeSingle();
  return !profileError && profile &&
    (String(profile.role || "").toLowerCase() === "admin" ||
     String(profile.account_type || "").toLowerCase() === "admin");
}
async function readConfig(r2) {
  try {
    const object = await r2.send(new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key: CONFIG_KEY }));
    const raw = await object.Body.transformToString();
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid branding config");
    return data;
  } catch (error) {
    if (error.name === "NoSuchKey" || error.name === "NotFound" ||
        error.$metadata?.httpStatusCode === 404) {
      return { version: 0, intro: null, watermark: null, logo: null, updatedAt: null };
    }
    throw error;
  }
}
async function headAsset(r2, key, kind, length) {
  const spec = TYPES[kind];
  if (!spec || !KEY_RE.test(key) ||
      !key.startsWith("branding/assets/" + kind + "/") ||
      !key.endsWith("." + spec.ext)) return false;
  const head = await r2.send(new HeadObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key }));
  const size = Number(head.ContentLength);
  return Number.isSafeInteger(size) && size > 0 && size <= spec.limit &&
    (!length || size === length) && head.ContentType === spec.mime;
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  const origin = req.headers.origin;
  if (!trusted(req)) return fail(res, 403, "Origin rejected.");
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return fail(res, 405, "Use POST.");
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization || "")?.[1];
  if (!token) return fail(res, 401, "Admin sign-in required.");
  const svc = services();
  if (!svc) return fail(res, 503, "Private asset storage unavailable.");
  try {
    if (!(await adminUser(svc.db, token))) return fail(res, 403, "Admin only.");
    const { action } = req.body || {};
    if (action === "queue-status") {
      const { data: rows, error } = await svc.db
        .from("jb_video_branding_jobs")
        .select("media_id,status,asset_version,attempts,last_error,updated_at")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) return fail(res, 503, "Processing queue is not installed yet.");
      const counts = { pending: 0, processing: 0, ready: 0, failed: 0, unsupported: 0 };
      for (const row of rows || []) if (Object.hasOwn(counts, row.status)) counts[row.status]++;
      return res.status(200).json({
        counts, lastUpdated: new Date().toISOString(), truncated: (rows || []).length >= 500,
        errors: (rows || []).filter((row) => row.status === "failed")
          .slice(0, 15).map((row) => ({
            mediaId: row.media_id, attempts: row.attempts,
            reason: String(row.last_error || "").slice(0,120),
          })),
      });
    }
    if (action === "get") {
      const settings = await readConfig(svc.r2);
      // Asset signed URLs are only returned to authenticated admins.
      const previews = {};
      for (const type of Object.keys(TYPES)) {
        const key = settings[type];
        if (typeof key === "string" && key.startsWith("branding/assets/" + type + "/") && KEY_RE.test(key)) {
          previews[type] = await getSignedUrl(svc.r2,
            new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key }), { expiresIn: 300 });
        }
      }
      return res.status(200).json({ settings, previews });
    }
    if (action === "begin") {
      const { kind, fileSize } = req.body;
      const spec = TYPES[kind];
      if (!spec || !Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > spec.limit) {
        return fail(res, 400, "Invalid asset type or size.");
      }
      const key = "branding/assets/" + kind + "/" + randomUUID() + "." + spec.ext;
      const uploadUrl = await getSignedUrl(svc.r2, new PutObjectCommand({
        Bucket: PRIVATE_BUCKET, Key: key, ContentType: spec.mime,
      }), { expiresIn: 900 });
      return res.status(200).json({ key, uploadUrl, contentType: spec.mime });
    }
    if (action === "complete") {
      const { kind, key, fileSize } = req.body;
      if (!TYPES[kind] || !Number.isSafeInteger(fileSize)) return fail(res, 400, "Invalid upload.");
      try {
        if (!(await headAsset(svc.r2, key, kind, fileSize))) return fail(res, 409, "Asset did not match expected upload.");
      } catch { return fail(res, 409, "Uploaded asset not found."); }
      return res.status(200).json({ verified: true, key });
    }
    if (action === "activate") {
      const { assets, expectedVersion } = req.body;
      if (!assets || typeof assets !== "object" || Array.isArray(assets) ||
          !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        return fail(res, 400, "Invalid branding settings.");
      }
      const previous = await readConfig(svc.r2);
      if (previous.version !== expectedVersion) return fail(res, 409, "Settings changed; reload before saving.");
      const next = {};
      for (const kind of Object.keys(TYPES)) {
        const key = assets[kind];
        if (typeof key !== "string") return fail(res, 400, "Upload all three branding assets first.");
        try {
          if (!(await headAsset(svc.r2, key, kind))) return fail(res, 400, "Invalid " + kind + " asset.");
        } catch { return fail(res, 400, "Missing " + kind + " asset."); }
        next[kind] = key;
      }
      const settings = { version: previous.version + 1, ...next, updatedAt: new Date().toISOString() };
      // This small config file is managed only through admin Bearer authorization.
      // One admin should edit at a time. An atomic CAS is needed for concurrent editors.
      await svc.r2.send(new PutObjectCommand({
        Bucket: PRIVATE_BUCKET, Key: CONFIG_KEY, Body: JSON.stringify(settings),
        ContentType: "application/json", CacheControl: "no-store",
      }));
      return res.status(200).json({ settings });
    }
    return fail(res, 400, "Unknown action.");
  } catch (error) {
    console.error("Private branding administration error:", error?.name || "unknown");
    return fail(res, 503, "Branding administration is temporarily unavailable.");
  }
}
