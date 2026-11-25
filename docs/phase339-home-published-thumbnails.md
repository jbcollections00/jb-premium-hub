# Phase 339 — Home cleanup and approved-thumbnail display

**Home UI:** The `PH Pinay / Asian` button, filter logic, and one-option admin category tagging UI are removed. Deep links carrying `?cat=pinay_asian` safely become `All Videos`. `All Videos` and `Free to Watch` continue to work with existing membership gates and Supabase query rules. The database category values are not deleted or modified.

**Published covers:** Previously published Nature and Jungle videos have saved JPEG private previews but their `media.thumbnail_url` currently contains the public default JB logo. Until the separate public-assets R2 bucket is definitively configured, Home and Most Watched can show saved JPEG covers using the same-origin `/api/jb-published-thumbnail?id=<media_uuid>` route.

The route:
- Requires a current `public.media` video row AND a committed `jb_media_publication_links` row.
- Requires the link to identify the expected private staging row with uploaded video and saved JPEG.
- Validates the exact approved private R2 MP4 and JPEG object keys tied to uploader and media UUID.
- Verifies R2 HEAD content type `image/jpeg`, size 1–1,048,576 bytes, then JPEG magic bytes. It never exposes video bytes, presigned R2 URLs, R2 access keys, or unpublished staging previews.
- Returns a JPEG only after publication. Caches for a short duration; missing/unavailable artwork falls back to the JB logo in the browser.
- Uses existing server-side Supabase and private-R2 credentials already required for the working upload flow; no new permissions, account tokens, database migration, upload, or manual backfill are required.
- Does not modify `media.thumbnail_url` or any published media record. Existing custom/public thumbnails retain precedence.

**Tradeoff:** This read-only endpoint is a safe working fallback, not the final low-cost public-assets CDN destination. On large catalogs, complete verified server-side copy to the public-assets R2 bucket and migrate covers off this proxy after confirming the actual public bucket name/origin. Do not guess bucket mapping.

Test with a paid/admin account on the production Home page after successful CI+deployment. Check images for both published Nature and Jungle and confirm video playback. FREE users still see only selected Free-to-Watch media.

Rollback: Revert Phase 339 PR. Phase 336 streaming, 337 uploads, and 338 publishing remain unchanged.
