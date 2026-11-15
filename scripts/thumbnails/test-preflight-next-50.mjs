import test from "node:test";
import assert from "node:assert/strict";
import {
  concerningTitle, validateTitleExport, buildReviewQueue,
} from "./preflight-next-50.mjs";

const id = (i) => "00000000-0000-4000-8000-" + i.toString(16).padStart(12, "0");
const selected = Array.from({length: 50}, (_, i) => ({media_id: id(i+1),key:"sample"+i+".mp4"}));
test("unremarkable title does not clear content: still pending moderator review", () => {
  const map = new Map(selected.map(x=>[x.media_id, "Ordinary clip"]));
  const items = buildReviewQueue(selected,map);
  assert.equal(items.length, 50);
  assert.ok(items.every(x=>x.content_review === "PENDING_QUALIFIED_CONTENT_REVIEW"));
  assert.ok(items.every(x=>x.approval_to_publish === false));
});
test("concerning metadata is held, not published, and blank title is held", () => {
  const titles = new Map(selected.map(x=>[x.media_id, "Ordinary clip"]));
  titles.set(selected[0].media_id,"12 years old sexual");
  titles.set(selected[1].media_id,"");
  assert.equal(concerningTitle("12 years old sexual"),true);
  const result=buildReviewQueue(selected,titles);
  assert.equal(result[0].content_review,"HOLD_CONCERNING_TITLE");
  assert.equal(result[1].content_review,"HOLD_MISSING_TITLE");
  assert.ok(result.every(x=>x.approval_to_publish===false));
});
test("complete title CSV, duplication and missing records enforced", () => {
  const valid="media_id,title\n"+selected.slice(0,2).map(x=>x.media_id+",Some clip").join("\n");
  assert.equal(validateTitleExport(valid,2).size,2);
  assert.throws(()=>validateTitleExport(valid,3),/incomplete/i);
  assert.throws(()=>validateTitleExport("media_id,title\n"+selected[0].media_id+",A\n"+selected[0].media_id+",B",2),/Duplicate/i);
  const missing = new Map([[selected[0].media_id,"title"]]);
  assert.throws(()=>buildReviewQueue(selected,missing),/Missing exact/);
});
