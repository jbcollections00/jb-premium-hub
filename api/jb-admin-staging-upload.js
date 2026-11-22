// Admin-only private video upload staging.
// Never writes public.media and never returns a public object URL.
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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
const MIME_BY_EXTENSION = { mp4: "video/mp4" };
const MAX_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_NAME_LENGTH = 200;
const PRIVATE_BUCKET = "jb-premium-private-videos";
const MAX_PREVIEW_BYTES = 1024 * 1024;
const PREVIEW_MIME = "image/jpeg";

// Vercel may assign multiple first-party aliases to the same deployment.
// Accept the app's own same-origin request only for a validated project host.
function isTrustedSameOrigin(req, origin) {
  try {
    const url = new URL(origin);
    const host = String(req.headers.host || "").toLowerCase();
    // Vercel's Preview URLs use the project's deployment slug and owning team,
    // e.g. jb-premium-<deployment>-jbcollections00-7010s-projects.vercel.app.
    // Restrict to this specific project/team and require an EXACT same-origin
    // Host match. Do not accept arbitrary *.vercel.app origins.
    const previewDeploymentHost =
      /^jb-premium-[a-z0-9-]+-jbcollections00-7010s-projects\.vercel\.app$/i.test(host);
    const trustedHost =
      previewDeploymentHost ||
      /^jb-premium-hub(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(host) ||
      host === "www.jb-premium-hub.vip" ||
      host === "jb-premium-hub.vip";
    return trustedHost && url.protocol === "https:" &&
      url.origin === origin && url.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function cors(req, res) {
  const origin = req.headers.origin;
  const permitted = !origin ||
    ALLOWED_ORIGINS.has(origin) ||
    isTrustedSameOrigin(req, origin);
  if (origin && permitted) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Cache-Control", "no-store");
  return permitted;
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
  if (!type) return fail(res, 400, "Unsupported video type. Upload MP4 videos only.");
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

// All thumbnail routes are admin-authenticated and only operate on the current
// admin's PRIVATE staged video. The signed GET is short-lived and must never be
// used as a public Home/media thumbnail.
const previewKey = (adminId, draftId) =>
  "staging-thumbnails/" + adminId + "/" + draftId + ".jpg";

async function ownedStagedDraft(services, admin, draftId) {
  if (!UUID.test(String(draftId || ""))) return null;
  const { data, error } = await services.supabase
    .from("jb_media_upload_staging")
    .select("id, created_by, status, preview_key")
    .eq("id", draftId)
    .eq("created_by", admin.id)
    .eq("status", "pending_review")
    .maybeSingle();
  if (error) return null;
  return data;
}

async function thumbnailBegin(req, res, services, admin) {
  const { draftId, fileSize } = req.body || {};
  if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_PREVIEW_BYTES) {
    return fail(res, 400, "Thumbnail must be a JPEG under 1 MB.");
  }
  const row = await ownedStagedDraft(services, admin, draftId);
  if (!row) return fail(res, 404, "Private pending-review upload not found.");
  const key = previewKey(admin.id, draftId);
  const uploadUrl = await getSignedUrl(
    services.r2,
    new PutObjectCommand({
      Bucket: services.bucket,
      Key: key,
      ContentType: PREVIEW_MIME,
    }),
    { expiresIn: 900 }
  );
  return res.status(200).json({ uploadUrl, contentType: PREVIEW_MIME });
}

async function thumbnailComplete(req, res, services, admin) {
  const { draftId, fileSize } = req.body || {};
  if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_PREVIEW_BYTES) {
    return fail(res, 400, "Invalid thumbnail size.");
  }
  const row = await ownedStagedDraft(services, admin, draftId);
  if (!row) return fail(res, 404, "Private pending-review upload not found.");
  const key = previewKey(admin.id, draftId);
  let head;
  try {
    head = await services.r2.send(new HeadObjectCommand({
      Bucket: services.bucket, Key: key,
    }));
  } catch {
    return fail(res, 409, "Private thumbnail upload was not found.");
  }
  if (
    Number(head.ContentLength) !== fileSize ||
    (head.ContentType && head.ContentType !== PREVIEW_MIME)
  ) return fail(res, 409, "Private thumbnail metadata does not match.");

  const { error } = await services.supabase
    .from("jb_media_upload_staging")
    .update({ preview_key: key, preview_uploaded_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("created_by", admin.id)
    .eq("status", "pending_review");
  if (error) return fail(res, 503, "Private thumbnail metadata update failed.");
  return res.status(200).json({ status: "private_preview_saved" });
}

async function thumbnailPreviews(req, res, services, admin) {
  const { draftIds } = req.body || {};
  if (
    !Array.isArray(draftIds) ||
    draftIds.length > 100 ||
    draftIds.some((id) => !UUID.test(String(id)))
  ) return fail(res, 400, "Invalid private upload IDs.");
  if (draftIds.length === 0) return res.status(200).json({ previews: {} });
  const { data: rows, error } = await services.supabase
    .from("jb_media_upload_staging")
    .select("id, preview_key")
    .eq("created_by", admin.id)
    .eq("status", "pending_review")
    .in("id", draftIds);
  if (error) return fail(res, 503, "Private preview lookup failed.");

  const previews = {};
  for (const row of rows || []) {
    // Sign only the deterministic staging path for this authenticated admin.
    if (row.preview_key !== previewKey(admin.id, row.id)) continue;
    previews[row.id] = await getSignedUrl(
      services.r2,
      new GetObjectCommand({
        Bucket: services.bucket,
        Key: row.preview_key,
      }),
      { expiresIn: 600 }
    );
  }
  return res.status(200).json({ previews });
}


// Phase 338 — Admin-controlled review and publishing. No client receives
// service-role credentials and no staging object is published automatically.
const LOGO_COVER = "https://assets.jb-premium-hub.vip/thumbnails/logo_JBCollections.png";
const PUBLISHED_COVER_PREFIX = "https://assets.jb-premium-hub.vip/thumbnails/published/";

async function reviewList(req, res, services, admin) {
  const { data: rows, error } = await services.supabase
    .from("jb_media_upload_staging")
    .select("id, album_id, original_filename, size_bytes, status, created_at, uploaded_at, created_by, preview_key, preview_uploaded_at")
    .eq("created_by", admin.id)
    .eq("status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return fail(res, 503, "Could not load review queue.");
  if (!rows?.length) return res.status(200).json({ items: [] });

  const ids = rows.map((row) => row.id);
  const albumIds = [...new Set(rows.map((row) => row.album_id))];
  const [linksResult, albumsResult] = await Promise.all([
    services.supabase.from("jb_media_publication_links")
      .select("staging_id, media_id").in("staging_id", ids),
    services.supabase.from("jb_media_albums")
      .select("id, name, is_visible").in("id", albumIds),
  ]);
  if (linksResult.error || albumsResult.error) {
    return fail(res, 503, "Could not verify review queue publication status.");
  }
  const publishedIds = new Set((linksResult.data || []).map((link) => link.staging_id));
  const albums = new Map((albumsResult.data || []).map((album) => [album.id, album]));
  // Include incomplete attempts when warning of duplicate filenames.
  const { data: nameRows, error: namesError } = await services.supabase
    .from("jb_media_upload_staging")
    .select("original_filename")
    .eq("created_by", admin.id)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (namesError) return fail(res, 503, "Could not verify possible duplicate uploads.");
  const nameCounts = new Map();
  for (const row of nameRows || []) {
    const key = row.original_filename.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  const items = [];
  for (const row of rows) {
    if (publishedIds.has(row.id)) continue; // Published videos only live in Media Manager.
    let thumbnail = null;
    if (
      row.preview_uploaded_at &&
      row.preview_key === previewKey(admin.id, row.id)
    ) {
      thumbnail = await getSignedUrl(
        services.r2,
        new GetObjectCommand({ Bucket: services.bucket, Key: row.preview_key }),
        { expiresIn: 600 }
      );
    }
    items.push({
      id: row.id,
      filename: row.original_filename,
      albumName: albums.get(row.album_id)?.name || "Unknown album",
      albumVisible: albums.get(row.album_id)?.is_visible === true,
      sizeBytes: Number(row.size_bytes),
      uploadedAt: row.uploaded_at,
      thumbnail,
      possibleDuplicate: (nameCounts.get(row.original_filename.trim().toLowerCase()) || 0) > 1,
    });
  }
  return res.status(200).json({ items });
}

// Both administrative draft lists exclude already-linked/published media.
// Reject on any publication lookup failure rather than expose protected drafts.
async function queueList(req, res, services, admin) {
  const { data: rows, error } = await services.supabase
    .from("jb_media_upload_staging")
    .select("id, original_filename, status, created_at, preview_key, preview_uploaded_at")
    .eq("created_by", admin.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return fail(res, 503, "Private upload queue unavailable.");
  if (!rows?.length) return res.status(200).json({ items: [] });
  const { data: links, error: linkError } = await services.supabase
    .from("jb_media_publication_links").select("staging_id")
    .in("staging_id", rows.map((row) => row.id));
  if (linkError) return fail(res, 503, "Could not verify publication status.");
  const published = new Set((links || []).map((link) => link.staging_id));
  const items = [];
  const now = Date.now();
  for (const row of rows) {
    if (published.has(row.id)) continue;
    let thumbnail = null;
    if (row.status === "pending_review" &&
        row.preview_uploaded_at &&
        row.preview_key === previewKey(admin.id, row.id)) {
      thumbnail = await getSignedUrl(
        services.r2,
        new GetObjectCommand({ Bucket: services.bucket, Key: row.preview_key }),
        { expiresIn: 600 }
      );
    }
    items.push({
      id: row.id,
      original_filename: row.original_filename,
      status: row.status,
      created_at: row.created_at,
      thumbnail,
      canDelete: row.status === "pending_review" ||
        (row.status === "awaiting_upload" &&
          now - Date.parse(row.created_at) > 65 * 60 * 1000),
    });
  }
  return res.status(200).json({ items });
}

async function deleteUnpublished(req, res, services, admin) {
  const draftIds = req.body?.draftIds;
  if (!Array.isArray(draftIds) || !draftIds.length ||
      draftIds.length > 50 || draftIds.some((id) => typeof id !== "string" || !UUID.test(id)) ||
      new Set(draftIds).size !== draftIds.length) {
    return fail(res, 400, "Select 1–50 unique unpublished video drafts.");
  }
  const { data: rows, error } = await services.supabase
    .from("jb_media_upload_staging")
    .select("id, created_by, storage_key, status, created_at, preview_key")
    .eq("created_by", admin.id).in("id", draftIds);
  if (error) return fail(res, 503, "Could not verify staging ownership.");
  if (!rows || rows.length !== draftIds.length) {
    return fail(res, 409, "Some drafts are missing or not owned by this admin. Refresh the queue.");
  }
  const { data: links, error: linkError } = await services.supabase
    .from("jb_media_publication_links")
    .select("staging_id").in("staging_id", draftIds);
  if (linkError) return fail(res, 503, "Could not verify publication links.");
  if (links?.length) return fail(res, 409, "Published videos cannot be deleted from staging.");

  // A presigned PUT can be valid for one hour. Never delete a newly
  // created/in-progress draft until that lease has expired plus a buffer.
  const now = Date.now();
  for (const row of rows) {
    const stale = Number.isFinite(Date.parse(row.created_at)) &&
      now - Date.parse(row.created_at) > 65 * 60 * 1000;
    if (row.status !== "pending_review" &&
        !(row.status === "awaiting_upload" && stale)) {
      return fail(res, 409, "Active uploads cannot be deleted yet. Retry after upload URL expiry.");
    }
    const exactKey = "staging/" + admin.id + "/" + row.id + ".mp4";
    if (row.storage_key !== exactKey ||
        (row.preview_key && row.preview_key !== previewKey(admin.id, row.id))) {
      return fail(res, 409, "Unsafe staging object reference. No files were deleted.");
    }
  }

  const deleted = [];
  const rejected = [];
  const cleanupPending = [];
  for (const row of rows) {
    // Database comes first: FK ON DELETE RESTRICT prevents deletion if a
    // concurrent publisher has created a media publication link.
    const { data: removed, error: deleteError } = await services.supabase
      .from("jb_media_upload_staging")
      .delete().eq("id", row.id).eq("created_by", admin.id)
      .eq("status", row.status).select("id");
    if (deleteError || removed?.length !== 1) {
      rejected.push(row.id);
      continue;
    }
    deleted.push(row.id);
    for (const key of [row.storage_key, row.preview_key].filter(Boolean)) {
      try {
        await services.r2.send(new DeleteObjectCommand({
          Bucket: services.bucket, Key: key,
        }));
      } catch (error) {
        // Never claim the backing R2 object was removed if its DELETE failed.
        cleanupPending.push(row.id);
        console.error("Unpublished R2 cleanup requires retry:", error?.name || "unknown");
      }
    }
  }
  return res.status(200).json({ deleted, rejected, cleanupPending: [...new Set(cleanupPending)] });
}

async function reviewVideo(req, res, services, admin) {
  const { draftId } = req.body || {};
  if (!UUID.test(String(draftId || ""))) return fail(res, 400, "Invalid staged media ID.");
  const { data: row, error } = await services.supabase
    .from("jb_media_upload_staging")
    .select("id, created_by, status, storage_key, size_bytes, mime_type, uploaded_at")
    .eq("id", draftId)
    .eq("created_by", admin.id)
    .eq("status", "pending_review")
    .maybeSingle();
  if (error || !row || !row.uploaded_at) return fail(res, 404, "Video not available for review.");
  if (
    row.storage_key !== "staging/" + admin.id + "/" + draftId + ".mp4" ||
    row.mime_type !== "video/mp4"
  ) return fail(res, 409, "Invalid private video reference.");

  let metadata;
  try {
    metadata = await services.r2.send(new HeadObjectCommand({
      Bucket: services.bucket, Key: row.storage_key,
    }));
  } catch {
    return fail(res, 409, "Private video is missing from R2.");
  }
  if (Number(metadata.ContentLength) !== Number(row.size_bytes) ||
      (metadata.ContentType && metadata.ContentType !== "video/mp4")) {
    return fail(res, 409, "Private video metadata mismatch.");
  }
  const url = await getSignedUrl(
    services.r2,
    new GetObjectCommand({ Bucket: services.bucket, Key: row.storage_key }),
    { expiresIn: 300 }
  );
  return res.status(200).json({ url, expiresInSeconds: 300 });
}

async function publishCoverIfAvailable(services, admin, row) {
  const publicBucket = String(process.env.JB_PUBLIC_THUMBNAIL_R2_BUCKET_NAME || "").trim();
  // Fail safe: do not copy a preview to an unknown or private bucket.
  if (!publicBucket ||
      !/^[a-z0-9][a-z0-9._-]{1,62}$/.test(publicBucket) ||
      publicBucket === services.bucket ||
      process.env.JB_PUBLIC_THUMBNAIL_ORIGIN !== "https://assets.jb-premium-hub.vip") {
    return { url: LOGO_COVER, saved: false };
  }
  const expectedKey = previewKey(admin.id, row.id);
  if (row.preview_key !== expectedKey || !row.preview_uploaded_at) {
    return { url: LOGO_COVER, saved: false };
  }

  try {
    const info = await services.r2.send(new HeadObjectCommand({
      Bucket: services.bucket, Key: expectedKey,
    }));
    if (!Number.isSafeInteger(Number(info.ContentLength)) ||
        Number(info.ContentLength) < 1 ||
        Number(info.ContentLength) > MAX_PREVIEW_BYTES ||
        info.ContentType !== PREVIEW_MIME) {
      return { url: LOGO_COVER, saved: false };
    }
    const object = await services.r2.send(new GetObjectCommand({
      Bucket: services.bucket, Key: expectedKey,
    }));
    if (!object.Body) return { url: LOGO_COVER, saved: false };
    const publishedKey = "thumbnails/published/" + row.id + ".jpg";
    await services.r2.send(new PutObjectCommand({
      Bucket: publicBucket, Key: publishedKey, Body: object.Body,
      ContentType: PREVIEW_MIME, ContentLength: Number(info.ContentLength),
      CacheControl: "public, max-age=3600",
    }));
    const uploaded = await services.r2.send(new HeadObjectCommand({
      Bucket: publicBucket, Key: publishedKey,
    }));
    if (Number(uploaded.ContentLength) !== Number(info.ContentLength)) {
      return { url: LOGO_COVER, saved: false };
    }
    return { url: PUBLISHED_COVER_PREFIX + row.id + ".jpg", saved: true };
  } catch (error) {
    console.error("Admin publication cover copy failed:", error?.name || "unknown");
    return { url: LOGO_COVER, saved: false };
  }
}

async function publishReviewed(req, res, services, admin) {
  const { draftId, rightsConfirmed, duplicateAcknowledged } = req.body || {};
  if (!UUID.test(String(draftId || ""))) return fail(res, 400, "Invalid staged media ID.");
  if (rightsConfirmed !== true) {
    return fail(res, 400, "Confirm that you have permission to publish this video.");
  }

  const { data: row, error: readError } = await services.supabase
    .from("jb_media_upload_staging")
    .select("id, created_by, status, storage_key, size_bytes, mime_type, uploaded_at, preview_key, preview_uploaded_at, original_filename, album_id")
    .eq("id", draftId).eq("created_by", admin.id).maybeSingle();
  if (readError || !row) return fail(res, 404, "Staged video not found.");
  if (
    row.status !== "pending_review" || !row.uploaded_at ||
    row.storage_key !== "staging/" + admin.id + "/" + draftId + ".mp4" ||
    row.mime_type !== "video/mp4" ||
    Number(row.size_bytes) <= 0
  ) return fail(res, 409, "Staged video is not eligible for publication.");

  const { data: linked, error: linkError } = await services.supabase
    .from("jb_media_publication_links")
    .select("media_id").eq("staging_id", draftId).maybeSingle();
  if (linkError) return fail(res, 503, "Could not check existing publication.");
  if (linked?.media_id) {
    return res.status(200).json({ published: true, mediaId: linked.media_id, alreadyPublished: true });
  }

  // Duplicate-name attestation applies even to abandoned draft attempts.
  const { data: duplicates, error: duplicateError } = await services.supabase
    .from("jb_media_upload_staging")
    .select("id")
    .eq("created_by", admin.id)
    .eq("original_filename", row.original_filename)
    .neq("id", draftId)
    .limit(1);
  if (duplicateError) return fail(res, 503, "Could not verify duplicate uploads.");
  if (duplicates?.length && duplicateAcknowledged !== true) {
    return fail(res, 409, "Another draft has the same filename. Confirm the duplicate before publishing.");
  }

  // HEAD check must precede publication. Never rely only on the database row.
  let head;
  try {
    head = await services.r2.send(new HeadObjectCommand({
      Bucket: services.bucket, Key: row.storage_key,
    }));
  } catch {
    return fail(res, 409, "Private video object is not available.");
  }
  if (
    Number(head.ContentLength) !== Number(row.size_bytes) ||
    (head.ContentType && head.ContentType !== "video/mp4")
  ) return fail(res, 409, "Private video verification failed.");

  // Optional public thumbnail copy is fail-closed and falls back to the JB logo.
  const cover = await publishCoverIfAvailable(services, admin, row);
  const { data, error } = await services.supabase.rpc("jb_publish_staged_media_v1", {
    p_staging_id: draftId,
    p_publisher_id: admin.id,
    p_thumbnail_url: cover.url,
  });
  if (error) {
    console.error("Trusted video publication failed:", error.code || "unknown");
    return fail(res, 409, "Publication was rejected. Verify album visibility and staging permissions.");
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.media_id) return fail(res, 503, "Could not confirm published media.");
  return res.status(200).json({
    published: true, mediaId: result.media_id,
    alreadyPublished: result.was_created === false,
    thumbnailSavedToPublic: cover.saved,
  });
}


/**
 * Phase 343: Delete selected PUBLISHED media from the member library.
 * The RPC atomically removes media rows, links and staging rows and writes
 * permanent audit records. This API then attempts verified private R2 cleanup.
 * Never accepts paths, URLs, or private media keys from the browser.
 */
async function deletePublishedMedia(req, res, services, admin) {
  const ids = req.body?.mediaIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 10 ||
      ids.some((id) => typeof id !== "string" || !UUID.test(id)) ||
      new Set(ids).size !== ids.length) {
    return fail(res, 400, "Select between 1 and 10 unique published media records.");
  }
  if (req.body?.confirmDeletion !== true) {
    return fail(res, 400, "Deletion confirmation required.");
  }

  const { data, error } = await services.supabase.rpc("jb_admin_delete_published_media_v1", {
    p_media_ids: ids,
    p_admin_id: admin.id,
  });
  if (error) {
    console.error("Atomic admin media delete rejected:", error?.code || "UNKNOWN");
    return fail(res, 409, "Media deletion rejected. Refresh the library and verify all selected items.");
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length !== ids.length || !rows.every((row) => ids.includes(row.deleted_media_id))) {
    console.error("Unexpected admin media delete RPC confirmation count.");
    return fail(res, 503, "Database deletion confirmation incomplete. Refresh the library.");
  }

  const cleanupPending = [];
  const legacyStorageUnchanged = [];
  for (const row of rows) {
    if (!row.private_video_key) {
      // Legacy/external CDN objects are not owned by the private R2 staging
      // store and must not be deleted by guessing a path.
      legacyStorageUnchanged.push(row.deleted_media_id);
      continue;
    }
    const keys = [row.private_video_key, row.private_thumbnail_key].filter(Boolean);
    let allCleared = true;
    for (const key of keys) {
      try {
        await services.r2.send(new DeleteObjectCommand({
          Bucket: services.bucket, Key: key,
        }));
      } catch (error) {
        allCleared = false;
        console.error("Published private media R2 delete pending:", error?.name || "UNKNOWN");
      }
    }
    const { error: auditError } = await services.supabase
      .from("jb_admin_media_delete_audit")
      .update({
        cleanup_status: allCleared ? "complete" : "pending",
        cleanup_updated_at: new Date().toISOString(),
        cleanup_error: allCleared ? null : "R2 delete could not be confirmed. Retry operational cleanup.",
      })
      .eq("media_id", row.deleted_media_id)
      .eq("deleted_by", admin.id);
    if (!allCleared || auditError) {
      cleanupPending.push(row.deleted_media_id);
      if (auditError) console.error("Media deletion audit update failed:", auditError.code || "UNKNOWN");
    }
  }
  return res.status(200).json({
    deleted: rows.map((row) => row.deleted_media_id),
    cleanupPending,
    legacyStorageUnchanged,
  });
}


/**
 * Phase 346 — READ ONLY Cloudflare R2 inventory vs the authoritative database.
 * This deliberately NEVER deletes objects and NEVER interprets untracked
 * objects as safe to delete. Results are "suspected orphan" only.
 * Only fixed prefixes in the two known JB R2 buckets can be scanned.
 */
async function loadAllAuditReferences(client, table, columns, maxRows = 20000) {
  const results = [];
  const pageSize = 500;
  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    const { data, error } = await client
      .from(table).select(columns)
      .order(table === "jb_media_publication_links" ? "staging_id" : "id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error || !Array.isArray(data)) {
      throw new Error("Reference list unavailable: " + table);
    }
    results.push(...data);
    if (results.length > maxRows) {
      throw new Error("Reference list too large to audit safely: " + table);
    }
    if (data.length < pageSize) return results;
  }
  throw new Error("Reference list incomplete: " + table);
}

async function scanR2Orphans(req, res, services, admin) {
  const scope = req.body?.scope;
  const scopes = {
    private_video: { bucket: services.bucket, prefix: "staging/" },
    private_thumbnail: { bucket: services.bucket, prefix: "staging-thumbnails/" },
  };
  const publicBucket = String(process.env.JB_PUBLIC_THUMBNAIL_R2_BUCKET_NAME || "").trim();
  if (publicBucket && /^[a-z0-9][a-z0-9._-]{1,62}$/.test(publicBucket) &&
      publicBucket !== services.bucket &&
      process.env.JB_PUBLIC_THUMBNAIL_ORIGIN === "https://assets.jb-premium-hub.vip") {
    scopes.public_thumbnail = { bucket: publicBucket, prefix: "thumbnails/published/" };
  }
  if (!Object.hasOwn(scopes, scope)) {
    return fail(res, 400, "Unknown or unconfigured R2 audit scope.");
  }
  const cursor = req.body?.cursor;
  if (cursor !== undefined &&
      (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 4096)) {
    return fail(res, 400, "Invalid object page cursor.");
  }
  // Never accept a bucket or prefix from the client.
  const target = scopes[scope];
  const protectedKeys = new Set();
  try {
    const [drafts, media, links] = await Promise.all([
      loadAllAuditReferences(services.supabase, "jb_media_upload_staging",
        "id,storage_key,preview_key"),
      loadAllAuditReferences(services.supabase, "media",
        "media_url,thumbnail_url"),
      loadAllAuditReferences(services.supabase, "jb_media_publication_links",
        "staging_id"),
    ]);
    for (const row of drafts) {
      if (typeof row.storage_key === "string") protectedKeys.add(row.storage_key);
      if (typeof row.preview_key === "string") protectedKeys.add(row.preview_key);
    }
    for (const row of media) {
      const url = String(row.media_url || "");
      const keyPrefix = "r2://" + services.bucket + "/";
      if (url.startsWith(keyPrefix)) protectedKeys.add(url.slice(keyPrefix.length));
      const cover = String(row.thumbnail_url || "");
      const coverPrefix = "https://assets.jb-premium-hub.vip/";
      if (cover.startsWith(coverPrefix)) {
        const urlPath = cover.slice(coverPrefix.length).split(/[?#]/, 1)[0];
        if (urlPath.startsWith("thumbnails/published/")) {
          protectedKeys.add(urlPath);
        }
      }
    }
    // Protect linked published thumbnails even if the current media cover URL
    // uses a logo fallback or proxy.
    for (const link of links) {
      if (UUID.test(String(link.staging_id || ""))) {
        protectedKeys.add("thumbnails/published/" + link.staging_id + ".jpg");
      }
    }
  } catch (error) {
    console.error("R2 audit reference read failed:", error?.message || "unknown");
    return fail(res, 503, "Database reference scan incomplete; no orphan classification attempted.");
  }

  let objects;
  try {
    objects = await services.r2.send(new ListObjectsV2Command({
      Bucket: target.bucket,
      Prefix: target.prefix,
      MaxKeys: 200,
      ...(cursor ? { ContinuationToken: cursor } : {}),
    }));
  } catch (error) {
    console.error("R2 audit list permission/unavailability:", error?.name || "unknown");
    return fail(res, 503, "Unable to list R2 objects. Verify bucket listing permissions.");
  }
  const listed = Array.isArray(objects.Contents) ? objects.Contents : [];
  let referenced = 0, recentProtected = 0, suspicious = 0, candidateBytes = 0;
  const samples = [];
  const ageThreshold = Date.now() - 72 * 60 * 60 * 1000;
  for (const obj of listed) {
    const key = obj.Key;
    if (!key || !key.startsWith(target.prefix) || key.endsWith("/")) continue;
    if (protectedKeys.has(key)) {
      referenced++;
      continue;
    }
    const timestamp = obj.LastModified ? new Date(obj.LastModified).getTime() : NaN;
    // Unknown age and newly uploaded files are NEVER orphan candidates.
    if (!Number.isFinite(timestamp) || timestamp > ageThreshold) {
      recentProtected++;
      continue;
    }
    suspicious++;
    candidateBytes += Math.max(0, Number(obj.Size) || 0);
    if (samples.length < 20) {
      samples.push({
        key,
        bytes: Math.max(0, Number(obj.Size) || 0),
        lastModified: new Date(timestamp).toISOString(),
      });
    }
  }
  const continuation = objects.IsTruncated ? objects.NextContinuationToken : null;
  if (objects.IsTruncated && !continuation) {
    return fail(res, 503, "R2 listing incomplete; no reliable scan continuation.");
  }
  return res.status(200).json({
    readOnly: true,
    classification: "suspected_not_safe_to_delete",
    scope,
    bucket: target.bucket,
    prefix: target.prefix,
    scannedObjects: listed.length,
    referenced,
    recentProtected,
    suspectedOrphans: suspicious,
    suspectedBytes: candidateBytes,
    samples,
    hasMore: Boolean(continuation),
    nextCursor: continuation || null,
    ageThresholdHours: 72,
    disclaimer: "Inventory report only; object ownership, recent uploads, legacy URLs and CDN usage must be reviewed before deletion.",
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
    if (req.body?.action === "thumbnail-begin") return await thumbnailBegin(req, res, services, admin);
    if (req.body?.action === "thumbnail-complete") return await thumbnailComplete(req, res, services, admin);
    if (req.body?.action === "thumbnail-previews") return await thumbnailPreviews(req, res, services, admin);
    if (req.body?.action === "review-list") return await reviewList(req, res, services, admin);
    if (req.body?.action === "queue-list") return await queueList(req, res, services, admin);
    if (req.body?.action === "delete-unpublished") return await deleteUnpublished(req, res, services, admin);
    if (req.body?.action === "delete-published-media") return await deletePublishedMedia(req, res, services, admin);
    if (req.body?.action === "orphan-audit") return await scanR2Orphans(req, res, services, admin);
    if (req.body?.action === "review-video") return await reviewVideo(req, res, services, admin);
    if (req.body?.action === "publish") return await publishReviewed(req, res, services, admin);
    return fail(res, 400, "Unknown staging action.");
  } catch (error) {
    console.error("Private staging request failed:", error?.name || "unknown");
    return fail(res, 500, "Private staging request failed.");
  }
}
