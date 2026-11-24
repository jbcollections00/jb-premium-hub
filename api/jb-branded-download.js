
import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PRIVATE_BUCKET = process.env.JB_STAGING_R2_BUCKET_NAME;

const ORIGINS = new Set([
  "https://www.jb-premium-hub.vip",
  "https://jb-premium-hub.vip",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
]);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const fail = (res, code, message) =>
  res.status(code).json({ error: message });

const trusted = (req) => {
  const origin = req.headers.origin;

  if (!origin) return true;

  if (ORIGINS.has(origin)) return true;

  try {
    const o = new URL(origin);
    const host = String(req.headers.host || "").toLowerCase();

    return (
      o.protocol === "https:" &&
      o.host.toLowerCase() === host &&
      (
        /^jb-premium-[a-z0-9-]+-jbcollections00-7010s-projects\.vercel\.app$/.test(host) ||
        /^jb-premium-hub(?:-[a-z0-9-]+)?\.vercel\.app$/.test(host)
      )
    );
  } catch {
    return false;
  }
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type"
  );

  if (!trusted(req)) {
    return fail(res, 403, "Origin denied");
  }

  if (req.headers.origin) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return fail(res, 405, "POST only");
  }

  const mediaId = req.body?.mediaId;

  if (!UUID.test(String(mediaId || ""))) {
    return fail(res, 400, "Invalid media ID");
  }

  const token = /^Bearer (\S+)$/i.exec(
    req.headers.authorization || ""
  )?.[1];

  if (!token) {
    return fail(res, 401, "Sign-in required");
  }

  const env = process.env;

  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY) ||
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !PRIVATE_BUCKET
  ) {
    return fail(res, 503, "Download service unavailable");
  }

  try {
    // Authenticate user
    const userDb = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: "Bearer " + token,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: userData, error: userError } =
      await userDb.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      return fail(res, 401, "Invalid session");
    }

    // Verify admin, VIP access and media visibility
    const [adminResult, accessResult, mediaResult] =
      await Promise.all([
        userDb.rpc("is_current_user_admin"),
        userDb.rpc("jb_billing_my_access"),
        userDb
          .from("media")
          .select("id,media_url,type")
          .eq("id", mediaId)
          .eq("type", "video")
          .maybeSingle(),
      ]);

    if (
      adminResult.error ||
      typeof adminResult.data !== "boolean"
    ) {
      return fail(res, 503, "Admin status unavailable");
    }

    if (mediaResult.error || !mediaResult.data) {
      return fail(res, 404, "Media unavailable");
    }

    if (
      accessResult.error ||
      !Array.isArray(accessResult.data)
    ) {
      return fail(res, 503, "Membership verification unavailable");
    }

    const access = accessResult.data[0];
    const admin = adminResult.data === true;

    const allowed =
      admin ||
      (
        access?.tier === "vip" &&
        access?.can_download === true &&
        access?.can_view_albums === true &&
        Date.parse(access.access_expires_at) > Date.now()
      );

    if (!allowed) {
      return fail(res, 403, "VIP download access required");
    }

    // Verify that the media belongs to the private R2 bucket.
    const prefix = `r2://${PRIVATE_BUCKET}/`;

    if (
      typeof mediaResult.data.media_url !== "string" ||
      !mediaResult.data.media_url.startsWith(prefix)
    ) {
      return fail(res, 409, "Private original video unavailable");
    }

    const objectKey = mediaResult.data.media_url.slice(prefix.length);

    if (
      !objectKey ||
      objectKey.startsWith("/") ||
      objectKey.split("/").some(
        (part) => !part || part === "." || part === ".."
      )
    ) {
      return fail(res, 409, "Invalid private video reference");
    }

    // Connect to private Cloudflare R2
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    // Verify original object exists and is an MP4.
    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: PRIVATE_BUCKET,
        Key: objectKey,
      })
    );

    if (
      !head.ContentLength ||
      head.ContentType !== "video/mp4"
    ) {
      return fail(res, 409, "Original MP4 is not available");
    }

    // Generate temporary signed download URL.
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: PRIVATE_BUCKET,
        Key: objectKey,
        ResponseContentDisposition:
          `attachment; filename="JB-Premium-${mediaId}.mp4"`,
        ResponseContentType: "video/mp4",
      }),
      { expiresIn: 90 }
    );

    return res.status(200).json({
      status: "ready",
      url,
      expiresInSeconds: 90,
    });

  } catch (error) {
    console.error(
      "Original video download unavailable:",
      error?.name || "unknown"
    );

    return fail(res, 503, "Download unavailable");
  }
}
