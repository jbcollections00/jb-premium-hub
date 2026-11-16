import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { gateThumbnailSelection } from "./signed-review-thumbnail-gate.mjs";

const id = n => "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

function mockVerifiedReview() {
  // Ephemeral test-only signer: never materialized or accepted in production.
  const indexText = [
    "media_id,cover_inventory,qualified_content_review,approved_for_new_publication",
    ...Array.from({ length: 4647 }, (_, i) => [
      id(i + 1),
      i < 1001 ? "ORIGINAL_EXISTING_COVER" :
        i < 1030 ? "RECENTLY_PUBLISHED_COVER" : "NEEDS_INDIVIDUAL_COVER",
      "REVIEW_REQUIRED", "false",
    ].join(",")),
  ].join("\r\n") + "\r\n";
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const reviewerPublicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const trustedSpkiSha256 = sha(publicKey.export({ type: "spki", format: "der" }));
  const manifest = {
    schema: "jb-independent-clearance-v1",
    reviewer_org: "Synthetic test organization",
    reviewer_id: "synthetic-test-reviewer",
    completed_at: "2026-11-16T00:00:00Z",
    source_index_sha256: sha(indexText),
    items: Array.from({ length: 4647 }, (_, i) => ({
      media_id: id(i + 1),
      decision: i === 1030 ? "APPROVED_NONEXPLICIT" :
        i === 1031 ? "REJECT" : "HOLD",
      reviewed_at: "2026-11-15T23:00:00Z",
    })),
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const signatureBytes = sign(null, manifestBytes, privateKey);
  const matchedBatch = [1030, 1031, 1032].map(i => ({
    media_id: id(i + 1),
    key: "videos/example-" + i + ".mp4",
    source_status: "missing",
  }));
  return {
    indexText, manifestBytes, signatureBytes, reviewerPublicKeyPem,
    trustedSpkiSha256, matchedBatch,
  };
}

test("signed-approved subset processed; HOLD/REJECT skipped automatically", () => {
  const v = mockVerifiedReview();
  const result = gateThumbnailSelection(v);
  assert.deepEqual(result.approved, [v.matchedBatch[0]]);
  assert.deepEqual(result.summary, {
    batch_candidates: 3,
    approved_nonexplicit: 1,
    skipped_hold: 1,
    skipped_reject: 1,
    unapproved_media_processed: 0,
  });
  assert.equal(result.verified_review.signature_proves_content_safety, false);
});

test("all held batch returns empty selection, not a fallback", () => {
  const v = mockVerifiedReview();
  const result = gateThumbnailSelection({ ...v, matchedBatch: [v.matchedBatch[2]] });
  assert.equal(result.approved.length, 0);
  assert.equal(result.summary.skipped_hold, 1);
});

test("tampered signature is rejected before candidates are selected", () => {
  const v = mockVerifiedReview();
  v.signatureBytes = Buffer.from(v.signatureBytes);
  v.signatureBytes[0] ^= 1;
  assert.throws(() => gateThumbnailSelection(v), /invalid detached reviewer signature/);
});

test("fingerprint mismatch is rejected", () => {
  const v = mockVerifiedReview();
  v.trustedSpkiSha256 = "0".repeat(64);
  assert.throws(() => gateThumbnailSelection(v), /fingerprint/);
});

test("unsigned, absent, duplicate or unmatched IDs cannot enter the queue", () => {
  const v = mockVerifiedReview();
  assert.throws(() => gateThumbnailSelection({ ...v, matchedBatch: [
    { media_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", key: "bad.mp4" }
  ] }), /absent\/duplicated/);
  assert.throws(() => gateThumbnailSelection({ ...v, matchedBatch: [
    v.matchedBatch[0], v.matchedBatch[0]
  ] }), /absent\/duplicated/);
});

const generator = readFileSync(new URL("./batch-generate.mjs", import.meta.url), "utf8");
const publisher = readFileSync(new URL("./publish-reviewed-batch.mjs", import.meta.url), "utf8");

test("generator has no unsigned generation path", () => {
  assert.match(generator, /if \(wantGenerate && !useMatched\)/);
  assert.match(generator, /gateThumbnailSelection/);
  assert.match(generator, /if \(wantGenerate && verifiedBatch\.selected\.length === 0\)/);
  assert.ok(generator.indexOf("const verifiedBatch = wantGenerate ? await prepareSignedBatch()") <
    generator.lastIndexOf("const client = createClient();"));
});
test("publisher checks signed review before JPG reads and skips holds", () => {
  assert.match(publisher, /const checked = gateThumbnailSelection/);
  assert.match(publisher, /if \(!allowed\.has\(item\.media_id\)\)/);
  assert.match(publisher, /status: "SAFETY_HOLD"/);
  assert.ok(publisher.indexOf("const checked = gateThumbnailSelection") <
    publisher.indexOf("const { size, sha256 } = await jpeg"));
  assert.ok(publisher.indexOf("const expected = await expectedItems();") <
    publisher.indexOf("if (flag(\"--publish\")) await publish(expected);"));
});
