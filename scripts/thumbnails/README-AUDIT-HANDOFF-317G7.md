# Phase 317G-7 — moderator handoff integrity audit (read-only)

Scope: verify the existing private 50-ID moderator handoff, NOT approve content or publicize thumbnails.

## Local PowerShell steps

Run inside the existing JB Phase 315 temporary repository:

    git fetch origin phase-317g-7-moderation-audit

    git restore --source=FETCH_HEAD --worktree -- scripts/thumbnails/audit-review-handoff.mjs scripts/thumbnails/test-audit-review-handoff.mjs

    node --check .\scripts\thumbnails\audit-review-handoff.mjs
    node --test .\scripts\thumbnails\test-audit-review-handoff.mjs

    $env:JB_THUMBNAIL_OUTPUT_DIR = Join-Path $env:USERPROFILE "JB_Thumbnail_Batch_317D"

    node .\scripts\thumbnails\audit-review-handoff.mjs --run

Expected result: 50 pending, 0 cleared, safe_to_publish=false. A local audit JSON is written next to the existing preflight/handoff files. File hashes are for tamper detection only, NOT evidence of content safety.

This script has no networking and makes no changes to Supabase, R2, playback, thumbnails, or access settings. It does not read video titles, media links, or images.

Publication remains on hold until actual content has been independently evaluated through an authorized adult content safety process. This audit is not an alternative to that review.
