# Phase 317F — first 5 thumbnails publication gate

**Safety contract**: A verified video mapping is NOT approval to publish content. Existing embedded/custom thumbnails must not be changed. This stage reuses the FIVE first matched-only JPGs in the Phase 317D persistent local output directory. It does not re-extract videos. Prepare and publish are two separate, explicit operator actions.

## Setup
In the **temporary pilot repository** PowerShell:

    git fetch origin phase-317f-approved-thumbnail-publish
    git restore --source=FETCH_HEAD --worktree -- scripts/thumbnails/publish-five-approved.mjs
    node --check .\scripts\thumbnails\publish-five-approved.mjs

Existing variables from earlier:
    $env:JB_THUMBNAIL_OUTPUT_DIR = Join-Path $env:USERPROFILE "JB_Thumbnail_Batch_317D"
    $env:JB_THUMBNAIL_SOURCE_BUCKET = "jb-collections-hub"
    $envFile = Join-Path "C:\Users\vivz0\OneDrive - Department of Education\Desktop\JB Collections Assets\jb-premium-hub (2)\jb-premium-hub" ".env.local"

## Step A: prepare checklist — strictly no network or DB changes

    node --env-file="$envFile" .\scripts\thumbnails\publish-five-approved.mjs --prepare

This validates full 4,647-row exact R2 matching, the first five eligible records (missing/default only), the SHA256 digest of each local JPG, media IDs and original object keys. Creates PRIVATE JSON with five approved=false flags in:

    C:\Users\vivz0\JB_Thumbnail_Batch_317D\phase317f-five-approval.json

Open and visually inspect the five JPGs. Do NOT approve images that are not appropriate for public display. To approve, edit ONLY each \`approved\` flag from \`false\` to \`true\` in the private JSON, saving the file. Do not change any ID, filename, object key, or checksum. Never share or commit this JSON.

## Step B: configure scoped public-assets R2 write credentials

Use an R2 API key scoped to the dedicated public-assets bucket, with Object Read+Write (not private video storage). Add the following PRIVATE server-only values to your LOCAL .env.local (never include \`VITE_\` prefixes):

    JB_PUBLIC_R2_ACCESS_KEY_ID=<key>
    JB_PUBLIC_R2_SECRET_ACCESS_KEY=<secret>

Target bucket is hardcoded as \`jb-collections-public-assets\`; target public image origin is \`https://assets.jb-premium-hub.vip\`. R2_ACCOUNT_ID is already in your local .env.local.

## Step C: publish ONLY five approved images, with explicit confirmation

    node --env-file="$envFile" .\scripts\thumbnails\publish-five-approved.mjs --publish --confirm-public-upload=I_REVIEWED_5_IMAGES

- Uses immutable object names including media UUID + SHA256 prefix.
- Never overwrites a different existing image.
- Re-reads local image SHA256 after approval.
- Verifies R2 GetObject read-back contents AND public origin GET hash.
- If a public image fails verification, stops before creating SQL.
- Does NOT update Supabase directly.

If all five verified, creates two PRIVATE local files:

    phase317f-five-published.json
    phase317f-five-apply.sql

## Step D: guarded database update — manual and separate

Open \`phase317f-five-apply.sql\` in a text editor, review the five rows, and then paste into Supabase SQL Editor. This SQL runs as one transaction, updates only when **media.id + existing video host + full object key + old thumbnail status** all still match, and aborts/rolls back if fewer than 5 rows qualify. It modifies only \`thumbnail_url\`. This prevents assigning a JPG to a different video or replacing an embedded/custom cover.

Never run Step D unless all five public image URLs work and look correct.

No live-site code changes, no private video URL exposure, and no PayMongo modifications are part of Phase 317F.
