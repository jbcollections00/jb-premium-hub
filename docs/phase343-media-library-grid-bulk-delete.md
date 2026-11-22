# Phase 343 — Media Library: 4–5 columns, 50/page and safe bulk deletion

## User-facing changes
- Media Manager → Media library uses responsive **4 columns at xl width / 5 at 2xl**, and 3/2/1 on smaller screens. Existing video cards, thumbnails and FREE toggles are preserved.
- Shows **50 media records per page**, with existing next/previous pagination and full-library search retained.
- Each card has a selector. **Select current page** selects up to 50 visible media items. Selection is cleared when page, search, duplicate filter or tab changes. No invisible cross-page selection.
- **Delete selected (N)** is disabled unless N>0. Requires a warning confirmation and typing `DELETE N` exactly before any deletion. Individual trash uses same secure API.
- The new code does **not** run delete automatically; no media changes are made by the migration, build, or deployment.

## Safety and source-of-truth behavior
The legacy direct `supabase.from('media').delete()` single-item route failed on linked published videos because `jb_media_publication_links.media_id` uses `ON DELETE RESTRICT`. The new route `delete-published-media` on the existing authenticated admin staging API addresses this safely:
1. Verify Supabase JWT and current admin profile before the action.
2. Accept only 1–10 unique UUIDs/request, reject unconfirmed deletion.
3. Call **service-role-only** `jb_admin_delete_published_media_v1` with the server-verified admin ID. Function validates admin role again, applies deterministic row locks and validates all media before mutation, deletes publication links, media rows and associated staging rows atomically. If one fails, all changes in that request roll back. Reactions/comments/views are cascaded by existing foreign keys.
4. Keep `jb_admin_media_delete_audit` as a permanent RLS-protected record including deletion actor, timestamp and R2 cleanup status.
5. Delete verified `staging/<uploader>/<staging-id>.mp4` and `staging-thumbnails/<uploader>/<staging-id>.jpg` only from the private `jb-premium-private-videos` R2 bucket. Keys come from trusted database metadata, never client input. If cleanup fails or times out, the durable audit remains `pending` and the UI reports the affected media IDs.
6. Legacy objects served from unrelated/external/public buckets are **not** deleted by guessing a path; the UI notes legacy storage unchanged. They may need a separate deliberate storage cleanup.

This action deletes **published media permanently**, including its history; it is different from the Phase 341 **Delete unpublished draft** workflow. All administrative deletion must be intentional. Do not run test deletions on existing published media without explicit authorization.

## Release and validation
- CI: Phase 343 14 tests + 337–341 security regressions + Vite build.
- Install the SQL migration in Supabase before deploying the API. The migration installs only function/table/grants and **does not delete any media**.
- Verify service-role-only function permissions and audit table RLS.
- Preview check: page-size label 50, 4/5 column desktop layout, card and select-all checkboxes. Confirm that clicking Cancel on the confirmation prompt performs no deletion.
- Do **not** exercise a live delete without an explicitly designated disposable media record. Check that published counts remain unchanged after release.
