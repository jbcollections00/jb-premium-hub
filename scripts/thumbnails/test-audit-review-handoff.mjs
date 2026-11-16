import test from "node:test";
import assert from "node:assert/strict";
import { createSafeHandoff } from "./create-review-handoff.mjs";
import { auditHandoff } from "./audit-review-handoff.mjs";

const id = (i) => "00000000-0000-4000-8000-" + i.toString(16).padStart(12, "0");
const createPreflight = () => ({
  phase: "317G-5", source: "FULL_4647_ROW_METADATA_EXPORT",
  counts: { candidates: 50, approved_to_publish: 0 },
  items: Array.from({ length:50 }, (_,i)=>({
    queue_offset: i + 30, media_id: id(i + 1),
    content_review: "PENDING_QUALIFIED_CONTENT_REVIEW",
    approval_to_publish: false,
  })),
});

test("intact handoff yields fifty pending, zero approved and no publication permission", () => {
  const p=createPreflight();
  const csv=createSafeHandoff(p).csv;
  const result=auditHandoff(p,csv);
  assert.equal(result.candidate_count,50);
  assert.equal(result.pending_qualified_review,50);
  assert.equal(result.approved_to_publish,0);
  assert.equal(result.safe_to_publish,false);
  assert.match(result.handoff_sha256,/^[0-9a-f]{64}$/);
  assert.match(result.id_list_sha256,/^[0-9a-f]{64}$/);
});

test("tampering with an ID or status is rejected", () => {
  const p=createPreflight();
  const csv=createSafeHandoff(p).csv;
  assert.throws(()=>auditHandoff(p,csv.replace(id(1),id(999))),/not identical/);
  assert.throws(()=>auditHandoff(p,csv.replace("ADULT_MODERATOR_REVIEW_REQUIRED","APPROVED")),/not identical/);
});

test("unauthorized publication flags in preflight are rejected", () => {
  const p=createPreflight();
  const csv=createSafeHandoff(p).csv;
  p.items[0].approval_to_publish=true;
  assert.throws(()=>auditHandoff(p,csv),/rejected/);
});


test("import with --run never triggers the handoff CLI as a side effect", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const imported = new URL("./create-review-handoff.mjs", import.meta.url);
  const fakeParent = fileURLToPath(new URL("./audit-review-handoff.mjs", import.meta.url));
  const evalSource = [
    "process.argv[1] = " + JSON.stringify(fakeParent) + ";",
    "process.argv.push('--run');",
    "await import(" + JSON.stringify(imported.href) + ");",
  ].join(" ");
  const out = spawnSync(process.execPath, ["--input-type=module", "--eval", evalSource], {
    encoding:"utf8", timeout:10000,
    env: {...process.env, JB_THUMBNAIL_OUTPUT_DIR:"__nonexistent_regression_fixture__"},
  });
  assert.equal(out.status,0, out.stderr);
  assert.equal(out.stdout,"", "Import must not run the handoff generator");
});
