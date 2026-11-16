import test from "node:test";
import assert from "node:assert/strict";
import { createFullReviewIndex } from "./create-full-library-review-index.mjs";

const id = n=>"00000000-0000-4000-8000-"+n.toString(16).padStart(12,"0");
function fixtures() {
  const rows=Array.from({length:4647},(_,i)=>({
    media_id:id(i+1),
    object_key:"clip-"+i+".mp4",
    source_host:"pub-012345.r2.dev",
    status:"MATCHED_REVIEW_REQUIRED",
    thumbnail_status:i<3646?"missing":"embedded",
  }));
  const report={
    policy:"READ_ONLY_NO_PUBLICATION",
    source_bucket:"jb-collections-hub",
    counts:{
      csv_rows:4647,valid_rows:4647,
      malformed_or_duplicate_media_ids:0,
      matched_unambiguous:4647,
      distinct_matching_r2_keys:4647,
      matched_ambiguous:0,
      missing_from_current_r2_bucket:0
    },
    matched:rows,not_matched:[],ambiguous:[]
  };
  const published=(indices,phase,dir)=>({
    phase,
    verified:indices.map(i=>({
      media_id:rows[i].media_id,
      public_url:"https://assets.jb-premium-hub.vip/thumbnails/auto/"+dir+"/"+rows[i].media_id+"-abc.jpg",
    }))
  });
  const pilot=published([0,1,2,3,4],"317F-5","317f");
  const second=published(
    Array.from({length:24},(_,i)=>i+5),"317G","317g"
  );
  return {report,pilot,second};
}
test("full 4647 index reconciles 1001+29+3617 without content access or approval",()=>{
  const {report,pilot,second}=fixtures();
  const result=createFullReviewIndex(report,pilot,second);
  assert.deepEqual(result.counts,{
    total:4647,
    original_existing_covers:1001,
    newly_published_covers:29,
    needing_individual_covers:3617,
    pending_independent_content_review:4647,
    approved_for_new_publication:0
  });
  assert.equal(result.csv.trim().split(/\r\n/).length,4648);
  assert.ok(!result.csv.includes("http"));
  assert.ok(!result.csv.includes(".mp4"));
  assert.ok(!result.csv.includes("data:image"));
  assert.equal((result.csv.match(/REVIEW_REQUIRED/g)||[]).length,4647);
});
test("review index is deterministic and receipt-based",()=>{
  const {report,pilot,second}=fixtures();
  const a=createFullReviewIndex(report,pilot,second);
  const b=createFullReviewIndex(report,pilot,second);
  assert.equal(a.sha256,b.sha256);
  assert.equal(a.csv,b.csv);
});
test("fail closed for duplicate, unexpected or incomplete receipts",()=>{
  const {report,pilot,second}=fixtures();
  second.verified[1].media_id=second.verified[0].media_id;
  assert.throws(()=>createFullReviewIndex(report,pilot,second),/invalid or duplicate/);
});
test("reject missing or altered full matching report",()=>{
  const {report,pilot,second}=fixtures();
  report.counts.matched_unambiguous=4646;
  assert.throws(()=>createFullReviewIndex(report,pilot,second),/incomplete or ambiguous/);
});
