# Phase 333M — Automatic *private* video-derived thumbnail previews

## Implemented

- On each **new** verified private video staging upload, the admin's browser seeks near the start of the original selected video file and creates a compact **JPEG thumbnail** (maximum 480x270 and 1 MB). This does not require a separate user-selected image file.
- Before uploading, the first 20 selected videos also get local-only previews directly in the Admin bulk upload progress list (to avoid decoding hundreds of videos in parallel on low-memory devices). Remaining files get their preview after the private upload. Local file-selection previews work in the Vite localhost UI even if no Preview backend is available.
- After the video has been verified as a private `pending_review` object, the admin-authenticated staging API issues a signed PUT URL for a matching JPEG in the **same non-public** `jb-premium-private-videos` R2 bucket.
- Backend HEAD verification checks image content type and byte size before saving `preview_key` in an RLS-protected staging row.
- The Admin Private Upload Queue uses an authenticated API to generate **short-lived** signed GET URLs for these private preview JPEGs. Existing drafts remain read-only; the preview survives a page refresh.
- When a video cannot be decoded or the private preview cannot be persisted, the admin UI falls back to the default JB Collections logo; verified video uploads are not lost or falsely marked as failed because of thumbnail extraction.
- No public-assets upload, public thumbnail URL, playback URL, automatic media record, or public publishing is performed. Thumbnail preview URLs are never returned to FREE/STANDARD/VIP member pages.

## Requires one additive SQL migration (Preview review before applying)

`supabase/migrations/20261117_phase333m_private_staging_thumbnail_preview.sql`

This adds `preview_key` and `preview_uploaded_at` to the existing `jb_media_upload_staging` table. Current RLS policy and grants remain unchanged. Run once after reviewing the target project and policy. No historical rows are deleted or changed.

No new Vercel Preview secret should be needed if Phase 333J private staging already works. Existing private R2 PUT/HEAD access already worked; private thumbnail retrieval additionally requires R2 signed GET permissions (normally available with object read access). The browser's `<img>` element uses the short-lived signed GET URL; the endpoint never puts images in the public-assets bucket.

## Local QA

On the existing clean checkout:

```powershell
Set-Location "$env:USERPROFILE\JB_ReleaseCandidates\Phase333-Albums"
git status --short
git fetch origin phase-333m-private-auto-thumbnail-preview
git switch --detach origin/phase-333m-private-auto-thumbnail-preview

node --test .\scripts\tests\test-private-thumbnail-preview.mjs .\scripts\tests\test-responsive-admin-bulk-progress.mjs
npm run build
```

Then test the **protected Vercel Preview** with a small **original, non-explicit, rights-authorized** MP4. Upload it privately to Educational Videos, verify both the new JPEG in the Admin progress list and the same thumbnail after refreshing the private queue. Revisit the queue when the signed GET has expired to confirm a fresh link is obtained. Verify Home does not display the pending-review image or video. Do not use the previously uploaded copyrighted official music video as a publishing test or auto-backfill its preview.

## Preview deployment note (2026-11-17)

GitHub Vercel status for the initial Phase 333M head reports **build-rate-limit on the Hobby plan** (upgrade-to-Pro URL), not a diagnosed compiler failure. Use the local Vite build and local no-upload preview first. Do not assume the newest branch is deployed on Vercel or click redeploy repeatedly while limited. Recheck build status later.

## Not implemented

- Public Home or album video thumbnails from unreviewed private media.
- Independent content-safety approval and rights verification.
- Publishing approved videos, membership video playback, or unlocking FREE/paid media.
- Background conversion of large batches of legacy files.
- Reliable frame extraction for browser-unsupported codecs (notably some MKV/AVI): default logo remains.
- Production release (draft branch only).

This is a pending-review *admin preview feature*. It does not bypass the existing media hold.
