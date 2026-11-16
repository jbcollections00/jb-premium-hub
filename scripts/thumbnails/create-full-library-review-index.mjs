/**
 * JB Premium Hub — Phase 326, all-catalog, metadata-only review index.
 *
 * Creates an ID-only index of ALL 4,647 media rows for independent,
 * qualified adult content-safety review. Uses the frozen local R2 matching
 * audit + existing publication receipts as read-only metadata.
 *
 * NEVER fetches videos, creates thumbnails, visits R2, calls Supabase,
 * changes access rights, or approves content for publication.
 */
import path from "node:path";
import { readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { prepareMatchedQueue } from "./matched-queue.mjs";

const ROOT = path.resolve(
  process.env.JB_THUMBNAIL_OUTPUT_DIR ||
    path.join(".local", "thumbnail-batch-317d")
);
const EXPECTED_MEDIA = 4647;
const EXPECTED_ORIGINAL_COVERS = 1001;
const EXPECTED_ELIGIBLE = 3646;
const EXPECTED_NEW_PUBLISHED = 29;
const SOURCE_BUCKET = "jb-collections-hub";
const PUBLIC_ORIGIN = "https://assets.jb-premium-hub.vip";
const HEADER = "media_id,cover_inventory,qualified_content_review,approved_for_new_publication";

function idsOfReceipt(receipt, { phase, count, prefix, allowedIds }) {
  if (receipt?.phase !== phase || !Array.isArray(receipt.verified) ||
      receipt.verified.length !== count) {
    throw new Error("Missing or incomplete publication receipt: " + phase);
  }
  const ids = new Set();
  for (const x of receipt.verified) {
    const id = String(x?.media_id || "").toLowerCase();
    if (!allowedIds.has(id) || ids.has(id) ||
        typeof x?.public_url !== "string" ||
        !x.public_url.startsWith(PUBLIC_ORIGIN + prefix + id + "-") ||
        !x.public_url.endsWith(".jpg")) {
      throw new Error("Publication receipt has an invalid or duplicate mapping.");
    }
    ids.add(id);
  }
  return ids;
}

/**
 * Pure safety gate. Does not interpret saved cover presence as content clearance.
 * Do not alter approval_to_publish or infer eligibility from filename/title.
 */
export function createFullReviewIndex(report, pilot, batch) {
  const match = prepareMatchedQueue(report, SOURCE_BUCKET, EXPECTED_MEDIA);
  if (match.preserved !== EXPECTED_ORIGINAL_COVERS ||
      match.eligible !== EXPECTED_ELIGIBLE ||
      match.selected.length !== EXPECTED_ELIGIBLE ||
      report.matched.length !== EXPECTED_MEDIA) {
    throw new Error("Frozen catalog counts changed; refusing index creation.");
  }
  const eligibleIds = new Set(match.selected.map(x => x.media_id.toLowerCase()));
  const pilotIds = idsOfReceipt(pilot, {
    phase: "317F-5", count: 5,
    prefix: "/thumbnails/auto/317f/",
    allowedIds: new Set(match.selected.slice(0,5).map(x=>x.media_id.toLowerCase()))
  });
  const batchIds = idsOfReceipt(batch, {
    phase: "317G", count: 24,
    prefix: "/thumbnails/auto/317g/",
    allowedIds: new Set(match.selected.slice(5,30).map(x=>x.media_id.toLowerCase()))
  });
  const publishedIds = new Set([...pilotIds, ...batchIds]);
  if (publishedIds.size !== EXPECTED_NEW_PUBLISHED) {
    throw new Error("Published receipt overlap or incorrect total.");
  }
  const rows = [];
  const counts = {
    total: 0,
    original_existing_covers: 0,
    newly_published_covers: 0,
    needing_individual_covers: 0,
    pending_independent_content_review: 0,
    approved_for_new_publication: 0,
  };
  const seen = new Set();
  for (const record of report.matched) {
    const id = record.media_id.toLowerCase();
    if (seen.has(id)) throw new Error("Duplicate ID in media index.");
    seen.add(id);
    let group;
    if (publishedIds.has(id)) {
      group = "RECENTLY_PUBLISHED_COVER";
      counts.newly_published_covers++;
    } else if (eligibleIds.has(id)) {
      group = "NEEDS_INDIVIDUAL_COVER";
      counts.needing_individual_covers++;
    } else {
      group = "ORIGINAL_EXISTING_COVER";
      counts.original_existing_covers++;
    }
    rows.push({
      media_id:id,
      cover_inventory:group,
      qualified_content_review:"REVIEW_REQUIRED",
      approved_for_new_publication:false,
    });
    counts.total++;
    counts.pending_independent_content_review++;
  }
  if (counts.total !== EXPECTED_MEDIA ||
      counts.original_existing_covers !== EXPECTED_ORIGINAL_COVERS ||
      counts.newly_published_covers !== EXPECTED_NEW_PUBLISHED ||
      counts.needing_individual_covers !== 3617 ||
      counts.pending_independent_content_review !== EXPECTED_MEDIA ||
      counts.approved_for_new_publication !== 0) {
    throw new Error("Counts failed reconciliation; nothing written.");
  }
  rows.sort((a,b)=>a.media_id.localeCompare(b.media_id));
  const lines = [HEADER, ...rows.map(x=>[
    x.media_id,x.cover_inventory,x.qualified_content_review,"false"
  ].join(","))];
  const csv=lines.join("\r\n")+"\r\n";
  return {
    csv,
    counts,
    sha256:createHash("sha256").update(csv).digest("hex"),
  };
}

async function main() {
  const [matching, pilot, batch] = await Promise.all([
    readFile(path.join(ROOT,"media-r2-matching-audit.json"),"utf8"),
    readFile(path.join(ROOT,"phase317f-five-published.json"),"utf8"),
    readFile(path.join(ROOT,"phase317g-0005-0029-receipt.json"),"utf8"),
  ]);
  const result=createFullReviewIndex(
    JSON.parse(matching),JSON.parse(pilot),JSON.parse(batch)
  );
  const output=path.join(ROOT,"phase326-full-catalog-adult-review-index.csv");
  // Never overwrite a moderator-modified or previously issued index.
  try {
    const existing = await readFile(output,"utf8");
    if(existing!==result.csv) {
      throw new Error("Existing review index has changed; refusing to overwrite.");
    }
    console.log("Existing identical review index preserved.");
  } catch (e) {
    if(e.code!=="ENOENT") throw e;
    await writeFile(output,result.csv,{flag:"wx",mode:0o600});
  }
  console.log("PHASE 326 — METADATA-ONLY, NO MEDIA ACCESS");
  console.table(result.counts);
  console.log("Private review index:",output);
  console.log("CSV checksum:",result.sha256);
  console.log("Not a content safety approval, generation job, or publication authorization.");
}

const direct = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if(direct && process.argv.includes("--run")) {
  main().catch(e=>{
    console.error("Phase 326 stopped:",e?.message||"Unknown error");
    process.exitCode=1;
  });
}
