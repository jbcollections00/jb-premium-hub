# Phase 337 — Protected video intake (deployment candidate)

This branch integrates the previously tested Phase 333N **private staging only** upload workflow into the verified Phase 336 production frontend, without reverting Supabase paid/free ticket functions, Cloudflare Worker, or PayMongo logic.

## What the admin sees
- **Media Manager → Private Album Upload** instead of the legacy public R2 video uploader.
- Select an existing admin-controlled album (e.g., Educational Videos), select multiple **MP4 videos**.
- Sequential uploads with browser XHR byte progress **per file and overall**, plus Preparing / Uploading / Verifying / Done / Failed states.
- Automatically extract a *private admin-only* JPEG poster from local video bytes: landscape single frame, portrait 3 merged panels, seek near 22 seconds for long clips. If decoding fails, display the default JB logo.
- Pending-review files and signed private previews remain visible after reload; the browser cannot publish them directly.
- Small-screen sidebar is a drawer: menu, close, backdrop, Escape.

## Critical privacy boundaries
- Admin video PUT URLs come **only** from `/api/jb-admin-staging-upload`, pointing to `jb-premium-private-videos` and keys `staging/<admin_uuid>/<draft_uuid>.mp4`.
- API requires Supabase access token, validates admin role, stages metadata in `jb_media_upload_staging`, verifies R2 HEAD before `pending_review`.
- Old `/api/r2-upload-url` rejects video/folder uploads with HTTP 410; pre-existing thumbnail use is preserved.
- Private JPEG posters use `staging-thumbnails/` signed URLs, not public CDN objects. No media row, paid entitlement or FREE preview selection is created automatically.
- 2 GiB max single PUT, MP4 only. Resumable multipart uploads are **not** implemented.
- The publisher RPC currently allows only MP4; browser conversion for MOV/MKV/AVI/WEBM is **not** provided.

## Preconditions for Vercel
- `JB_STAGING_R2_BUCKET_NAME=jb-premium-private-videos` in the appropriate environment; MUST differ from legacy public `R2_BUCKET_NAME`.
- Valid server-only Supabase, R2 account and bucket credentials; never put R2 secrets in `VITE_*`.
- Private bucket CORS must permit application origin, PUT, Content-Type. GET signing for private JPEG preview also needs object read access.
- Existing Supabase tables `jb_media_albums`, `jb_media_upload_staging` and the already-applied `preview_key` / `preview_uploaded_at` columns. Do not rerun historical migrations blindly.
- Existing admin RLS read permissions and service-role staging writes remain enforced.

## Verification required before production release
- GitHub Action tests and Vercel Preview build.
- Preview: admin navigates on phone-sized browser; selects album and two small, original rights-authorized MP4 videos; verifies per-file and total progress, private pending_review status, and saved private thumbnails after refresh.
- Verify no media is visible to FREE/STANDARD/VIP before trusted publication and public video signer refuses an MP4.
- No public posting/publishing occurs from the staging UI. A separate reviewed publisher workflow is required before uploaded videos appear in member library.

## Rollback
Revert the Phase 337 frontend/API commit. The pre-existing Phase 336 paid and FREE playback issuer deployments are independent and must remain unchanged.
