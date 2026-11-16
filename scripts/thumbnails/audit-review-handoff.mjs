/**
 * Phase 317G-7 — integrity audit for ID-only moderator handoff.
 *
 * Reads only the local preflight report and previously produced handoff CSV.
 * Does not open videos, thumbnails, websites, Supabase, or R2.
 * No content-clearance decision is made here.
 */
import path from "node:path";
import { readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createSafeHandoff } from "./create-review-handoff.mjs";

const ROOT = path.resolve(
  process.env.JB_THUMBNAIL_OUTPUT_DIR ||
  path.join(".local", "thumbnail-batch-317d")
);
const PREFLIGHT = "phase317g-0030-0079-content-preflight.json";
const HANDOFF = "phase317g-0030-0079-adult-review-handoff.csv";
const REPORT = "phase317g-0030-0079-handoff-integrity.json";
const sha = data => createHash("sha256").update(data).digest("hex");

export function auditHandoff(preflight, csv) {
  const generated = createSafeHandoff(preflight);
  // All 50 exact IDs, order, states, and columns must remain identical to
  // the handoff generated from the verified source preflight.
  if (csv !== generated.csv) {
    throw new Error("Handoff CSV is not identical to the verified 50-ID preflight. Do not publish.");
  }
  if (generated.counts.approved_to_publish !== 0 ||
      generated.counts.outstanding_review !== 50) {
    throw new Error("Unexpected publication/clearance state. Stop.");
  }
  return {
    phase: "317G-7",
    purpose: "MODERATION_HANDOFF_INTEGRITY_ONLY",
    candidate_count: generated.counts.rows,
    pending_qualified_review: generated.counts.outstanding_review,
    preflight_holds: generated.counts.held,
    approved_to_publish: 0,
    id_list_sha256: sha(preflight.items.map(x => x.media_id.toLowerCase()).join("\n") + "\n"),
    handoff_sha256: sha(csv),
    safe_to_publish: false,
    warning: "File integrity does NOT establish any content safety clearance.",
  };
}

async function main() {
  const [preflightText, handoffCsv] = await Promise.all([
    readFile(path.join(ROOT, PREFLIGHT), "utf8"),
    readFile(path.join(ROOT, HANDOFF), "utf8"),
  ]);
  const report = auditHandoff(JSON.parse(preflightText), handoffCsv);
  const dest = path.join(ROOT, REPORT);
  const tempfile = dest + ".tmp";
  await writeFile(tempfile, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600
  });
  await rename(tempfile, dest);
  console.log("Phase 317G-7 / ID-only handoff integrity VERIFIED");
  console.table({
    candidates: report.candidate_count,
    pending_qualified_review: report.pending_qualified_review,
    existing_metadata_holds: report.preflight_holds,
    cleared_by_this_tool: report.approved_to_publish,
    safe_to_publish: report.safe_to_publish,
  });
  console.log("Local audit report:", dest);
  console.log("This does NOT clear videos, open media, upload images, or alter Supabase/R2.");
}
if (process.argv.includes("--run")) {
  main().catch(e => {
    console.error("Phase 317G-7 stopped:", e?.message || "Unknown error");
    process.exitCode = 1;
  });
}
