/**
 * JB Premium Hub — Phase 317G reviewed thumbnail batch publisher (25-50).
 *
 * --prepare --offset=5 --limit=25
 *     Read-only audit of exactly matched local previews; creates review HTML
 *     and a JSON checklist with ALL approval flags false. No network calls.
 * --approve --offset=5 --limit=25 --confirm-reviewed=I_REVIEWED_THE_IMAGES
 *     Marks all NON-short JPGs approved after deliberate visual review. Local only.
 * --publish --offset=5 --limit=25 --confirm-public-upload=I_APPROVE_PUBLICATION
 *     Validates matching and hashes AGAIN; uploads verified JPGs to dedicated
 *     PUBLIC-ASSETS R2; checks R2 and public URL bytes. Produces guarded
 *     manual SQL; does NOT change Supabase itself.
 *
 * Requires persistent local Phase 317D folder, 4647-record matching report,
 * progress.json, and five successful Phase 317F pilot publishing receipts.
 */
import { readFile, writeFile, stat, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import {
  S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand,
} from "@aws-sdk/client-s3";
import {
  SOURCE_BUCKET, PUBLIC_BUCKET, PUBLIC_ORIGIN, FIRST_PUBLISHED,
  selectBatch, batchName, hash, createGuardedSql,
} from "./publish-batch-rules.mjs";

const root = path.resolve(
  process.env.JB_THUMBNAIL_OUTPUT_DIR ||
    path.join(".local", "thumbnail-batch-317d")
);
const reportPath = path.join(root, "media-r2-matching-audit.json");
const progressPath = path.join(root, "progress.json");
const pilotReceipt = path.join(root, "phase317f-five-published.json");
const offsetOption = process.argv.find((a) => a.startsWith("--offset="));
const limitOption = process.argv.find((a) => a.startsWith("--limit="));
const offset = Number(offsetOption?.slice(9) ?? "5");
const limit = Number(limitOption?.slice(8) ?? "25");
const stem = batchName(offset, limit);
const checklistPath = path.join(root, stem + "-approval.json");
const galleryPath = path.join(root, stem + "-review.html");
const receiptsPath = path.join(root, stem + "-receipt.json");
const sqlPath = path.join(root, stem + "-apply.sql");
const flag = (name) => process.argv.includes(name);
const mode = [flag("--prepare"), flag("--approve"), flag("--publish")].filter(Boolean);
const imagePath = (filename) => path.join(root, filename);

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
}
async function atomicJson(file, value) {
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, file);
}
async function jpeg(file) {
  const data = await readFile(file);
  const n = data.length;
  if (n < 1024 || n > 3 * 1024 * 1024 || data[0] !== 0xff ||
      data[1] !== 0xd8 || data[2] !== 0xff ||
      data[n - 2] !== 0xff || data[n - 1] !== 0xd9) {
    throw new Error("Generated JPEG is missing, corrupt, or unexpectedly large.");
  }
  return { data, size: n, sha256: hash(data) };
}
function htmlEscape(x) {
  return String(x).replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]
  );
}

