import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPIRES_SECONDS = 900; // per playback session; repeat viewing is unlimited
const VIDEO_CDN_ORIGIN = "https://cdn.jb-premium-hub.vip";

function objectKeyFromMediaUrl(raw, publicBase) {
  if (typeof raw !== "string" || !raw || !publicBase) return null;
  let url, base;
  try {
    url = new URL(raw);
    base = new URL(publicBase);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || !["https:"].includes(base.protocol)) return null;
  // Reject arbitrary hosts, uploaded redirects and arbitrary file locations.
  const allowed = [base.origin, VIDEO_CDN_ORIGIN];
  if (!allowed.includes(url.origin)) return null;
  let pathname = url.pathname;
  const basePrefix = base.origin === url.origin ? base.pathname.replace(/\/+$/, "") : "";
  if (basePrefix && !pathname.startsWith(basePrefix + "/")) return null;
  if (basePrefix) pathname = pathname.slice(basePrefix.length);
  let key;
  try { key = decodeURIComponent(pathname.replace(/^\/+/, "")); } catch { return null; }
  if (!key.startsWith("videos/") || key.length > 1024 ||
      key.split("/").some((p) => !p || p === "." || p === ".." || /[\x00-\x1F]/.test(p)) ||
      key.includes("\\") || key.includes("?") || key.includes("#")) return null;
  return key;
}

const NO_STORE = {
  "Cache-Control": "no-store, private, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export default async function handler(req, res) {
  for (const [key, value] of Object.entries(NO_STORE)) res.setHeader(key, value);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // A bearer token is required. Do not permit cross-site origins even if
  // someone obtains a token; normal preview/production requests are same-origin.
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return res.status(403).json({ error: "Invalid origin" });
  try {
    const source = new URL(origin);
    if (source.protocol !== "https:" && source.origin !== "http://localhost:5173")
      return res.status(403).json({ error: "Invalid origin" });
    if (source.host !== host) return res.status(403).json({ error: "Invalid origin" });
  } catch { return res.status(403).json({ error: "Invalid origin" }); }

  // Safe default: private video storage must be audited before activation.
  if (process.env.JB_FREE_PREVIEW_ENABLED !== "true" ||
      process.env.JB_FREE_PREVIEW_PRIVATE_STORAGE_CONFIRMED !== "true") {
    return res.status(503).json({ error: "Free previews are not enabled" });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME, R2_PUBLIC_URL } = process.env;
  if (![SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL].every(Boolean))
    return res.status(503).json({ error: "Free-preview service is not configured" });

  const tokenMatch = /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(req.headers.authorization || "");
  if (!tokenMatch) return res.status(401).json({ error: "Authentication required" });
  const mediaId = req.body?.media_id;
  if (!UUID.test(String(mediaId || ""))) return res.status(400).json({ error: "Invalid media ID" });

  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: authData, error: authError } = await db.auth.getUser(tokenMatch[1]);
    if (authError || !authData?.user?.id) return res.status(401).json({ error: "Invalid session" });

    // Independently select the exact admin-approved video; never trust a
    // browser-supplied 'free' flag, media key, plan, or R2 URL.
    const { data: media, error: mediaError } = await db.from("media")
      .select("id,type,is_free_preview,media_url")
      .eq("id", mediaId)
      .maybeSingle();

    if (mediaError || !media || media.type !== "video" || media.is_free_preview !== true)
      return res.status(403).json({ error: "This video requires a membership" });

    const key = objectKeyFromMediaUrl(media.media_url, R2_PUBLIC_URL);
    if (!key) return res.status(503).json({ error: "Private video source not configured" });

    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
    });
    const url = await getSignedUrl(s3,
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }),
      { expiresIn: EXPIRES_SECONDS }
    );
    // Signed media URLs must never be logged, cached or stored.
    return res.status(200).json({ status: "issued", url, expires_in: EXPIRES_SECONDS });
  } catch (error) {
    console.error("Free-preview signing failed:", error?.name || "UNKNOWN");
    return res.status(503).json({ error: "Unable to start free-preview playback" });
  }
}
