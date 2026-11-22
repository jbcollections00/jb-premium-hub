// Phase 339 — Public artwork proxy for ALREADY-PUBLISHED videos ONLY.
// Never exposes private video bytes, unpublished staging covers, or R2 tokens.
// Temporary delivery fallback when a dedicated public-thumbnail bucket has not
// been configured. Prefer immutable public-assets hosting at scale.
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_BUCKET = "jb-premium-private-videos";
const MAX_JPEG_BYTES = 1024 * 1024;
const NO_STORE = "private, no-store, max-age=0";

/**
 * Pure authorization boundary: only a published media row linked to a matching
 * staged MP4 may expose that staging record's exact generated JPEG preview.
 */
export function approvedThumbnailKey(media, link, staged, mediaId) {
  if (!MEDIA_ID.test(String(mediaId || "")) ||
      media?.id !== mediaId || media?.type !== "video" ||
      !link?.staging_id || !MEDIA_ID.test(link.staging_id) ||
      staged?.id !== link.staging_id ||
      !staged.created_by || !MEDIA_ID.test(staged.created_by) ||
      !staged.uploaded_at || !staged.preview_uploaded_at) return null;
  const expectedVideo = "staging/" + staged.created_by + "/" + staged.id + ".mp4";
  const expectedPreview = "staging-thumbnails/" + staged.created_by + "/" + staged.id + ".jpg";
  if (staged.storage_key !== expectedVideo ||
      staged.preview_key !== expectedPreview ||
      media.media_url !== "r2://" + PRIVATE_BUCKET + "/" + expectedVideo) return null;
  return expectedPreview;
}

function reject(res, status) {
  res.setHeader("Cache-Control", NO_STORE);
  return res.status(status).end();
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return reject(res, 405);
  const input = req.query?.id;
  if (typeof input !== "string" || !MEDIA_ID.test(input)) return reject(res, 404);

  const {
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
    JB_STAGING_R2_BUCKET_NAME
  } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY ||
      !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY ||
      JB_STAGING_R2_BUCKET_NAME !== PRIVATE_BUCKET ||
      JB_STAGING_R2_BUCKET_NAME === process.env.R2_BUCKET_NAME) {
    return reject(res, 503);
  }

  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Require an active catalog record AND a trusted, committed publication.
    // A private staging record alone must NEVER make its preview publicly readable.
    const [mediaResult, linkResult] = await Promise.all([
      db.from("media").select("id, type, media_url")
        .eq("id", input).eq("type", "video").maybeSingle(),
      db.from("jb_media_publication_links").select("staging_id")
        .eq("media_id", input).maybeSingle(),
    ]);
    if (mediaResult.error || linkResult.error) return reject(res, 503);
    const media = mediaResult.data;
    const link = linkResult.data;
    if (!media?.id || !link?.staging_id || !MEDIA_ID.test(link.staging_id)) return reject(res, 404);

    const { data: staged, error } = await db.from("jb_media_upload_staging")
      .select("id, created_by, uploaded_at, preview_key, preview_uploaded_at, storage_key")
      .eq("id", link.staging_id).maybeSingle();
    if (error) return reject(res, 503);
    const expectedPreview = approvedThumbnailKey(media, link, staged, input);
    if (!expectedPreview) return reject(res, 404);

    const client = new S3Client({
      region: "auto",
      endpoint: "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
    const head = await client.send(new HeadObjectCommand({
      Bucket: PRIVATE_BUCKET, Key: expectedPreview,
    }));
    const length = Number(head.ContentLength);
    if (!Number.isSafeInteger(length) || length < 1 || length > MAX_JPEG_BYTES ||
        head.ContentType !== "image/jpeg") return reject(res, 404);

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    // Keep the cache short because publication authorization can change.
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60, stale-while-revalidate=60");
    res.setHeader("Content-Length", String(length));
    if (req.method === "HEAD") return res.status(200).end();

    const result = await client.send(new GetObjectCommand({
      Bucket: PRIVATE_BUCKET, Key: expectedPreview,
    }));
    if (!result.Body) return reject(res, 502);
    const bytes = await result.Body.transformToByteArray();
    if (bytes.length !== length || bytes.length > MAX_JPEG_BYTES) return reject(res, 502);
    // Verify JPEG magic before emitting artwork to the public endpoint.
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
      return reject(res, 502);
    }
    return res.status(200).end(Buffer.from(bytes));
  } catch (error) {
    console.error("Published artwork unavailable:", error?.name || "UNKNOWN");
    return reject(res, 503);
  }
}
