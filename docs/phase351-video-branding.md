# Phase 351 — Admin video branding (PRE-PRODUCTION)

## Current implementation
- Admin Workspace > Video branding: admin-authenticated upload of MP4 intro, transparent PNG watermark, and PNG official logo to PRIVATE R2.
- Private API stores versioned settings at `branding/settings/current.json` and validates assets with R2 HEAD before activation.
- FFmpeg *offline processor* makes an MP4 with intro FIRST (no logo or watermark), followed by original main video with bouncing watermark constrained to frame and fixed bottom-right logo.
- Clean thumbnails always extracted directly from the **original main video** starting near 0.25 s, before ANY overlays are applied. Portrait gets 3 panels, landscape gets 1.
- Orientation/resolution derived from main video; intro is scaled/padded to fit, never distorted.
- The original uploaded file is not overwritten.

## Important: not connected to automatic VIP download yet
The script is a local/offline processor, **not a deployed queue worker**. The existing protected playback/download infrastructure MUST NOT be switched to this script or given direct original-object download access. Before production:
1. Provision trusted processing runtime with FFmpeg (a controlled container/VM/worker, not Vercel's request handler or Cloudflare Worker).
2. Connect protected source R2 downloads, private versioned processed-file uploads, processing queue/retries, and DB status with service role credentials kept server-side.
3. Update the existing ticket signer and private R2 Worker to use ONLY a verified branded file for VIP download, fail closed while absent/unready. Recheck FREE/STANDARD/VIP/admin restrictions.
4. Add reliable lifecycle cleanup for processed variants when media/assets are deleted or replaced.
5. Test clean thumbnail, portrait/landscape output, intro/logo timing, VIP download bytes, seeking, audio, interrupted encode, and billing/RLS regressions.

## Local test
```bash
node --test scripts/tests/test-phase351-video-branding.mjs
node scripts/tests/smoke-phase351-video-branding.mjs
npm ci
npm run build
```
The smoke generates synthetic videos; it does not touch any private media.
```bash
node scripts/video-branding/process.mjs \
  --main /private/original.mp4 \
  --intro /private/intro.mp4 \
  --watermark /private/watermark.png \
  --logo /private/logo.png \
  --output /private/processed.mp4 \
  --thumbnail /private/clean-thumbnail.jpg
```

## Admin setup
The private R2 signing API must have the same environment as `api/jb-admin-staging-upload.js`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `JB_STAGING_R2_BUCKET_NAME=jb-premium-private-videos`. Configure Cloudflare R2 CORS to allow the admin web origin for the signed PUT; configure the correct `Content-Type` header.

Branding assets must be uploaded by authorized admins only. Uploading branding does NOT retroactively reprocess videos. Config updates are not transactionally version-locked for concurrent administrators; only one admin should edit settings at a time until CAS versioning is added. Branding versions must be pinned per processing job to prevent a mid-job settings switch.

## Important rights and operational notes
- Only upload media and logos that you have permission to process and redistribute.
- A moving watermark is not a DRM guarantee.
- No production deployment or R2 data migration is performed by this branch.
