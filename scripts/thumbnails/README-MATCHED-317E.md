# Phase 317E-5: matched-only batch preview generation

Existing pilot success:
- Source private bucket \`jb-collections-hub\` contains 5,824 video objects.
- Supabase full 4,647-row audit: 4,647 uniquely matched, 0 missing/ambiguous.
- 1,001 records have embedded thumbnails (preserve); 3,646 are missing/default-logo (eligible).
- Previous Phase 317D local JPGs (30) remain in the same output directory and their progress state is reused.

This feature **generates only private local JPGs**, using exact video object keys in the private \`media-r2-matching-audit.json\` report. It does not upload to public R2, write Supabase, or change live video access. Every generated preview remains REVIEW_REQUIRED until explicitly approved for publication.

## From the same temporary pilot repository PowerShell directory

Ensure your existing variables are set, keeping actual secrets private:

    $envFile = Join-Path "C:\Users\vivz0\OneDrive - Department of Education\Desktop\JB Collections Assets\jb-premium-hub (2)\jb-premium-hub" ".env.local"
    $env:JB_THUMBNAIL_SOURCE_BUCKET = "jb-collections-hub"
    $env:JB_THUMBNAIL_OUTPUT_DIR = Join-Path $env:USERPROFILE "JB_Thumbnail_Batch_317D"

Fetch only the relevant new files, without switching production branches:

    git fetch origin phase-317d-thumbnail-batch
    git restore --source=FETCH_HEAD --worktree -- scripts/thumbnails/batch-generate.mjs scripts/thumbnails/matched-queue.mjs scripts/thumbnails/test-matched-queue.mjs

Tests (no R2 calls):

    node --check .\scripts\thumbnails\batch-generate.mjs
    node --test .\scripts\thumbnails\test-matched-queue.mjs

Confirm the **existing full** match report was generated from 4,647 records:

    $reportPath = Join-Path $env:JB_THUMBNAIL_OUTPUT_DIR "media-r2-matching-audit.json"
    $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    $report.counts | Format-List csv_rows,matched_unambiguous,matched_ambiguous,missing_from_current_r2_bucket,with_embedded_thumbnail,with_default_or_missing_thumbnail

Before processing, make a private local copy of the existing progress manifest:

    $progressPath = Join-Path $env:JB_THUMBNAIL_OUTPUT_DIR "progress.json"
    if (Test-Path -LiteralPath $progressPath) { Copy-Item -LiteralPath $progressPath -Destination "$progressPath.pre-317e.bak" -Force }

First FIVE eligible videos only:

    node --env-file="$envFile" .\scripts\thumbnails\batch-generate.mjs --generate --matched --require-count=4647 --limit=5 --offset=0

After reviewing those five, next 25 eligible videos:

    node --env-file="$envFile" .\scripts\thumbnails\batch-generate.mjs --generate --matched --require-count=4647 --limit=25 --offset=5

Important: offsets apply only to the **3,646 missing/default-logo matches**, ordered by media_id, NOT to the original 282-object R2 videos/ inventory.

The same \`progress.json\` and SHA256-of-object-key output filenames are retained so previously created files can be reused for corresponding eligible videos. The script never processes the extra unreferenced video objects in R2.

No public upload and no database update. Publication workflow is a later, separately reviewed phase.
