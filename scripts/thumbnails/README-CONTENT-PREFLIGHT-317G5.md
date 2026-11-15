# JB Premium Hub — Phase 317G-5 metadata preflight for next 50 eligible records

No public publishing in this phase. Earlier pilot and batch 5–29 completed (29 uploaded and linked, one short skipped). Batch offset 30–79 must first pass a metadata and qualified content-safety review. Title screening is a conservative signal, NOT evidence the contents are safe, and renaming a title does not verify a video.

## 1. Export title metadata from Supabase SQL Editor

Run the read-only query in \`scripts/thumbnails/export-review-titles-317g.sql\`, or:

    SELECT id::text AS media_id, title
    FROM public.media
    WHERE type = 'video'
    ORDER BY id;

Export the **full 4,647-row CSV** to \`Downloads\JB_317G_titles.csv\`. Do not send it in chat or commit it; it may contain sensitive titles. The SQL reads no video content and does not modify the database.

## 2. Install preflight script

From the existing temporary Phase 315 project directory in PowerShell:

    git fetch origin phase-317g-5-content-preflight
    git restore --source=FETCH_HEAD --worktree -- scripts/thumbnails/preflight-next-50.mjs scripts/thumbnails/test-preflight-next-50.mjs
    node --check .\scripts\thumbnails\preflight-next-50.mjs
    node --test .\scripts\thumbnails\test-preflight-next-50.mjs

Restore local Phase 317D output path if it isn't already set:

    $env:JB_THUMBNAIL_OUTPUT_DIR = Join-Path $env:USERPROFILE "JB_Thumbnail_Batch_317D"

## 3. Run metadata-only preflight

    $csvPath = Join-Path $env:USERPROFILE "Downloads\JB_317G_titles.csv"
    (Import-Csv -LiteralPath $csvPath | Measure-Object).Count

Expected: 4647. Then:

    node .\scripts\thumbnails\preflight-next-50.mjs --csv="$csvPath"

The script checks exact IDs against frozen 4,647-record R2 matching and first-five verified publication receipt, selects next 50 candidates (old eligible queue indexes 30–79), and writes only ID and review states to:

    C:\Users\vivz0\JB_Thumbnail_Batch_317D\phase317g-0030-0079-content-preflight.json

All 50 candidates remain unapproved. Flagged titles and blank metadata are held. Even unflagged titles require a qualified adult content-safety review; metadata alone cannot demonstrate that a video is appropriate or legal.

Do not run \`batch-generate --offset=30\`, \`--approve\` or \`--publish\` for batch 30–79 until content review is complete. This preflight does not alter access, playback, subscription, or current thumbnails.
