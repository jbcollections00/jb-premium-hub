/**
 * Phase 317G: pure, review-gated thumbnail publishing helpers.
 * No network or filesystem access.
 */
import { createHash } from "node:crypto";
import { prepareMatchedQueue } from "./matched-queue.mjs";

export const SOURCE_BUCKET = "jb-collections-hub";
export const PUBLIC_BUCKET = "jb-collections-public-assets";
export const PUBLIC_ORIGIN = "https://assets.jb-premium-hub.vip";
export const DEFAULT_LOGO = PUBLIC_ORIGIN + "/thumbnails/logo_JBCollections.png";
export const EXPECTED_ROWS = 4647;
export const EXPECTED_ELIGIBLE = 3646;
export const FIRST_PUBLISHED = 5;

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function selectBatch(report, oldPublished, { offset, limit }) {
  if (!Number.isSafeInteger(offset) || offset < FIRST_PUBLISHED ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
      offset + limit > EXPECTED_ELIGIBLE) {
    throw new Error("Range must start at offset >=5, within 3646 eligible records, with limit 1..50.");
  }
  const queue = prepareMatchedQueue(report, SOURCE_BUCKET, EXPECTED_ROWS);
  if (queue.eligible !== EXPECTED_ELIGIBLE || queue.preserved !== 1001) {
    throw new Error("Full matching report unexpectedly changed. Stop publishing.");
  }
  if (oldPublished?.phase !== "317F-5" || !Array.isArray(oldPublished.verified) ||
      oldPublished.verified.length !== FIRST_PUBLISHED) {
    throw new Error("Verified five-thumbnail pilot receipt is missing or invalid.");
  }
  const expectedIds = queue.selected.slice(0, FIRST_PUBLISHED).map((row) => row.media_id);
  const publishedIds = oldPublished.verified.map((row) => row.media_id);
  const publishedSet = new Set(publishedIds);
  if (publishedSet.size !== FIRST_PUBLISHED ||
      expectedIds.some((id) => !publishedSet.has(id)) ||
      oldPublished.verified.some((x) =>
        !x.public_url?.startsWith(PUBLIC_ORIGIN + "/thumbnails/auto/317f/" + x.media_id + "-")
      )) {
    throw new Error("First 5 published records do not match expected preserved videos.");
  }
  return {
    selected: queue.selected.slice(offset, offset + limit),
    totalEligible: queue.eligible,
    preserved: queue.preserved + FIRST_PUBLISHED,
    remainingBeforeBatch: queue.eligible - FIRST_PUBLISHED - (offset - FIRST_PUBLISHED),
  };
}

export function batchName(offset, limit) {
  return "phase317g-" + String(offset).padStart(4, "0") + "-" +
    String(offset + limit - 1).padStart(4, "0");
}

export function safeSqlString(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

/**
 * Entire SQL is one transaction. It verifies the current source host, source
 * key and old state before any change, and verifies final URLs before COMMIT.
 * Re-running after a successful execution is harmless/idempotent.
 */
export function createGuardedSql(items) {
  if (!Array.isArray(items) || !items.length || items.length > 50) {
    throw new Error("Expected 1..50 verified image records for SQL.");
  }
  const ids = new Set();
  const keys = new Set();
  for (const item of items) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.media_id) ||
        typeof item.private_video_key !== "string" || !item.private_video_key ||
        typeof item.original_source_host !== "string" ||
        !["missing", "default_logo"].includes(item.previous_thumbnail_status) ||
        typeof item.public_url !== "string" ||
        !item.public_url.startsWith(PUBLIC_ORIGIN + "/thumbnails/auto/317g/" + item.media_id + "-") ||
        ids.has(item.media_id) || keys.has(item.private_video_key)) {
      throw new Error("Invalid, duplicate, or unsafe thumbnail-to-media mapping in SQL.");
    }
    ids.add(item.media_id);
    keys.add(item.private_video_key);
  }
  const values = items.map((item) =>
    "    (" + [
      item.media_id, item.private_video_key, item.original_source_host,
      item.previous_thumbnail_status, item.public_url,
    ].map(safeSqlString).join(", ") + ")"
  ).join(",\n");
  const typedValues = "(VALUES\n" + values + "\n  ) AS v(media_id, expected_key, expected_host, old_status, new_url)";
  const sameMedia = [
    "m.id = v.media_id::uuid",
    "m.type = 'video'",
    "LOWER(SPLIT_PART(SPLIT_PART(m.media_url, '://', 2), '/', 1)) = v.expected_host",
    "REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(m.media_url, '?', 1), '#', 1), '^https?://[^/]+/?', '', 'i') = v.expected_key",
  ].join("\n      AND ");
  const oldState = [
    "((v.old_status = 'missing' AND (m.thumbnail_url IS NULL OR BTRIM(m.thumbnail_url) = ''))",
    " OR (v.old_status = 'default_logo' AND BTRIM(m.thumbnail_url) = " + safeSqlString(DEFAULT_LOGO) + "))",
  ].join("");
  const expect = String(items.length);
  const arrayIds = items.map((item) => safeSqlString(item.media_id) + "::uuid").join(", ");

  return [
    "-- Phase 317G: apply ONLY after ALL thumbnails in this batch were reviewed, approved",
    "-- and verified against the public R2 URL by the publishing script.",
    "-- Designed for ONE deliberate Supabase SQL Editor execution; safe to rerun.",
    "-- This updates ONLY thumbnail_url on the exact matching video records.",
    "BEGIN;",
    "DO $jb_317g$",
    "DECLARE",
    "  acceptable_count integer;",
    "  verified_count integer;",
    "BEGIN",
    "  SELECT COUNT(*) INTO acceptable_count",
    "  FROM public.media AS m",
    "  JOIN " + typedValues,
    "    ON " + sameMedia,
    "   AND (" + oldState + " OR m.thumbnail_url = v.new_url);",
    "  IF acceptable_count <> " + expect + " THEN",
    "    RAISE EXCEPTION '317G ABORT: expected " + expect + " safe rows; found %', acceptable_count;",
    "  END IF;",
    "",
    "  UPDATE public.media AS m",
    "  SET thumbnail_url = v.new_url",
    "  FROM " + typedValues,
    "  WHERE " + sameMedia,
    "    AND " + oldState + ";",
    "",
    "  SELECT COUNT(*) INTO verified_count",
    "  FROM public.media AS m",
    "  JOIN " + typedValues,
    "    ON " + sameMedia,
    "   AND m.thumbnail_url = v.new_url;",
    "  IF verified_count <> " + expect + " THEN",
    "    RAISE EXCEPTION '317G ABORT: expected " + expect + " verified updates; found %', verified_count;",
    "  END IF;",
    "END",
    "$jb_317g$;",
    "COMMIT;",
    "",
    "-- Optional read-only verification query (run separately):",
    "SELECT id, title, thumbnail_url FROM public.media",
    "WHERE id IN (" + arrayIds + ") ORDER BY id;",
    "",
  ].join("\n");
}
