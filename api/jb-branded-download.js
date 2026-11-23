// VIP-only signed download of a VERIFIED PRIVATE BRANDED MP4.
// Must be enabled only after the private processing worker has been validated.
// Never falls back to original media, even if R2 processing is unavailable.
import { createClient } from "@supabase/supabase-js";
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { destinationKey, PRIVATE_BUCKET, sourceKey } from "../scripts/video-branding/queue-contract.mjs";

const ORIGINS = new Set([
  "https://www.jb-premium-hub.vip", "https://jb-premium-hub.vip",
  "http://localhost:5173", "http://127.0.0.1:5173",
  "http://localhost:5174", "http://127.0.0.1:5174",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (res, code, message) => res.status(code).json({ error: message });
const trusted = (req) => {
  const origin = req.headers.origin;
  if (!origin) return true; // Non-browser requests still require a valid user JWT.
  if (ORIGINS.has(origin)) return true;
  try {
    const o = new URL(origin);
    const host = String(req.headers.host || "").toLowerCase();
    return o.protocol === "https:" && o.host.toLowerCase() === host &&
      (/^jb-premium-[a-z0-9-]+-jbcollections00-7010s-projects\.vercel\.app$/.test(host) ||
       /^jb-premium-hub(?:-[a-z0-9-]+)?\.vercel\.app$/.test(host));
  } catch { return false; }
};
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (!trusted(req)) return fail(res, 403, "Origin denied");
  if (req.headers.origin) res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return fail(res, 405, "POST only");
  if (process.env.JB_BRANDED_DOWNLOADS_ENABLED !== "true") {
    return fail(res, 503, "Branded downloads not enabled");
  }
  const mediaId = req.body?.mediaId;
  if (!UUID.test(String(mediaId || ""))) return fail(res, 400, "Invalid media ID");
  const token = /^Bearer (\S+)$/i.exec(req.headers.authorization || "")?.[1];
  if (!token) return fail(res, 401, "Sign-in required");
  const env = process.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY ||
      !(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY) || !env.R2_ACCOUNT_ID ||
      !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY ||
      env.JB_STAGING_R2_BUCKET_NAME !== PRIVATE_BUCKET) {
    return fail(res, 503, "Download service unavailable");
  }
  try {
    const userDb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userDb.auth.getUser(token);
    if (userError || !userData?.user?.id) return fail(res, 401, "Invalid session");
    const [adminResult, accessResult, mediaResult] = await Promise.all([
      userDb.rpc("is_current_user_admin"),
      userDb.rpc("jb_billing_my_access"),
      userDb.from("media").select("id,media_url,type").eq("id", mediaId).eq("type", "video").maybeSingle(),
    ]);
    if (adminResult.error || typeof adminResult.data !== "boolean") return fail(res, 503, "Admin status unavailable");
    if (mediaResult.error || !mediaResult.data) return fail(res, 404, "Media unavailable");
    if (accessResult.error || !Array.isArray(accessResult.data)) return fail(res, 503, "Membership verification unavailable");
    const access = accessResult.data[0];
    const admin = adminResult.data === true;
    const allowed = admin || (access?.tier === "vip" && access?.can_download === true &&
      access?.can_view_albums === true && Date.parse(access.access_expires_at) > Date.now());
    if (!allowed) return fail(res, 403, "VIP download access required");

    // The service role is used ONLY for server-private job metadata, after user auth/RLS.
    const serviceDb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: job, error: jobError } = await serviceDb.from("jb_video_branding_jobs")
      .select("media_id,source_key,status,asset_version,output_key,output_bytes")
      .eq("media_id", mediaId).maybeSingle();
    if (jobError) return fail(res, 503, "Branding status unavailable");
    if (!job || job.status !== "ready" || !job.output_bytes) {
      return fail(res, 409, "This video is still being branded. Download will be available when processing finishes.");
    }
    sourceKey(mediaId, job.source_key);
    if (mediaResult.data.media_url !== "r2://" + PRIVATE_BUCKET + "/" + job.source_key ||
        job.output_key !== destinationKey(mediaId, job.asset_version)) {
      return fail(res, 409, "Processed video reference mismatch");
    }
    const s3 = new S3Client({
      region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    });
    const head = await s3.send(new HeadObjectCommand({ Bucket: PRIVATE_BUCKET, Key: job.output_key }));
    if (Number(head.ContentLength) !== Number(job.output_bytes) || head.ContentType !== "video/mp4") {
      return fail(res, 409, "Branded MP4 is not fully available");
    }
    const url = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: PRIVATE_BUCKET, Key: job.output_key,
      ResponseContentDisposition: `attachment; filename="JB-Premium-${mediaId}.mp4"`,
      ResponseContentType: "video/mp4",
    }), { expiresIn: 90 });
    return res.status(200).json({ status: "ready", url, expiresInSeconds: 90 });
  } catch (error) {
    console.error("Branded download unavailable:", error?.name || "unknown");
    return fail(res, 503, "Branded download unavailable");
  }
}
