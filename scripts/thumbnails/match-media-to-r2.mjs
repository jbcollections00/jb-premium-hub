/**
 * JB Premium Hub Phase 317E-3: exact, READ-ONLY Supabase CSV <-> R2 key audit.
 *
 * Input: SQL Editor CSV with columns media_id, object_key, source_host,
 * thumbnail_status. No service-role keys or DB connection required.
 *
 * Usage: node --env-file="C:\path\.env.local" scripts/thumbnails/match-media-to-r2.mjs --csv="C:\path\JB_317E_media_keys.csv"
 *
 * Prints only aggregate counts. Does not download video content, generate images,
 * upload to R2, or change database records. Private local audit JSON only.
 */
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import {
  S3Client, ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.JB_THUMBNAIL_SOURCE_BUCKET ||
  process.env.R2_BUCKET_NAME || "jb-collections-hub";
const OUTPUT_DIR = path.resolve(
  process.env.JB_THUMBNAIL_OUTPUT_DIR || path.join(".local", "thumbnail-batch-317d")
);
const OUTPUT_PATH = path.join(OUTPUT_DIR, "media-r2-matching-audit.json");
const EXTENSION = /\.(?:mp4|m4v|mov|webm|mkv|avi|mpeg|mpg)$/i;

function csvRows(raw) {
  const lines = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (quoted && raw[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted) {
        quoted = false;
      } else if (cell === "") {
        quoted = true;
      } else {
        throw new Error("CSV contains an unexpected quote.");
      }
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x !== "")) lines.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (quoted) throw new Error("CSV ends with an unclosed quote.");
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((x) => x !== "")) lines.push(row);
  }
  return lines;
}

function parseExport(raw) {
  const rows = csvRows(raw.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV must contain a header and data rows.");
  const header = rows[0].map((x) => x.trim().toLowerCase());
  const columns = ["media_id", "object_key", "source_host", "thumbnail_status"];
  for (const c of columns) {
    if (!header.includes(c)) throw new Error("CSV is missing required column: " + c);
  }
  const indices = Object.fromEntries(columns.map((x) => [x, header.indexOf(x)]));
  const mediaIds = new Set();
  const valid = [];
  let invalid = 0;
  for (const row of rows.slice(1)) {
    const item = Object.fromEntries(columns.map((x) => [x, row[indices[x]]?.trim() || ""]));
    // Prevent loose or approximate matching, including silent URL decoding.
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(item.media_id) ||
        !item.object_key || !EXTENSION.test(item.object_key) ||
        item.object_key.startsWith("/") || item.object_key.includes("..") ||
        item.object_key.includes("\\") || mediaIds.has(item.media_id)) {
      invalid++;
      continue;
    }
    mediaIds.add(item.media_id);
    valid.push(item);
  }
  return { valid, invalid, total: rows.length - 1 };
}

async function loadR2Keys() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing private local R2 configuration.");
  }
  const client = new S3Client({
    region: "auto",
    endpoint: "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    maxAttempts: 3,
  });
  const keys = new Set();
  let continuation;
  let pages = 0;
  try {
    do {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: BUCKET,
        MaxKeys: 1000,
        ...(continuation ? { ContinuationToken: continuation } : {}),
      }));
      pages++;
      for (const entry of response.Contents || []) {
        if (entry.Key && EXTENSION.test(entry.Key) && Number(entry.Size) > 0) {
          keys.add(entry.Key);
          if (keys.size > 100000) throw new Error("R2 inventory exceeded safety limit.");
        }
      }
      const next = response.IsTruncated ? response.NextContinuationToken : undefined;
      if (response.IsTruncated && (!next || next === continuation)) {
        throw new Error("Pagination failed to advance.");
      }
      continuation = next;
    } while (continuation);
  } finally {
    client.destroy();
  }
  return { keys, pages };
}

function buildAudit(csv, available) {
  const grouped = new Map();
  for (const item of csv.valid) {
    if (!grouped.has(item.object_key)) grouped.set(item.object_key, []);
    grouped.get(item.object_key).push(item);
  }
  const counts = {
    csv_rows: csv.total,
    malformed_or_duplicate_media_ids: csv.invalid,
    valid_rows: csv.valid.length,
    matched_unambiguous: 0,
    matched_ambiguous: 0,
    missing_from_current_r2_bucket: 0,
    distinct_matching_r2_keys: 0,
    with_existing_custom_thumbnail: 0,
    with_embedded_thumbnail: 0,
    with_default_or_missing_thumbnail: 0,
  };
  const matched = [];
  const missing = [];
  const ambiguous = [];
  for (const [key, rows] of grouped) {
    if (!available.has(key)) {
      for (const row of rows) {
        counts.missing_from_current_r2_bucket++;
        missing.push({ media_id: row.media_id, object_key: key });
      }
      continue;
    }
    counts.distinct_matching_r2_keys++;
    if (rows.length !== 1) {
      for (const row of rows) {
        counts.matched_ambiguous++;
        ambiguous.push({ media_id: row.media_id, object_key: key });
      }
      continue;
    }
    const row = rows[0];
    counts.matched_unambiguous++;
    switch (row.thumbnail_status) {
      case "existing_custom":
        counts.with_existing_custom_thumbnail++; break;
      case "embedded":
        counts.with_embedded_thumbnail++; break;
      default:
        counts.with_default_or_missing_thumbnail++;
    }
    matched.push({
      media_id: row.media_id,
      object_key: key,
      thumbnail_status: row.thumbnail_status,
      source_host: row.source_host,
      status: "MATCHED_REVIEW_REQUIRED",
    });
  }
  return { counts, matched, missing, ambiguous };
}

async function main() {
  const fileArg = process.argv.find((x) => x.startsWith("--csv="));
  if (!fileArg || !fileArg.slice(6)) {
    throw new Error("Provide the local SQL export with --csv=<path>.");
  }
  const csv = parseExport(await readFile(path.resolve(fileArg.slice(6)), "utf8"));
  console.log("Phase 317E-3 / PRIVATE READ-ONLY KEY MATCH");
  console.log("Source bucket:", BUCKET);
  console.log("Valid database records in CSV:", csv.valid.length);
  const { keys, pages } = await loadR2Keys();
  console.log("Video objects in current R2 bucket:", keys.size);
  console.log("R2 listing pages:", pages);
  const audit = buildAudit(csv, keys);
  const result = {
    phase: "317E-3",
    created_at: new Date().toISOString(),
    source_bucket: BUCKET,
    policy: "READ_ONLY_NO_PUBLICATION",
    counts: audit.counts,
    matched: audit.matched,
    not_matched: audit.missing,
    ambiguous: audit.ambiguous,
  };
  await mkdir(OUTPUT_DIR, { recursive: true });
  const temp = OUTPUT_PATH + ".tmp";
  await writeFile(temp, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, OUTPUT_PATH);
  console.table(audit.counts);
  console.log("Private matching report saved locally:", OUTPUT_PATH);
  console.log("No DB updates, image uploads, or video downloads were made.");
  console.log("NOTE: An exact key match does NOT yet approve public thumbnail publication.");
}

main().catch((err) => {
  console.error("Matching audit stopped:", err?.message || "Unknown error.");
  process.exitCode = 1;
});