async function expectedItems() {
  const [report, progress, pilot] = await Promise.all([
    readJson(reportPath), readJson(progressPath), readJson(pilotReceipt),
  ]);
  const selection = selectBatch(report, pilot, { offset, limit });
  if (!progress || progress.bucket !== SOURCE_BUCKET || !progress.results) {
    throw new Error("The local generation progress report is missing or wrong-bucket.");
  }
  const images = [], skipped = [];
  for (let i = 0; i < selection.selected.length; i++) {
    const item = selection.selected[i];
    const digest = hash(item.key).slice(0, 16);
    const record = progress.results[digest];
    if (!record || record.private_video_key !== item.key ||
        record.media_id !== item.media_id) {
      throw new Error("Missing exact video-ID mapping for eligible batch index " + (offset+i) +
        ". Run --generate --matched for this range first.");
    }
    if (record.status === "SKIPPED_SHORT") {
      skipped.push({
        media_id: item.media_id,
        status: "SKIPPED_SHORT",
      });
      continue;
    }
    if (record.status !== "REVIEW_REQUIRED" ||
        record.filename !== "preview-" + digest + ".jpg") {
      throw new Error("Expected a completed local thumbnail for matched index " +
        (offset+i) + ". Run the matched generator first.");
    }
    const { size, sha256 } = await jpeg(imagePath(record.filename));
    const matched = report.matched.find((row) => row.media_id === item.media_id);
    if (!matched || matched.object_key !== item.key ||
        matched.thumbnail_status !== item.source_status ||
        !["missing", "default_logo"].includes(item.source_status)) {
      throw new Error("Unapproved or mismatched existing thumbnail status.");
    }
    const key = "thumbnails/auto/317g/" + item.media_id + "-" + sha256.slice(0,16) + ".jpg";
    images.push({
      media_id: item.media_id,
      private_video_key: item.key,
      original_source_host: matched.source_host,
      previous_thumbnail_status: item.source_status,
      filename: record.filename,
      file_size: size,
      file_sha256: sha256,
      public_key: key,
      public_url: PUBLIC_ORIGIN + "/" + key,
    });
  }
  if (images.length + skipped.length !== limit) {
    throw new Error("Unexpected number of processed records in the batch.");
  }
  if (!images.length) {
    throw new Error("All videos in this batch are too short; no JPGs to publish.");
  }
  return { images, skipped, selection };
}

function manifestRecord(expected, approved=false) {
  return {
    phase: "317G",
    batch: stem,
    offset,
    limit,
    source_bucket: SOURCE_BUCKET,
    target_bucket: PUBLIC_BUCKET,
    items: expected.images.map(item => ({...item, approved })),
    skipped: expected.skipped,
  };
}
function validateChecklist(checklist, expected, requireApproval) {
  if (!checklist || checklist.phase !== "317G" ||
      checklist.batch !== stem || checklist.offset !== offset ||
      checklist.limit !== limit ||
      checklist.source_bucket !== SOURCE_BUCKET ||
      checklist.target_bucket !== PUBLIC_BUCKET ||
      !Array.isArray(checklist.items) ||
      checklist.items.length !== expected.images.length ||
      !Array.isArray(checklist.skipped) ||
      checklist.skipped.length !== expected.skipped.length) {
    throw new Error("Approval file mismatched or unexpectedly modified.");
  }
  const keys = [
    "media_id","private_video_key","original_source_host",
    "previous_thumbnail_status","filename","file_size",
    "file_sha256","public_key","public_url"
  ];
  for (let i = 0; i < expected.images.length; i++) {
    const row = checklist.items[i], current = expected.images[i];
    for (const key of keys) {
      if (row[key] !== current[key]) {
        throw new Error("Image or mapping changed since approval checklist creation.");
      }
    }
    if (typeof row.approved !== "boolean" ||
        (requireApproval && row.approved !== true)) {
      throw new Error("One or more images were not explicitly approved.");
    }
  }
  for (let i = 0; i < expected.skipped.length; i++) {
    if (checklist.skipped[i]?.media_id !== expected.skipped[i].media_id ||
        checklist.skipped[i]?.status !== "SKIPPED_SHORT") {
      throw new Error("Short-video skip list changed.");
    }
  }
}

