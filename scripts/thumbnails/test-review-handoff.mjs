import test from "node:test";
import assert from "node:assert/strict";
import { createSafeHandoff } from "./create-review-handoff.mjs";

const id = i => "00000000-0000-4000-8000-" + i.toString(16).padStart(12, "0");
function valid() {
  const items = Array.from({length:50}, (_, i) => ({
    queue_offset:30+i, media_id:id(i+1),
    content_review:"PENDING_QUALIFIED_CONTENT_REVIEW",
    approval_to_publish:false
  }));
  return {
    phase:"317G-5", source:"FULL_4647_ROW_METADATA_EXPORT",
    counts:{candidates:50,approved_to_publish:0},
    items
  };
}
test("handoff contains only UUIDs, offsets, review statuses — never titles or public links", () => {
  const r=createSafeHandoff(valid());
  assert.equal(r.counts.rows,50);
  assert.equal(r.counts.approved_to_publish,0);
  assert.equal(r.csv.trim().split(/\r\n/).length,51);
  assert.ok(!r.csv.includes("https:"));
  assert.ok(r.csv.includes("ADULT_MODERATOR_REVIEW_REQUIRED"));
});
test("preflight hold remains a hold and does not grant publishing", () => {
  const audit=valid();
  audit.items[12].content_review="HOLD_CONCERNING_TITLE";
  const result=createSafeHandoff(audit);
  assert.equal(result.counts.held,1);
  assert.equal(result.counts.approved_to_publish,0);
  assert.ok(result.csv.includes("HOLD_CONCERNING_TITLE"));
});
test("fail closed if a publication flag is true, row is duplicated, or a video missing", () => {
  const bad1=valid();bad1.items[0].approval_to_publish=true;
  assert.throws(()=>createSafeHandoff(bad1),/rejected/);
  const bad2=valid();bad2.items[1].media_id=bad2.items[0].media_id;
  assert.throws(()=>createSafeHandoff(bad2),/duplicate/);
  const bad3=valid();bad3.items.pop();
  assert.throws(()=>createSafeHandoff(bad3),/complete/);
});
