# Phase 317G — reviewed batch thumbnail publishing (25–50 videos)

**Current verified baseline (2026-11-15):**
- 4,647 Supabase media rows are exact-matched to existing private R2 objects.
- 1,001 embedded thumbnails are preserved.
- First 5 new thumbnail URLs (Phase 317F) are already published and visually approved.
- Persistent Phase 317D local progress: 59 reviewed-required JPGs and 1 short video excluded from generation.
- The full matching report is a FROZEN snapshot from before those 5 updates; 3,646 were originally eligible. **Always start at offset 5**. This script enforces that and validates the first 5 pilot publishing receipts.
- The short video remains on the default JB Collections logo.

This feature **does not alter source videos, membership gates, PayMongo, or Supabase automatically**. No site code changes. It does publish individual reviewed images to a public R2 bucket when explicitly instructed.

## Local steps (Windows PowerShell, from existing JB_Phase315_Deploy temporary repo)
Your local .env.local must still include both original private R2 and dedicated public-assets R2 credentials, kept outside GitHub. Do not share their values.

    $envFile = Join-Path "C:\Users\vivz0\OneDrive - Department of Education\Desktop\JB Collections Assets\jb-premium-hub (2)\jb-premium-hub" ".env.local"
    $env:JB_THUMBNAIL_SOURCE_BUCKET = "jb-collections-hub"
    $env:JB_THUMBNAIL_OUTPUT_DIR = Join-Path $env:USERPROFILE "JB_Thumbnail_Batch_317D"

    git fetch origin phase-317g-reviewed-thumbnail-batches
    git restore --source=FETCH_HEAD --worktree -- scripts/thumbnails/publish-batch-rules.mjs scripts/thumbnails/publish-reviewed-batch.mjs scripts/thumbnails/test-publish-batch-rules.mjs
    node --check .\scripts\thumbnails\publish-reviewed-batch.mjs
    node --test .\scripts\thumbnails\test-publish-batch-rules.mjs

### A. PREPARE (local-only)
Existing matched-only batch offset 5, limit 25 generated 24 images + one SKIPPED_SHORT in the previous run:

    node --env-file="$envFile" .\scripts\thumbnails\publish-reviewed-batch.mjs --prepare --offset=5 --limit=25

This produces:
- \`phase317g-0005-0029-review.html\` (static gallery, local files only).
- \`phase317g-0005-0029-approval.json\` (private, all approval flags false).

To view gallery:

    Start-Process (Join-Path $env:JB_THUMBNAIL_OUTPUT_DIR "phase317g-0005-0029-review.html")

Visually inspect the **24** JPGs for accuracy and suitability for public display. Do not publish if any image is not approved. The skipped video stays at the default logo.

### B. APPROVE (only after visual review)
An intentional one-command human approval; no image is auto-approved by generation:

    node --env-file="$envFile" .\scripts\thumbnails\publish-reviewed-batch.mjs --approve --offset=5 --limit=25 --confirm-reviewed=I_REVIEWED_THE_IMAGES

This only changes the local approval manifest. No R2 upload occurs.

### C. PUBLISH (explicit public image upload after approval)

    node --env-file="$envFile" .\scripts\thumbnails\publish-reviewed-batch.mjs --publish --offset=5 --limit=25 --confirm-public-upload=I_APPROVE_PUBLICATION

The command uploads approved JPGs to \`jb-collections-public-assets\` with names containing media.id + image SHA256, using only the dedicated bucket-scoped publisher key. Verifies R2 object bytes and public URL bytes against the approved local JPEG, checkpoints a receipt per item, and generates guarded SQL. When interrupted, rerun the exact command and it verifies/resumes existing objects without overwriting them.

Files:
- \`phase317g-0005-0029-receipt.json\` — private verified public image receipt.
- \`phase317g-0005-0029-apply.sql\` — **manual** guarded SQL, NOT automatically run.

### D. APPLY GUARDED SQL (separate deliberate step)
Review the generated SQL file, then copy it into the Supabase SQL Editor only if EVERY public URL was verified and appears correct. SQL checks each exact media.id, source host, source R2 key, and old thumbnail state, and verifies that all expected rows have the new URL in the SAME transaction. Rolls back the whole batch on a mismatch. It is idempotent for already-applied rows.

After success, run a separate SELECT to verify all new thumbnail URLs. Check a few Home video cards manually.

### Future batches
Generate the NEXT unprocessed 50 matched videos with existing generator:

    node --env-file="$envFile" .\scripts\thumbnails\batch-generate.mjs --generate --matched --require-count=4647 --limit=50 --offset=30

Then use the same \`--prepare\`, \`--approve\`, \`--publish\` sequence with \`--offset=30 --limit=50\`. Resume/checkpoints preserve completed images. Future ranges must not overlap or include the first five already published.

**Security:** Private inventory, progress, matching audit, approvals, gallery and SQL are local-only. Never commit files under \`JB_Thumbnail_Batch_317D\` or credentials to GitHub.