async function prepare(expected) {
  if (await exists(checklistPath)) {
    const existing = await readJson(checklistPath);
    validateChecklist(existing, expected, false);
    console.log("Existing checklist preserved:", checklistPath);
  } else {
    await atomicJson(checklistPath, manifestRecord(expected));
    console.log("New checklist created with all approval flags false.");
  }
  // Static local review gallery, no network requests or executable scripts.
  const cards = expected.images.map((item, i) =>
    '<article><img loading="lazy" src="' + encodeURIComponent(item.filename) +
    '" alt="Local preview ' + (i+1) + '"><p><b>' + (i+1) +
    ".</b> " + htmlEscape(item.filename) +
    "</p><small>Video ID: " + htmlEscape(item.media_id) + "</small></article>"
  ).join("\n");
  const html = '<!doctype html><html lang="en"><meta charset="utf-8">' +
    '<title>317G Local Thumbnail Review</title><style>' +
    'body{font:14px system-ui;background:#111827;color:#f9fafb;margin:24px}' +
    'h1{font-size:22px}p{line-height:1.6}.grid{display:grid;grid-template-columns:' +
    'repeat(auto-fill,minmax(280px,1fr));gap:20px}article{border:1px solid #374151;' +
    'padding:12px;border-radius:10px;background:#1f2937}img{width:100%;aspect-ratio:' +
    '16/9;object-fit:contain;background:#000}small{color:#cbd5e1;word-break:break-all}' +
    '</style><h1>Phase 317G — Private Review: ' + htmlEscape(stem) + '</h1>' +
    '<p>Review each of ' + expected.images.length + ' JPGs. ' +
    expected.skipped.length + ' short video(s) skipped. ' +
    'No images have been published by preparing this review.</p>' +
    '<section class="grid">' + cards + '</section></html>';
  await writeFile(galleryPath, html, { mode: 0o600 });
  console.log("Review gallery:", galleryPath);
  console.log("Approval checklist:", checklistPath);
  console.log("Ready JPGs:", expected.images.length,
    "| short/default-logo only:", expected.skipped.length);
  console.log("No public R2 uploads or Supabase changes.");
}

async function approve(expected) {
  if (!flag("--confirm-reviewed=I_REVIEWED_THE_IMAGES")) {
    throw new Error("First open the review gallery, then explicitly pass --confirm-reviewed=I_REVIEWED_THE_IMAGES.");
  }
  const manifest = await readJson(checklistPath);
  validateChecklist(manifest, expected, false);
  for (const item of manifest.items) item.approved = true;
  await atomicJson(checklistPath, manifest);
  console.log("Locally approved", manifest.items.length, "reviewed JPGs.");
  console.log("No public R2 uploads or Supabase changes.");
}

function publicClient() {
  const {
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
    JB_PUBLIC_R2_ACCESS_KEY_ID, JB_PUBLIC_R2_SECRET_ACCESS_KEY
  } = process.env;
  if (!R2_ACCOUNT_ID || !JB_PUBLIC_R2_ACCESS_KEY_ID ||
      !JB_PUBLIC_R2_SECRET_ACCESS_KEY) {
    throw new Error("Dedicated public-assets R2 credentials are missing.");
  }
  if (JB_PUBLIC_R2_ACCESS_KEY_ID === R2_ACCESS_KEY_ID ||
      JB_PUBLIC_R2_SECRET_ACCESS_KEY === R2_SECRET_ACCESS_KEY) {
    throw new Error("Publisher token must differ from private-video R2 credentials.");
  }
  return new S3Client({
    region: "auto",
    endpoint: "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
    credentials: {
      accessKeyId: JB_PUBLIC_R2_ACCESS_KEY_ID,
      secretAccessKey: JB_PUBLIC_R2_SECRET_ACCESS_KEY
    },
    forcePathStyle: true,
    maxAttempts: 3,
  });
}

async function uploadVerified(client, item) {
  const file = await jpeg(imagePath(item.filename));
  if (file.sha256 !== item.file_sha256 || file.size !== item.file_size) {
    throw new Error("Local image changed after approval: " + item.filename);
  }
  let existsAtR2 = false;
  try {
    const head = await client.send(new HeadObjectCommand({
      Bucket: PUBLIC_BUCKET, Key: item.public_key,
    }));
    existsAtR2 = true;
    if (Number(head.ContentLength) !== file.size ||
        head.Metadata?.sha256 !== file.sha256 ||
        head.Metadata?.["media-id"] !== item.media_id) {
      throw new Error("Existing public object differs from the approved image.");
    }
  } catch (err) {
    if (existsAtR2) throw err;
    if (err?.$metadata?.httpStatusCode !== 404 &&
        !["NotFound","NoSuchKey"].includes(err?.name)) {
      throw new Error("Could not verify public R2 key. Check publisher permissions.");
    }
    await client.send(new PutObjectCommand({
      Bucket: PUBLIC_BUCKET, Key: item.public_key,
      Body: file.data,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=86400",
      Metadata: { sha256: file.sha256, "media-id": item.media_id },
      IfNoneMatch: "*",
    }));
  }
  const stored = await client.send(new GetObjectCommand({
    Bucket: PUBLIC_BUCKET, Key: item.public_key,
  }));
  const bytes = Buffer.from(await stored.Body.transformToByteArray());
  if (bytes.length !== file.size || hash(bytes) !== file.sha256) {
    throw new Error("Uploaded public R2 object failed SHA256 verification.");
  }

  const publicResponse = await fetch(
    item.public_url + "?verify=" + file.sha256.slice(0,12),
    {
      signal: AbortSignal.timeout(20000),
      headers: { "Cache-Control": "no-cache" },
      redirect: "error",
    }
  );
  if (!publicResponse.ok) {
    throw new Error("Public URL is not ready (HTTP " + publicResponse.status + ").");
  }
  const publicBytes = Buffer.from(await publicResponse.arrayBuffer());
  if (publicBytes.length !== file.size || hash(publicBytes) !== file.sha256) {
    throw new Error("Public URL returned a different image than the approved JPG.");
  }
}

