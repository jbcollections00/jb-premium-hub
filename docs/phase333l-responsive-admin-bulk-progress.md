# Phase 333L — Mobile admin sidebar and bulk upload progress

## Changes

- Admin sidebar becomes a full-height slide-out drawer on phones, tablets and narrow browser windows. Menu button opens it; Close, backdrop, Escape, or workspace selection closes it. Desktop sidebar behavior is preserved at `lg` widths and above.
- Admin Private Album Upload accepts multiple video files in one selection (already supported) and now displays live per-file and overall **byte-transfer** percentages.
- The upload queue clearly differentiates queued, preparing, uploading, server-verifying, completed and failed items. Failed files do not automatically halt the rest of a batch. Transfer progress is measured using `XMLHttpRequest.upload.onprogress` for each signed private R2 PUT.
- Mobile controls wrap to available width. The signed PUT remains a direct browser-to-private-R2 upload, never a playback URL.
- No new SQL, R2 CORS or Vercel environment variable is required for the responsive UI or progress indicator.

## Limitations

- Progress is for **data transfer**, not an estimate of server completion; success is shown only after the existing backend R2 HEAD check and `pending_review` staging update.
- Bulk upload is sequential for low-memory/mobile stability. It requires keeping the current browser tab open; resumable multipart uploads and retry-by-chunk are **not** implemented. A failed file must be reselected for a new attempt.
- The new private uploader **does not automatically generate video-derived thumbnail images**. The existing `thumbnailDisplay.js` only displays already-approved thumbnail URLs, or the common JB Collections logo fallback. Do not claim automatic thumbnail generation is tested.
- The previously uploaded official music video is a copyrighted example. Do not distribute/publish it without rights. Any archival or deletion must honor legal/evidence-preservation requirements.
- **No public media publishing** is added. Staging rows remain private and pending review; existing backend hold and independent clearance requirements are unchanged.

## Focused verification

From the existing local checkout, only when `git status --short` is clean:

```powershell
Set-Location "$env:USERPROFILE\JB_ReleaseCandidates\Phase333-Albums"
git status --short
git fetch origin phase-333l-responsive-admin-bulk-progress
git switch --detach origin/phase-333l-responsive-admin-bulk-progress

node --test .\scripts\tests\test-responsive-admin-bulk-progress.mjs .\scripts\tests\test-private-album-staging.mjs
npm run build
```

Preview UI checks (no need for another credential/API check): Open Admin Dashboard in a phone-sized browser window and confirm hamburger navigation and Escape/Close; open Media Manager → Private Album Upload and select two **original, non-explicit, rights-authorized** sample files to validate individual percentages, overall percentages, and `pending_review` statuses in **protected Preview** only.

## Deployment

Draft only, stacked on Phase 333J. No production merge/deploy performed. Even after the Preview test succeeds, live public video publishing requires separate trusted backend content clearance and membership authorization.
