/**
 * JB Premium Hub — Phase 317G-6.
 * Create an IDs-only handoff for a qualified adult content-safety moderator.
 * NO thumbnails/videos, NO links, NO Supabase/R2, NO automatic approval.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, writeFile, stat } from "node:fs/promises";

const ROOT = path.resolve(
  process.env.JB_THUMBNAIL_OUTPUT_DIR ||
  path.join(".local", "thumbnail-batch-317d")
);
const SRC = "phase317g-0030-0079-content-preflight.json";
const DEST = "phase317g-0030-0079-adult-review-handoff.csv";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED = new Set([
  "PENDING_QUALIFIED_CONTENT_REVIEW",
  "HOLD_CONCERNING_TITLE",
  "HOLD_MISSING_TITLE"
]);

export function createSafeHandoff(preflight) {
  if (preflight?.phase !== "317G-5" ||
      preflight?.source !== "FULL_4647_ROW_METADATA_EXPORT" ||
      preflight?.counts?.candidates !== 50 ||
      preflight?.counts?.approved_to_publish !== 0 ||
      !Array.isArray(preflight?.items) ||
      preflight.items.length !== 50) {
    throw new Error("Preflight isn't the complete, pending 50-video audit.");
  }
  const ids = new Set();
  const result = [
    "queue_offset,media_id,preflight_status,reviewer_status"
  ];
  for (let i = 0; i < 50; i++) {
    const item = preflight.items[i];
    const expectedOffset = 30 + i;
    if (item?.queue_offset !== expectedOffset ||
        typeof item.media_id !== "string" ||
        !UUID.test(item.media_id) ||
        ids.has(item.media_id.toLowerCase()) ||
        !ALLOWED.has(item.content_review) ||
        item.approval_to_publish !== false) {
      throw new Error("Safety gate rejected malformed, duplicate, or approved row " + expectedOffset);
    }
    ids.add(item.media_id.toLowerCase());
    result.push([
      String(expectedOffset),
      item.media_id.toLowerCase(),
      item.content_review,
      "ADULT_MODERATOR_REVIEW_REQUIRED",
    ].join(","));
  }
  const counts = {
    rows: 50,
    outstanding_review: 50,
    held: preflight.items.filter(x => x.content_review.startsWith("HOLD_")).length,
    approved_to_publish: 0,
  };
  return { csv: result.join("\r\n") + "\r\n", counts };
}

async function main() {
  const source = path.join(ROOT, SRC);
  const destination = path.join(ROOT, DEST);
  const audit = JSON.parse(await readFile(source, "utf8"));
  const { csv, counts } = createSafeHandoff(audit);

  try {
    const existing = await readFile(destination, "utf8");
    if (existing !== csv) {
      throw new Error("Existing handoff file has changed. Refusing to overwrite moderator work.");
    }
    console.log("Existing identical handoff preserved.");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    await writeFile(destination, csv, { encoding: "utf8", flag: "wx", mode: 0o600 });
    console.log("New ID-only moderator handoff generated.");
  }

  console.log("Phase 317G-6 / READ ONLY");
  console.table(counts);
  console.log("Private output:", destination);
  console.log("Hand this ID-only checklist to a qualified adult moderator.");
  console.log("No videos, thumbnails, titles, links, credentials, uploads, or access changes.");
  console.log("The file is not a publication approval or clearance certificate.");
}

// Importing this module from another CLI with --run must NOT launch it.
const invokedDirectly = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly && process.argv.includes("--run")) {
  main().catch(e => {
    console.error("317G-6 stopped:", e?.message || "Unknown error");
    process.exitCode = 1;
  });
}
