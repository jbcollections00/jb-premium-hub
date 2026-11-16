# Phase 327 — independent signed clearance check (metadata only)

**Goal:** Validate externally reviewed content status for all 4,647 video IDs without relying on an unverified blanket "all green" statement. This code does NOT create thumbnails, read videos, publish anything, change user access, grant approvals or update Supabase.

## Required inputs from qualified independent adult content-safety reviewer

The authorized independent review organization must follow its own secure inspection and reporting process. It may provide an ID-only signed JSON manifest and detached Ed25519 signature, with the public key fingerprint authenticated using a trusted *separate* channel. Never accept a public key as verified merely because it accompanies the manifest. Do not send video files or images here.

Review manifest (illustrative schema, NOT a clearance):

    {
      "schema": "jb-independent-clearance-v1",
      "reviewer_org": "Independent review organization",
      "reviewer_id": "verified-moderator",
      "completed_at": "2026-11-15T12:00:00Z",
      "source_index_sha256": "SHA256_OF_EXACT_LOCAL_PHASE326_CSV_BYTES",
      "items": [
        {
          "media_id": "00000000-0000-4000-8000-000000000001",
          "decision": "HOLD",
          "reviewed_at": "2026-11-15T11:00:00Z"
        }
      ]
    }

The final signed items array must cover **all 4,647 original video IDs exactly once**. Decisions: APPROVED_NONEXPLICIT, HOLD or REJECT. This sample is incomplete and is not an authorization to publish.

## Local tests

From JB Premium Hub local repo in PowerShell:

    git fetch origin phase-327-independent-review-attestation

    git restore --source=FETCH_HEAD --worktree -- scripts/thumbnails/verify-independent-clearance.mjs scripts/thumbnails/test-independent-clearance.mjs

    node --check .\scripts\thumbnails\verify-independent-clearance.mjs
    node --test .\scripts\thumbnails\test-independent-clearance.mjs

The actual independent review verification needs the manifest, detached signature, reviewer public key and an independently authenticated SPKI SHA-256 fingerprint:

    $env:JB_THUMBNAIL_OUTPUT_DIR = Join-Path $env:USERPROFILE "JB_Thumbnail_Batch_317D"

    $env:JB_TRUSTED_REVIEWER_SPKI_SHA256 = "<independently-authenticated-reviewer-key-fingerprint>"

    node .\scripts\thumbnails\verify-independent-clearance.mjs --verify `
      --manifest="C:\secure-review\review-results.json" `
      --signature="C:\secure-review\review-results.json.sig" `
      --reviewer-public-key="C:\secure-review\reviewer-public-key.pem"

The verifier emits metadata counts only. No allowlist, extraction, upload, publishing, or deployment is performed. Cryptographic provenance cannot prove that the reviewer actually performed adequate inspection. Never self-sign or fabricate an approval or treat the signature as an automatic release authorization.

As some source metadata raised concerns about possible child sexual exploitation, suspected material must not be accessed or distributed; escalate appropriately to child-protection reporting authorities. No unverified media is eligible for bulk video-derived thumbnails.

PR #26 and #27 remain draft; this phase is also held from production.
