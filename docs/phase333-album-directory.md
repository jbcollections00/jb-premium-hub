# Phase 333 — Dynamic album directory (DRAFT / metadata only)

## What is implemented

1. `public.jb_media_albums`: separate Supabase table with admin-only create/edit/hide/delete and publicly readable visible **album metadata**.
2. Admin Dashboard → **Albums**: create, rename, describe, show/hide, and delete album entries.
3. Existing signed-in Home page → **Explore Albums**: dynamic album cards; newly created visible albums appear after navigation/refresh or tab focus.
4. Card cover: neutral JB Collections logo, never extracted from a video.
5. Clicking an album expands its description and a pending video-publication notice. **It does not load or publish videos.**

## Deployment boundary

This is a **draft branch only**. Creating albums is not an authorization to publish potentially unsafe media. The earlier Supabase query still returned **4,647 old media records** even though the user may have emptied R2. The existing Home media grid remains unchanged in this draft branch, and the old media lifecycle must be handled separately. Do not promote this PR to production while unreviewed media access is unresolved.

No video extraction, re-upload, media insert, media album assignment, live-payment changes or storage deletion occurs in this phase.

## Database

Review and apply `supabase/migrations/20261116_phase333_media_albums.sql` in the target Supabase project **only after confirming the existing** `public.is_current_user_admin()` helper is the expected security-definer admin check.

- New records default to `is_visible = true`; anyone who can reach the Home page can view titles and descriptions.
- Hidden albums are visible to an authenticated admin but not to ordinary authenticated or anonymous users.
- Admin writes are enforced by RLS using `public.is_current_user_admin()`.
- Deletes affect only album directory metadata; there is no cascade to any video file or media record.
- Does not create a media foreign key, content-approval flag, or new media viewer access.
- Existing Home stays behind its current logged-in `ProtectedRoute` — this does **not** change the homepage into an anonymous public route.

## Tests

```powershell
git fetch origin phase-333-albums-draft
git switch --no-track -c phase-333-albums-draft FETCH_HEAD
node --test .\scripts\tests\test-album-directory.mjs
npm run build
```

## Still needed for full album uploads

- Protected server-side media intake and independent content clearance for new uploads.
- Durable video-to-album references and safe querying restricted to cleared, lawfully publishable media.
- Album-specific video pages after server-side enforcement is in place.
- Optional reviewed album cover upload to dedicated public-assets R2.

Keep PR in draft; do not enable unreviewed media publishing.
