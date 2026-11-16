# Phase 331 — Option B: automatic skip of flagged/unreviewed thumbnails

## Purpose

The thumbnail generator and publisher now enforce an **independently authenticated, complete, Ed25519-signed qualified adult review of the original 4,647 video IDs**. They cannot rely on text titles, filenames, a blanket "all green", or a user-created skip list.

- Only exact media UUIDs classified **APPROVED_NONEXPLICIT** can enter the private local thumbnail generation queue.
- **HOLD** and **REJECT** records are automatically skipped. Missing/duplicate/unreviewed IDs, invalid signatures, unknown reviewer identity/fingerprint or altered catalog IDs fail closed.
- Original full matched-queue offset and limit are preserved. Skipped items do not shift later batch positions.
- Legacy unsigned --generate and inventory-only generation paths now fail closed.
- The existing publisher validates the identical signed review before reading local JPGs, creating preview galleries, approving JPGs or uploading public assets.
- Source metadata and existing thumbnails are not overwritten; Supabase is never mutated automatically.
- A valid signature **does not prove actual content safety or authorize publication of otherwise prohibited material**. Human content-safety clearance and reporting still apply.

### Status

**Code only, draft PR.** No signed independent reviewer manifest/key was presented or independently authenticated; **zero new thumbnails have been generated or published in this phase**. Do not run video-frame extraction or publisher commands for unverified/suspect media.

### Local verification only (no media access)

From the JB Premium Hub project directory in PowerShell:

    git fetch origin phase-331-signed-thumbnail-review-gate

    git restore --source=FETCH_HEAD --worktree -- scripts/thumbnails/signed-review-thumbnail-gate.mjs scripts/thumbnails/batch-generate.mjs scripts/thumbnails/publish-reviewed-batch.mjs scripts/thumbnails/verify-independent-clearance.mjs scripts/thumbnails/test-signed-review-thumbnail-gate.mjs

    node --test .\scripts\thumbnails\test-signed-review-thumbnail-gate.mjs

    npm run build

Expected seven tests PASS and the frontend build PASS. Tests use ephemeral, synthetic test-only keypairs and dummy UUIDs; they cannot serve as actual reviewer clearance.

The unchanged private Phase 326 catalog index file is needed when **independent, verified review evidence** becomes available. Keys and review records must never be pushed to GitHub or included in screenshots.

### Restrictions

The source collection previously contained metadata suggesting possible child sexual exploitation. Do not view or distribute potentially exploitative media as part of review. Escalate suspected cases to the appropriate child-protection reporting authorities. Only independently cleared, lawful, non-explicit media may proceed to generation and publication.

Do not merge or deploy until the above conditions are verified.
