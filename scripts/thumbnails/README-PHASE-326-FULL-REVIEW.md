# Phase 326 — Full-library review index (metadata only)

This consolidates the **full 4,647-video catalog** into one ID-only, pending-content-review index for a qualified adult content-safety moderator. It replaces the repetitive 50-ID administration workflow. It does not access video content or release any thumbnails.

Latest user-verified snapshot:
- 4,647 videos.
- 1,001 original existing covers.
- 29 generated covers already uploaded and linked to media records.
- 3,617 still need individual video-derived covers (including default-logo records and blank thumbnail fields).
- None of the above metadata confirms the suitability or safety of any video.

## Safe validation inputs

The script reads the already present **private local** files:
- media-r2-matching-audit.json
- phase317f-five-published.json
- phase317g-0005-0029-receipt.json

These live in the folder configured with JB_THUMBNAIL_OUTPUT_DIR. Never upload these private local JSON files or generated review indexes to public GitHub.

## PowerShell usage (from existing JB Premium Hub local repo)

    git fetch origin phase-326-full-library-review-index

    git restore --source=FETCH_HEAD --worktree -- scripts/thumbnails/create-full-library-review-index.mjs scripts/thumbnails/test-full-library-review-index.mjs

    node --check .\scripts\thumbnails\create-full-library-review-index.mjs

    node --test .\scripts\thumbnails\test-full-library-review-index.mjs

    $env:JB_THUMBNAIL_OUTPUT_DIR = Join-Path $env:USERPROFILE "JB_Thumbnail_Batch_317D"

    node .\scripts\thumbnails\create-full-library-review-index.mjs --run

Expected: 4,647 total rows, 1,001 original covers, 29 published covers, 3,617 remaining cover candidates, 4,647 pending independent content-safety review, zero publication approvals. The local output file is:

    C:\Users\vivz0\JB_Thumbnail_Batch_317D\phase326-full-catalog-adult-review-index.csv

This contains only UUIDs, inventory group and pending-review status. **No video links, thumbnails, titles, credentials or media paths.** It cannot be used to grant content-safety clearance. The script checks provenance of the 29 known publication receipts and fails closed if they do not match frozen records.

## Next step / limitation

Pass the ID-only index to an authorized, qualified adult content-safety moderator using their organization's established secure process. Do not view, download or distribute potentially exploitative media for this purpose. If potential child sexual exploitation is suspected, escalate it to the appropriate child-protection reporting authorities and restrict relevant public access.

**Do not run bulk video-frame extraction, thumbnail-publication or website release for unreviewed or unsafe material.** Successful catalog reconciliation is not a content review. Once actual cleared, lawful media is identified, individual thumbnail generation can resume for that verified subset through an appropriate reviewed workflow.