async function publish(expected) {
  if (!flag("--confirm-public-upload=I_APPROVE_PUBLICATION")) {
    throw new Error("Explicit --confirm-public-upload=I_APPROVE_PUBLICATION required.");
  }
  const manifest = await readJson(checklistPath);
  validateChecklist(manifest, expected, true);

  let previous;
  if (await exists(receiptsPath)) {
    previous = await readJson(receiptsPath);
    if (previous.batch !== stem || !Array.isArray(previous.verified)) {
      throw new Error("Existing upload receipt is inconsistent with this batch.");
    }
  }
  const receipts = previous || { phase: "317G", batch: stem,
    source_bucket: SOURCE_BUCKET, target_bucket: PUBLIC_BUCKET,
    verified: [], database_updated: false };
  const client = publicClient();
  try {
    for (const [i, item] of expected.images.entries()) {
      // Always verify the remote bytes, even on an interrupted/resumed upload.
      await uploadVerified(client, item);
      const old = receipts.verified.find(x => x.media_id === item.media_id);
      if (old && (old.public_url !== item.public_url ||
          old.sha256 !== item.file_sha256)) {
        throw new Error("Existing upload receipt conflicts with the selected image.");
      }
      if (!old) {
        receipts.verified.push({
          media_id: item.media_id, public_url: item.public_url, sha256: item.file_sha256
        });
      }
      receipts.last_verified_at = new Date().toISOString();
      await atomicJson(receiptsPath, receipts);
      console.log("Verified PUBLIC thumbnail", i+1, "/", expected.images.length);
    }
  } finally {
    client.destroy();
  }
  if (receipts.verified.length !== expected.images.length ||
      expected.images.some(x => !receipts.verified.some(v =>
        v.media_id === x.media_id && v.public_url === x.public_url &&
        v.sha256 === x.file_sha256))) {
    throw new Error("Not all approved public thumbnail images were verified.");
  }
  const sql = createGuardedSql(expected.images);
  await writeFile(sqlPath, sql, { mode: 0o600 });
  console.log("Public JPGs verified:", expected.images.length);
  console.log("SKIPPED_SHORT (default logo remains):", expected.skipped.length);
  console.log("Manual guarded SQL generated:", sqlPath);
  console.log("No Supabase database changes were made by this script.");
}

async function main() {
  if (mode.length !== 1) {
    throw new Error("Choose exactly one action: --prepare, --approve or --publish.");
  }
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(limit) ||
      offset < FIRST_PUBLISHED || limit < 1 || limit > 50) {
    throw new Error("Invalid batch offset/limit. Use --offset=5 --limit=25 for the next batch.");
  }
  console.log("JB PREMIUM HUB / PHASE 317G / REVIEWED THUMBNAIL BATCH");
  console.log("Batch", stem, "=> eligible offsets", offset, "through", offset+limit-1);
  const expected = await expectedItems();
  if (flag("--prepare")) await prepare(expected);
  if (flag("--approve")) await approve(expected);
  if (flag("--publish")) await publish(expected);
}
main().catch(err => {
  // Never log SDK credential values or private signed URLs.
  console.error("Phase 317G STOPPED:", err?.message || "Unknown error.");
  process.exitCode = 1;
});
