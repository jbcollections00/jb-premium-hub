/**
 * Phase 331: fail-closed metadata-only thumbnail gate.
 *
 * A qualified adult moderator's independently trusted signed manifest must
 * classify ALL original catalog IDs. Only APPROVED_NONEXPLICIT IDs may enter
 * the local candidate queue. HOLD, REJECT and missing IDs are NEVER generated.
 *
 * IMPORTANT: signature verification establishes metadata integrity, NOT that
 * the underlying media is lawful or was actually reviewed. This module does
 * not open media, fetch R2, write images, upload, or change Supabase.
 */
import { verifyAttestation } from "./verify-independent-clearance.mjs";

export function gateThumbnailSelection({
  matchedBatch,
  indexText,
  manifestBytes,
  signatureBytes,
  reviewerPublicKeyPem,
  trustedSpkiSha256,
}) {
  if (!Array.isArray(matchedBatch)) {
    throw new Error("Expected exact media ID matched batch.");
  }

  // The verifier requires an exact 4,647-ID index, the authenticated Ed25519
  // reviewer key, a valid signature and complete decisions for ALL records.
  const verification = verifyAttestation({
    indexText, manifestBytes, signatureBytes, reviewerPublicKeyPem,
    trustedSpkiSha256,
  });
  const signed = JSON.parse(manifestBytes.toString("utf8"));
  const decisions = new Map(signed.items.map(row => [row.media_id, row.decision]));
  const seen = new Set();
  const approved = [];
  const summary = {
    batch_candidates: matchedBatch.length,
    approved_nonexplicit: 0,
    skipped_hold: 0,
    skipped_reject: 0,
    unapproved_media_processed: 0,
  };

  for (const item of matchedBatch) {
    const id = item?.media_id;
    if (typeof id !== "string" || seen.has(id) || !decisions.has(id)) {
      throw new Error("Matched candidate absent/duplicated in signed review. Zero media accessed.");
    }
    seen.add(id);
    const decision = decisions.get(id);
    if (decision === "APPROVED_NONEXPLICIT") {
      approved.push(item);
      summary.approved_nonexplicit++;
    } else if (decision === "HOLD") {
      summary.skipped_hold++;
    } else if (decision === "REJECT") {
      summary.skipped_reject++;
    } else {
      throw new Error("Unknown reviewer decision. Zero media accessed.");
    }
  }
  if (approved.length + summary.skipped_hold + summary.skipped_reject !== matchedBatch.length ||
      verification.signature_valid !== true ||
      verification.validated_metadata_rows !== 4647) {
    throw new Error("Signed review reconciliation failed. Zero media accessed.");
  }
  return { approved, summary, verified_review: {
    metadata_signature_valid: true,
    reviewer_org: verification.reviewer_org,
    completed_at: verification.completed_at,
    signature_proves_content_safety: false,
  } };
}
