# Phase 317G-6 — ID-only adult moderator review handoff

Next batch: eligible offsets 30–79, with 50 rows from the completed 317G-5 metadata preflight. All 50 are pending independent content review. A title-screening result of zero matches is NOT proof of safe video content.

This tool reads the completed **private local** \`phase317g-0030-0079-content-preflight.json\`, validates all 50 exact IDs, and writes a **local CSV with just offsets, UUIDs, and review states**.

It never opens or retrieves videos, never generates thumbnails, never publishes images, and never changes Supabase, Cloudflare R2, or site access.

## PowerShell — from existing Phase 315 temporary repo

    git fetch origin phase-317g-6-review-handoff

    git restore --source=FETCH_HEAD --worktree -- scripts/thumbnails/create-review-handoff.mjs scripts/thumbnails/test-review-handoff.mjs

    node --check .\scripts\thumbnails\create-review-handoff.mjs
    node --test .\scripts\thumbnails\test-review-handoff.mjs

    $env:JB_THUMBNAIL_OUTPUT_DIR = Join-Path $env:USERPROFILE "JB_Thumbnail_Batch_317D"

    node .\scripts\thumbnails\create-review-handoff.mjs --run

Expected: 50 records, all 50 require qualified adult review, zero approved to publish. The tool creates:

    C:\Users\vivz0\JB_Thumbnail_Batch_317D\phase317g-0030-0079-adult-review-handoff.csv

Hand this file to an appropriately trained adult moderator with organizational authority to independently assess applicable content safety and legal requirements, using their authorized system. **Do not view or forward concerning videos, thumbnail stills, or direct media links in chat.** If potential child sexual exploitation is suspected, refer the case to appropriate child-protection reporting authorities.

The handoff file itself **does not authorize publication** and its reviewer status should remain pending until independent verification is completed. No automatic generation or publication step has been connected to this CSV.

Existing 29 published thumbnails remain untouched by this tool. Any concerning already published material must be separately assessed promptly by responsible content safety personnel.
