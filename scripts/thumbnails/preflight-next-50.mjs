/**
 * JB Premium Hub / Phase 317G-5 — metadata-only content preflight.
 *
 * Strictly READ ONLY. Does not open, download, render, generate, or publish
 * any videos/thumbnails. Does not change Supabase, R2, or membership rights.
 *
 * Required:
 * - full 4647-row CSV export from read-only SQL (media_id,title)
 * - frozen private 317E matching audit
 * - local 317F receipt for first five published thumbnails
 *
 * Usage:
 * node scripts/thumbnails/preflight-next-50.mjs --csv="C:\...\JB_317G_titles.csv"
 *
 * Output contains IDs and review states ONLY, NEVER video titles.
 * Title heuristics are incomplete, especially across languages. No item is
 * automatically approved for image publication.
 */
import path from "node:path";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { selectBatch } from "./publish-batch-rules.mjs";

const ROOT = path.resolve(
  process.env.JB_THUMBNAIL_OUTPUT_DIR ||
  path.join(".local", "thumbnail-batch-317d")
);
const OFFSET = 30;
const LIMIT = 50;
const EXPECTED_MEDIA = 4647;

// Conservative metadata triage. Never classify unflagged titles as SAFE:
// all candidate videos still require independent qualified content review.
// No sensitive source IDs are embedded in this repository.
export function concerningTitle(title) {
  const ageContext = /\b(?:underage|minor|child|schoolgirl|schoolboy|\d{1,2}\s*(?:years?|yrs?)\s*old)\b/i;
  const sexualContext = /\b(?:sexual|porn|striptease|nude|sex|xxx)\b/i;
  return ageContext.test(title) && sexualContext.test(title);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseCsv(src) {
  const rows = [];
  let field = "", row = [], quoted = false;
  const raw = src.replace(/^\uFEFF/, "");
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') {
      if (quoted && raw[i+1] === '"') { field += '"'; i++; }
      else if (quoted) quoted = false;
      else if (!field.length) quoted = true;
      else throw new Error("Invalid CSV quoting.");
    } else if (c === "," && !quoted) {
      row.push(field); field = "";
    } else if ((c === "\r" || c === "\n") && !quoted) {
      if (c === "\r" && raw[i+1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(x => x.length)) rows.push(row);
      row = [];
    } else { field += c; }
  }
  if (quoted) throw new Error("Incomplete CSV quotation.");
  if (field.length || row.length) {
    row.push(field);
    if (row.some(x => x.length)) rows.push(row);
  }
  return rows;
}

export function validateTitleExport(content, expected = EXPECTED_MEDIA) {
  const rows = parseCsv(content);
  if (!rows.length) throw new Error("No CSV rows found.");
  const headers = rows[0].map(x => x.trim().toLowerCase());
  const idIdx = headers.indexOf("media_id");
  const titleIdx = headers.indexOf("title");
  if (idIdx < 0 || titleIdx < 0) {
    throw new Error("CSV requires media_id and title columns.");
  }
  if (rows.length - 1 !== expected) {
    throw new Error("Full metadata export incomplete. Expected " + expected +
      " video rows, got " + (rows.length - 1) + ".");
  }
  const ids = new Map();
  for (const row of rows.slice(1)) {
    if (row.length !== headers.length) {
      throw new Error("Malformed CSV column count.");
    }
    const id = row[idIdx]?.trim().toLowerCase();
    if (!UUID.test(id || "") || ids.has(id)) {
      throw new Error("Duplicate or invalid media ID in title export.");
    }
    ids.set(id, row[titleIdx] || "");
  }
  return ids;
}

export function buildReviewQueue(selected, titles) {
  if (!Array.isArray(selected) || selected.length !== LIMIT ||
      new Set(selected.map(x => x.media_id)).size !== LIMIT) {
    throw new Error("Full next-50 selection is required.");
  }
  return selected.map((row, i) => {
    const id = String(row.media_id).toLowerCase();
    if (!titles.has(id)) throw new Error("Missing exact title-export entry for matching video.");
    let state = "PENDING_QUALIFIED_CONTENT_REVIEW";
    if (!titles.get(id)?.trim()) state = "HOLD_MISSING_TITLE";
    else if (concerningTitle(titles.get(id))) state = "HOLD_CONCERNING_TITLE";
    return {
      queue_offset: OFFSET + i,
      media_id: id,
      content_review: state,
      approval_to_publish: false
    };
  });
}

async function main() {
  const csvArg = process.argv.find(x => x.startsWith("--csv="));
  if (!csvArg || !csvArg.slice(6)) throw new Error("Provide --csv=<full export path>.");
  const [full, pilot, csv] = await Promise.all([
    readFile(path.join(ROOT, "media-r2-matching-audit.json"), "utf8"),
    readFile(path.join(ROOT, "phase317f-five-published.json"), "utf8"),
    readFile(path.resolve(csvArg.slice(6)), "utf8"),
  ]);
  const titles = validateTitleExport(csv);
  const batch = selectBatch(JSON.parse(full), JSON.parse(pilot), {
    offset: OFFSET, limit: LIMIT
  });
  const items = buildReviewQueue(batch.selected, titles);
  const counts = {
    candidates: items.length,
    concerning_title_holds: items.filter(x => x.content_review === "HOLD_CONCERNING_TITLE").length,
    missing_title_holds: items.filter(x => x.content_review === "HOLD_MISSING_TITLE").length,
    pending_moderator_review: items.filter(x => x.content_review === "PENDING_QUALIFIED_CONTENT_REVIEW").length,
    approved_to_publish: 0
  };
  const out = path.join(ROOT, "phase317g-0030-0079-content-preflight.json");
  const tmp = out + ".tmp";
  await mkdir(ROOT, { recursive: true });
  await writeFile(tmp, JSON.stringify({
    phase: "317G-5",
    source: "FULL_4647_ROW_METADATA_EXPORT",
    warning: "Metadata-only, not evidence content is safe; no automatic approval.",
    counts, items
  }, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, out);
  console.log("Phase 317G-5 — Metadata-only preflight / READ ONLY");
  console.log("Full Supabase title export rows verified:", titles.size);
  console.table(counts);
  console.log("Private local report saved:", out);
  console.log("NO images generated, video content opened, R2 uploads, DB updates or access-control changes.");
  console.log("Any unverified item must remain excluded from public thumbnail publication.");
}

// Explicit execution flag prevents accidental runs when imported by node --test.
if (process.argv.includes("--run")) {
  main().catch(err => {
    console.error("Preflight stopped:", err?.message || "Unknown error.");
    process.exitCode = 1;
  });
}
