import test from "node:test";
import assert from "node:assert/strict";
import {
  selectBatch, batchName, createGuardedSql, PUBLIC_ORIGIN,
} from "./publish-batch-rules.mjs";

const id = (n) => "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");
function sampleReport() {
  const n = 4647;
  const rows = Array.from({ length: n }, (_, i) => ({
    media_id: id(i+1),
    object_key: i % 2 === 0 ? "video-" + i + ".mp4" : "videos/video-" + i + ".mp4",
    thumbnail_status: i < 3646 ? "missing" : "embedded",
    status: "MATCHED_REVIEW_REQUIRED",
  }));
  return {
    phase: "317E-3",
    policy: "READ_ONLY_NO_PUBLICATION",
    source_bucket: "jb-collections-hub",
    counts: {
      csv_rows: n, valid_rows: n,
      malformed_or_duplicate_media_ids: 0,
      matched_unambiguous: n,
      distinct_matching_r2_keys: n,
      matched_ambiguous: 0,
      missing_from_current_r2_bucket: 0,
    },
    matched: rows, not_matched: [], ambiguous: []
  };
}
function pilotProof(report) {
  return {
    phase: "317F-5",
    verified: report.matched.slice(0, 5).map((r) => ({
      media_id: r.media_id,
      public_url: PUBLIC_ORIGIN + "/thumbnails/auto/317f/" + r.media_id + "-abcd.jpg",
      sha256: "012345",
    })),
  };
}

test("next reviewed batch starts after five published and has 25 distinct records", () => {
  const report = sampleReport();
  const q = selectBatch(report, pilotProof(report), { offset: 5, limit: 25 });
  assert.equal(q.selected.length, 25);
  assert.equal(q.selected[0].media_id, report.matched[5].media_id);
  assert.equal(q.preserved, 1006);
  assert.equal(batchName(5,25), "phase317g-0005-0029");
});

test("refuses accidental republishing the initial five and unsafe sizes", () => {
  const r = sampleReport(), proof = pilotProof(r);
  assert.throws(() => selectBatch(r, proof, {offset:0,limit:25}));
  assert.throws(() => selectBatch(r, proof, {offset:5,limit:51}));
  assert.throws(() => selectBatch(r, proof, {offset:3640,limit:25}));
});

test("requires verified exact first-five publishing receipt", () => {
  const r=sampleReport(), bad=pilotProof(r);
  bad.verified[0].media_id=id(9999);
  assert.throws(() => selectBatch(r,bad,{offset:5,limit:25}));
});

test("SQL is one guarded transaction checking current video ID, key and old thumbnail", () => {
  const r=sampleReport();
  const a=r.matched[5];
  const item={
    media_id:a.media_id,private_video_key:a.object_key,
    original_source_host:"pub-example.r2.dev",previous_thumbnail_status:"missing",
    public_url:PUBLIC_ORIGIN+"/thumbnails/auto/317g/"+a.media_id+"-abcdef.jpg",
  };
  const sql=createGuardedSql([item]);
  for (const required of ["BEGIN;", "COMMIT;", "m.id = v.media_id::uuid",
    "v.expected_key", "v.expected_host", "v.old_status", "m.thumbnail_url = v.new_url",
    "RAISE EXCEPTION", "verified_count <> 1"]) {
    assert.ok(sql.includes(required), "Missing SQL guard: "+required);
  }
  assert.throws(() => createGuardedSql([item,item]));
});
