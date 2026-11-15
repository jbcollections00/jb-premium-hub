# Phase 317D-1: resumable thumbnail generation (local/private only)

This is the batch-ready successor to the successful Phase 317C five-video pilot. It does **not** replace pilot-generate.mjs.

## Rules
- Start at **23 seconds**, strictly past the 22-second intro.
- Landscape video: **one** JPG frame at 23 seconds.
- Portrait video: **three** frames, sampled at 23s, middle and near end, merged horizontally with **zero gaps** into a single JPG.
- Videos without enough post-intro footage are marked SKIPPED_SHORT; no intro fallback.
- Batch limits: 1 to 50 (25 recommended). Every processed item is checkpointed. Failed jobs are retried only when --retry-failed is supplied.
- Uses the private R2 video bucket for read-only access. All JPGs and private inventory keys stay on your computer. **No public uploads and no database writes.**
- Images must be reviewed and matched to the correct Supabase media.id before considering any publication workflow.
- Do not publish inappropriate or unauthorized image content.

## Requirements
- Node.js 22+, ffmpeg and ffprobe on PATH, npm ci already completed.
- Existing local .env.local with R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (never share or commit).
- JB_THUMBNAIL_SOURCE_BUCKET defaults to jb-collections-hub. Confirm actual private source.
- JB_THUMBNAIL_OUTPUT_DIR is strongly recommended: choose a **persistent private directory outside Windows Temp and OneDrive** to avoid lost work or accidental cloud sync.

## PowerShell commands, from temporary pilot repository root

    $envFile = Join-Path "C:\Users\vivz0\OneDrive - Department of Education\Desktop\JB Collections Assets\jb-premium-hub (2)\jb-premium-hub" ".env.local"
    $env:JB_THUMBNAIL_SOURCE_BUCKET = "jb-collections-hub"
    $env:JB_THUMBNAIL_OUTPUT_DIR = Join-Path $env:USERPROFILE "JB_Thumbnail_Batch_317D"

    git fetch origin phase-317d-thumbnail-batch
    git restore --source=FETCH_HEAD --worktree -- scripts/thumbnails/batch-generate.mjs scripts/thumbnails/batch-rules.mjs scripts/thumbnails/test-batch-rules.mjs

    node --test .\scripts\thumbnails\test-batch-rules.mjs
    node --env-file="$envFile" .\scripts\thumbnails\batch-generate.mjs --inventory

Review inventory counts, then start with a FIVE-video batch before processing 25:

    node --env-file="$envFile" .\scripts\thumbnails\batch-generate.mjs --generate --limit=5 --offset=0

Next page of 25, after reviewing the first five:

    node --env-file="$envFile" .\scripts\thumbnails\batch-generate.mjs --generate --limit=25 --offset=5

When a run is interrupted, rerun the same command to resume. Failures remain marked FAILED until explicitly retried with --retry-failed.

Outputs: private inventory.json, progress.json, and preview-*.jpg in JB_THUMBNAIL_OUTPUT_DIR.

Notes:
- Do not execute the old scripts/sync-r2.mjs as a workaround. It may write database rows.
- Never upload the private inventory/progress files or your .env.local to a public repository.
- ffmpeg invokes a short-lived private R2 signed URL during local processing, which may appear in OS process diagnostics. Don't share such command lines.
- For matching to Supabase media IDs, approved R2 upload and safe conditional DB updates, see Phase 317D-2 (not implemented here).
