/**
 * Phase 317E-5: pure, strict queue builder for LOCAL thumbnail generation.
 * No database or R2 calls. Never save or publish this private match report.
 */
export const MATCHED_QUEUE_STATUSES = new Set(["missing", "default_logo"]);
const ALLOWED_STATUSES = new Set(["missing", "default_logo", "embedded", "existing_custom"]);

function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function prepareMatchedQueue(report, bucket, expectedRows) {
  if (!report || report.policy !== "READ_ONLY_NO_PUBLICATION" ||
      report.source_bucket !== bucket || !Array.isArray(report.matched) ||
      !report.counts || typeof report.counts !== "object") {
    throw new Error("Invalid or incorrect-bucket private R2 matching report.");
  }

  const counts = report.counts;
  const n = counts.csv_rows;
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(expectedRows) || expectedRows < 1 ||
      n !== expectedRows || counts.valid_rows !== n ||
      counts.malformed_or_duplicate_media_ids !== 0 ||
      counts.matched_unambiguous !== n ||
      counts.distinct_matching_r2_keys !== n ||
      counts.matched_ambiguous !== 0 ||
      counts.missing_from_current_r2_bucket !== 0 ||
      report.matched.length !== n ||
      (Array.isArray(report.not_matched) && report.not_matched.length > 0) ||
      (Array.isArray(report.ambiguous) && report.ambiguous.length > 0)) {
    throw new Error("Full match report is incomplete or ambiguous. No images generated.");
  }

  const ids = new Set();
  const keys = new Set();
  const selected = [];
  let preserved = 0;

  for (const entry of report.matched) {
    if (!entry || typeof entry !== "object" ||
        !isUuid(entry.media_id) ||
        typeof entry.object_key !== "string" ||
        !/\.(?:mp4|m4v|mov|webm|mkv|avi|mpeg|mpg)$/i.test(entry.object_key) ||
        entry.object_key.startsWith("/") ||
        entry.object_key.includes("..") || entry.object_key.includes("\\") ||
        entry.status !== "MATCHED_REVIEW_REQUIRED" ||
        !ALLOWED_STATUSES.has(entry.thumbnail_status) ||
        ids.has(entry.media_id) || keys.has(entry.object_key)) {
      throw new Error("Unexpected/duplicate row in private matching report. Nothing generated.");
    }
    ids.add(entry.media_id);
    keys.add(entry.object_key);
    if (MATCHED_QUEUE_STATUSES.has(entry.thumbnail_status)) {
      selected.push({
        key: entry.object_key,
        media_id: entry.media_id,
        source_status: entry.thumbnail_status,
      });
    } else {
      preserved++;
    }
  }

  if (selected.length + preserved !== n) {
    throw new Error("Matched queue counting error.");
  }

  // Stable matching, independent of R2 list order. Offsets do not shift unless
  // report changes; the report should be frozen during a batch campaign.
  selected.sort((a, b) => a.media_id.localeCompare(b.media_id));
  return {
    selected,
    preserved,
    total: n,
    eligible: selected.length,
  };
}
