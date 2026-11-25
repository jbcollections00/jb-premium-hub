# Phase 338 — Admin Review & Publishing

Use **Media Manager → Private Album Upload → Review & Publish** to review staged MP4 files.

## Verified backend
- Existing database publisher: `public.jb_publish_staged_media_v1(uuid,uuid,text)`, `SECURITY DEFINER`, service-role only. The browser **never** calls it directly.
- New actions on `/api/jb-admin-staging-upload`: `review-list`, `review-video`, `publish`.
- All actions require Supabase-verified admin JWT and strict first-party origin.
- Review-list returns only private uploads owned by this admin, with signed short-lived private JPEG previews and a duplicate warning; published items are visibly labeled.
- Review-video returns a short-lived **private R2 GET** after checking deterministic staging path, admin ownership, and R2 HEAD metadata.
- Publish requires explicit rights confirmation, duplicate acknowledgement when necessary, checks staging is pending_review, file MIME and size, exact key, R2 HEAD, and publication link idempotency. It then calls the *existing* trusted publisher RPC server-side with the validated admin ID.
- The DB publisher also requires a visible album and inserts video into the protected `public.media` member catalog (`is_free_preview=false`).
- Incomplete uploads are never eligible. Previously published files are idempotent.
- No automatic publishing is performed on page load, upload completion, or queue refresh.

## Thumbnail publication
Private thumbnails remain in the private bucket until an admin publishes. By default, publishing uses the existing default JB Collections logo as the *public cover*, not an unpublished private signed URL. The optional verified copy to the public assets bucket is supported only with:
- Server-only `JB_PUBLIC_THUMBNAIL_R2_BUCKET_NAME` set to the R2 bucket actually served at `assets.jb-premium-hub.vip`.
- Server-only `JB_PUBLIC_THUMBNAIL_ORIGIN=https://assets.jb-premium-hub.vip`.
- Server credentials with **GET** access to the private bucket and **PUT/HEAD** to that public assets bucket.

If those settings are absent, unverified, or R2 copy fails, publishing still uses the existing default JB logo. Do not guess the name of the public assets bucket. Other public files and billing settings are unaffected.

## QA / release gates
- Run `node --test scripts/tests/test-phase338-publishing.mjs`, Phase 337 regression, and `npm run build`.
- Inspect Preview Admin > Media Manager > Private Album Upload > Review & Publish.
- Verify private playback (admin), duplicate warning, rights confirmation checkbox, and publish disabled until explicit authorization.
- Do NOT publish the temporary Nature/Jungle test files without confirming rights and explicit intentional publication.
- Recheck database counts, publisher service-role restrictions, and production status after release.
- To revert UI/API only, revert Phase 338 PR. The existing Phase 336 ticket issuers and Phase 337 private uploader remain independent.
