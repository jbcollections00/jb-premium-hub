import test from "node:test";
import assert from "node:assert/strict";
import { prepareMatchedQueue } from "./matched-queue.mjs";

const id = (n) => "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");
function report(statuses = ["missing", "default_logo", "embedded", "existing_custom"]) {
  return {
    policy: "READ_ONLY_NO_PUBLICATION",
    source_bucket: "jb-collections-hub",
    counts: {
      csv_rows: statuses.length,
      valid_rows: statuses.length,
      malformed_or_duplicate_media_ids: 0,
      matched_unambiguous: statuses.length,
      distinct_matching_r2_keys: statuses.length,
      matched_ambiguous: 0,
      missing_from_current_r2_bucket: 0,
    },
    matched: statuses.map((thumbnail_status, i) => ({
      media_id: id(i + 1),
      object_key: i % 2 === 0 ? "one-" + i + ".mp4" : "videos/two-" + i + ".mp4",
      thumbnail_status,
      status: "MATCHED_REVIEW_REQUIRED",
    })),
    not_matched: [],
    ambiguous: [],
  };
}

test("builds exact root/videos queue preserving existing images", () => {
  const result = prepareMatchedQueue(report(), "jb-collections-hub", 4);
  assert.equal(result.eligible, 2);
  assert.equal(result.preserved, 2);
  assert.deepEqual(result.selected.map((x) => x.source_status), ["missing", "default_logo"]);
  assert.deepEqual(result.selected.map((x) => x.key), ["one-0.mp4", "videos/two-1.mp4"]);
});

test("refuses a 100-row report when expected complete library is 4647", () => {
  assert.throws(() => prepareMatchedQueue(report(), "jb-collections-hub", 4647));
});

test("refuses wrong bucket, ambiguous keys, missing objects", () => {
  const a = report();
  assert.throws(() => prepareMatchedQueue(a, "other-bucket", 4));
  const b = report();
  b.matched[1].object_key = b.matched[0].object_key;
  assert.throws(() => prepareMatchedQueue(b, "jb-collections-hub", 4));
  const c = report();
  c.counts.missing_from_current_r2_bucket = 1;
  assert.throws(() => prepareMatchedQueue(c, "jb-collections-hub", 4));
});

test("refuses suspicious or malformed private keys and ID duplication", () => {
  const a = report();
  a.matched[0].object_key = "../unsafe.mp4";
  assert.throws(() => prepareMatchedQueue(a, "jb-collections-hub", 4));
  const b = report();
  b.matched[1].media_id = b.matched[0].media_id;
  assert.throws(() => prepareMatchedQueue(b, "jb-collections-hub", 4));
});
