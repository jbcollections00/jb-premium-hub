/**
 * JB Premium Hub Phase 317F: first FIVE thumbnails safe-publishing workflow.
 *
 * --prepare: inspect local match/progress report and create review checklist.
 * --publish --confirm-public-upload=I_REVIEWED_5_IMAGES:
 *   ONLY for all FIVE manually approved, unchanged JPGs, copy to public-assets R2,
 *   verify stored contents AND public URL, and write guarded SQL for human execution.
 *
 * No direct Supabase database connection or mutation.
 * No private video download, no private URL logging.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, stat, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand,
} from "@aws-sdk/client-s3";
import { prepareMatchedQueue } from "./matched-queue.mjs";

const ROOT = path.resolve(
  process.env.JB_THUMBNAIL_OUTPUT_DIR || path.join(".local", "thumbnail-batch-317d")
);
const REPORT = path.join(ROOT, "media-r2-matching-audit.json");
const PROGRESS = path.join(ROOT, "progress.json");
const APPROVAL = path.join(ROOT, "phase317f-five-approval.json");
const SQL_FILE = path.join(ROOT, "phase317f-five-apply.sql");
const DONE_FILE = path.join(ROOT, "phase317f-five-published.json");
const SOURCE_BUCKET = process.env.JB_THUMBNAIL_SOURCE_BUCKET || "jb-collections-hub";
const PUBLIC_BUCKET = "jb-collections-public-assets";
const PUBLIC_ORIGIN = "https://assets.jb-premium-hub.vip";
const DEFAULT_LOGO = PUBLIC_ORIGIN + "/thumbnails/logo_JBCollections.png";
const SAMPLE_COUNT = 5;
const EXPECTED_TOTAL = 4647;
const EXPLICIT_CONFIRMATION = "I_REVIEWED_5_IMAGES";
const modePrepare = process.argv.includes("--prepare");
const modePublish = process.argv.includes("--publish");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function readJson(file) {
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw);
}
async function writeJsonAtomic(file, value) {
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, file);
}
async function exists(file) {
  try { return (await stat(file)).isFile(); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
async function validatedJpeg(file) {
  const data = await readFile(file);
  if (data.length < 1024 || data.length > 3 * 1024 * 1024 ||
      data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff ||
      data[data.length - 2] !== 0xff || data[data.length - 1] !== 0xd9) {
    throw new Error("Invalid, oversized, or incomplete local JPEG: " + path.basename(file));
  }
  return { data, hash: sha256(data), size: data.length };
}

async function expectedFive() {
  const [report, progress] = await Promise.all([readJson(REPORT), readJson(PROGRESS)]);
  const queue = prepareMatchedQueue(report, SOURCE_BUCKET, EXPECTED_TOTAL);
  if (queue.selected.length !== 3646 || queue.preserved !== 1001) {
    throw new Error("Expected 3,646 eligible / 1,001 preserved. Run full matching audit again.");
  }
  if (!progress || progress.bucket !== SOURCE_BUCKET || !progress.results) {
    throw new Error("Missing or incorrect source-bucket local progress.");
  }
  const selected = queue.selected.slice(0, SAMPLE_COUNT);
  if (selected.length !== SAMPLE_COUNT) throw new Error("Insufficient eligible records.");

  const five = [];
  for (const item of selected) {
    const digest = sha256(item.key).slice(0, 16);
    const previous = progress.results[digest];
    const filename = "preview-" + digest + ".jpg";
    if (!previous ||
        previous.status !== "REVIEW_REQUIRED" ||
        previous.private_video_key !== item.key ||
        previous.media_id !== item.media_id ||
        previous.filename !== filename) {
      throw new Error("Missing exact generated preview for the selected five. Run matched batch 0-4 first.");
    }
    const jpeg = await validatedJpeg(path.join(ROOT, filename));
    const reportMatch = report.matched.find((r) => r.media_id === item.media_id);
    if (!reportMatch || reportMatch.object_key !== item.key ||
        reportMatch.thumbnail_status !== item.source_status ||
        !["missing","default_logo"].includes(item.source_status)) {
      throw new Error("Matching report changed or a custom thumbnail is already assigned.");
    }
    const publicKey = "thumbnails/auto/317f/" + item.media_id + "-" + jpeg.hash.slice(0,16) + ".jpg";
    five.push({
      media_id: item.media_id,
      private_video_key: item.key,
      original_source_host: reportMatch.source_host,
      previous_thumbnail_status: item.source_status,
      filename,
      file_sha256: jpeg.hash,
      file_size: jpeg.size,
      public_key: publicKey,
      public_url: PUBLIC_ORIGIN + "/" + publicKey,
    });
  }
  return five;
}

function sameFive(approval, expected) {
  if (!approval || approval.phase !== "317F-5" ||
      approval.source_bucket !== SOURCE_BUCKET ||
      approval.public_bucket !== PUBLIC_BUCKET ||
      !Array.isArray(approval.items) ||
      approval.items.length !== SAMPLE_COUNT) {
    throw new Error("Invalid or wrong-bucket approval checklist.");
  }
  const fields = [
    "media_id", "private_video_key", "original_source_host",
    "previous_thumbnail_status", "filename", "file_sha256",
    "file_size", "public_key", "public_url"
  ];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const candidate = approval.items[i], expectedItem = expected[i];
    for (const field of fields) {
      if (candidate[field] !== expectedItem[field]) {
        throw new Error("Approval checklist no longer matches local source files/report.");
      }
    }
    if (candidate.approved !== true) {
      throw new Error("Review all five JPGs and set approved=true for each; none were uploaded.");
    }
  }
}

function s(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}
function guardedSql(items) {
  const rows = items.map((x) => (
    "    (" + [x.media_id, x.private_video_key, x.original_source_host,
      x.previous_thumbnail_status, x.public_url].map(s).join(", ") + ")"
  )).join(",\n");
  return [
    "-- Phase 317F: RUN MANUALLY in Supabase SQL Editor only after verifying 5 public images.",
    "-- All-or-nothing, exact media.id + current media_url source host/key + previous thumbnail status.",
    "-- Does NOT change media_url, privileges, downloads, or subscription access.",
    "BEGIN;",
    "DO $publish$",
    "DECLARE changed_count integer;",
    "BEGIN",
    "  UPDATE public.media AS m",
    "  SET thumbnail_url = v.new_url",
    "  FROM (VALUES",
    rows,
    "  ) AS v(media_id, expected_key, expected_host, expected_thumbnail_status, new_url)",
    "  WHERE m.id = v.media_id::uuid",
    "    AND m.type = 'video'",
    "    AND LOWER(SPLIT_PART(SPLIT_PART(m.media_url, '://', 2), '/', 1)) = v.expected_host",
    "    AND REGEXP_REPLACE(",
    "      SPLIT_PART(SPLIT_PART(m.media_url, '?', 1), '#', 1),",
    "      '^https?://[^/]+/?', '', 'i'",
    "    ) = v.expected_key",
    "    AND (",
    "      (v.expected_thumbnail_status = 'missing' AND",
    "       (m.thumbnail_url IS NULL OR BTRIM(m.thumbnail_url) = ''))",
    "      OR",
    "      (v.expected_thumbnail_status = 'default_logo' AND",
    "       BTRIM(m.thumbnail_url) = " + s(DEFAULT_LOGO) + ")",
    "    );",
    "  GET DIAGNOSTICS changed_count = ROW_COUNT;",
    "  IF changed_count <> " + SAMPLE_COUNT + " THEN",
    "    RAISE EXCEPTION 'Thumbnail update aborted: expected 5 matching rows, got %', changed_count;",
    "  END IF;",
    "END",
    "$publish$;",
    "COMMIT;",
    "",
    "-- Verify separately using SELECT id, thumbnail_url FROM public.media",
    "-- WHERE id IN (" + items.map((x) => s(x.media_id) + "::uuid").join(", ") + ");",
    ""
  ].join("\n");
}

async function makeApproval() {
  const expected = await expectedFive();
  if (await exists(APPROVAL)) {
    throw new Error("Approval checklist already exists. Review it; not overwritten.");
  }
  const checklist = {
    phase: "317F-5",
    source_bucket: SOURCE_BUCKET,
    public_bucket: PUBLIC_BUCKET,
    instructions: "Open and inspect ALL five JPGs locally. Mark approved=true ONLY for safe, intended public thumbnails. No automatic approval.",
    items: expected.map((item) => ({ ...item, approved: false })),
  };
  await mkdir(ROOT, { recursive: true });
  await writeJsonAtomic(APPROVAL, checklist);
  console.log("Created PRIVATE approval checklist:", APPROVAL);
  console.log("All 5 approval flags are FALSE. NOTHING uploaded or changed.");
  console.log("Open these files locally for visual review:");
  expected.forEach((item, i) => console.log(i + 1, item.filename));
}

function publicClient() {
  const account = process.env.R2_ACCOUNT_ID;
  const key = process.env.JB_PUBLIC_R2_ACCESS_KEY_ID;
  const secret = process.env.JB_PUBLIC_R2_SECRET_ACCESS_KEY;
  if (!account || !key || !secret) {
    throw new Error(
      "Public-assets R2 write credentials not configured. Use server-only " +
      "JB_PUBLIC_R2_ACCESS_KEY_ID and JB_PUBLIC_R2_SECRET_ACCESS_KEY in local .env.local."
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: "https://" + account + ".r2.cloudflarestorage.com",
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: true,
    maxAttempts: 3,
  });
}

async function verifyPublicUrl(item) {
  const endpoint = item.public_url + "?verify=" + item.file_sha256.slice(0,12);
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(20000),
    headers: { "Cache-Control": "no-cache" },
    redirect: "error",
  });
  if (!response.ok) throw new Error("Public thumbnail URL not ready (" + response.status + ").");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length !== item.file_size ||
      sha256(buffer) !== item.file_sha256) {
    throw new Error("Public thumbnail content hash mismatch.");
  }
}

async function verifiedUpload(client, item) {
  const jpg = await validatedJpeg(path.join(ROOT, item.filename));
  if (jpg.hash !== item.file_sha256 || jpg.size !== item.file_size) {
    throw new Error("Local JPG changed after approval; publishing stopped.");
  }

  let alreadyExists = false;
  try {
    const head = await client.send(new HeadObjectCommand({
      Bucket: PUBLIC_BUCKET, Key: item.public_key,
    }));
    alreadyExists = true;
    if (Number(head.ContentLength) !== jpg.size ||
        head.Metadata?.sha256 !== jpg.hash ||
        head.Metadata?.["media-id"] !== item.media_id) {
      throw new Error("Existing R2 object conflicts with approved thumbnail.");
    }
  } catch (error) {
    if (alreadyExists) throw error;
    const status = error?.$metadata?.httpStatusCode;
    if (status !== 404 && error?.name !== "NotFound" && error?.name !== "NoSuchKey") {
      throw new Error("Public R2 HeadObject failed; check target bucket/permissions.");
    }
    try {
      await client.send(new PutObjectCommand({
        Bucket: PUBLIC_BUCKET,
        Key: item.public_key,
        Body: jpg.data,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=86400",
        Metadata: { sha256: jpg.hash, "media-id": item.media_id },
        IfNoneMatch: "*",
      }));
    } catch {
      throw new Error("Public R2 upload failed. No database update was made.");
    }
  }

  const stored = await client.send(new GetObjectCommand({
    Bucket: PUBLIC_BUCKET, Key: item.public_key,
  }));
  const storedBytes = Buffer.from(await stored.Body.transformToByteArray());
  if (storedBytes.length !== jpg.size || sha256(storedBytes) !== jpg.hash) {
    throw new Error("Uploaded object failed R2 read-back verification.");
  }
  await verifyPublicUrl(item);
}

async function publish() {
  if (process.argv.find((x) => x.startsWith("--confirm-public-upload=")) !==
      "--confirm-public-upload=" + EXPLICIT_CONFIRMATION) {
    throw new Error("Explicit --confirm-public-upload=I_REVIEWED_5_IMAGES required.");
  }
  const expected = await expectedFive();
  const approval = await readJson(APPROVAL);
  sameFive(approval, expected);

  const client = publicClient();
  try {
    for (let i=0; i<SAMPLE_COUNT; i++) {
      try {
        await verifiedUpload(client, expected[i]);
      } catch (error) {
        console.error("Item " + (i+1) + " failed verification: " + error.message);
        throw new Error("Publishing stopped before SQL generation.");
      }
      console.log("Verified PUBLIC thumbnail", i+1, "/", SAMPLE_COUNT);
    }
  } finally {
    client.destroy();
  }

  await writeFile(SQL_FILE, guardedSql(expected), { mode: 0o600 });
  await writeJsonAtomic(DONE_FILE, {
    phase: "317F-5",
    uploaded_and_verified_at: new Date().toISOString(),
    database_updated: false,
    sql_file: SQL_FILE,
    verified: expected.map((x) => ({
      media_id: x.media_id,
      public_url: x.public_url,
      sha256: x.file_sha256,
    })),
  });
  console.log("5 public JPGs verified.");
  console.log("Generated MANUAL guarded SQL:", SQL_FILE);
  console.log("NO Supabase database changes made. Review and execute SQL manually.");
}

async function main() {
  if (modePrepare === modePublish) {
    throw new Error("Use exactly one of --prepare or --publish.");
  }
  console.log("JB Premium Hub / Phase 317F / Safe five-image publication");
  if (modePrepare) await makeApproval();
  else await publish();
}
main().catch((error) => {
  console.error("Phase 317F stopped:", error?.message || "Unknown error.");
  process.exitCode=1;
});
