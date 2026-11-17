# Phase 333J — Private Album Upload (admin-only, draft)

## Delivered

- Admin Dashboard → Media Manager → **Private Album Upload** replaces the old public bulk upload form.
- Admin chooses an existing album first, selects video files, then uploads directly to the **separate private R2 bucket** through an authenticated server-issued signed PUT URL.
- New server endpoint `api/jb-admin-staging-upload.js`:
  - validates the signed-in admin, album ID, video extension and size (maximum 2 GB per file);
  - creates only an admin-only row in `public.jb_media_upload_staging` with `awaiting_upload` status;
  - issues a short-lived PUT URL to the **explicitly configured separate private bucket**;
  - verifies object size/type with HeadObject before changing status to `pending_review`.
- Admin can refresh and see the private upload queue.
- The old **public** R2 signer now refuses video types/folder requests with HTTP 410.
- The old bulk upload form is not rendered and its handler rejects attempts to use it.
- No `public.media` INSERT, thumbnail extraction, public video URL, membership watch link, or automatic publication occurs.

## One-time setup requirements (not performed by GitHub commits)

1. Review and apply `supabase/migrations/20261117_phase333j_private_album_upload_staging.sql` to the **intended** Supabase project. It adds an RLS-restricted staging table, without changing public.media. Confirm the admin RLS helper `is_current_user_admin()` is present (already checked in Phase 333I).
2. In Cloudflare, confirm the existing **jb-premium-private-videos** bucket has **Public Access Disabled**, no R2.dev URL and no public custom domain. The former `jb-collections-hub` and the public assets bucket must not be used for private staging.
3. For the preview deployment's server environment, explicitly set:
   - `JB_STAGING_R2_BUCKET_NAME=jb-premium-private-videos`.
   - Existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server-only).
   - Existing `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (server-only), granted private-bucket PUT and HEAD permissions.
   - `R2_BUCKET_NAME` must **not** equal `JB_STAGING_R2_BUCKET_NAME`; the old signer and the new private uploader must use different buckets.
   - Optional `JB_STAGING_ALLOWED_ORIGIN` as the **exact** Vercel preview origin for cross-origin tests. Don't add `*`.
4. Private R2 bucket CORS must explicitly allow authenticated admin browser origins and PUT with the `Content-Type` header. No public GET/HEAD access.
5. For a local Vite browser to call the new endpoint, set the existing `VITE_R2_SIGNER_URL` to the deployed **preview** origin, or run a local Vercel API server. A bare `npm run dev` serves frontend assets only, not the new `/api` function.
6. **Do not paste or commit R2, Supabase service-role, or user secrets.** Verify server env in the Vercel dashboard, never with frontend `VITE_` secrets.

## QA (only the new feature)

From the clean Phase333-Albums worktree:

```powershell
git status --short
git fetch origin phase-333j-private-album-staging-upload
git switch --detach origin/phase-333j-private-album-staging-upload

node --test .\scripts\tests\test-private-album-staging.mjs
npm run build
```

Local UI test: Admin → Media Manager → Private Album Upload → select `Educational Videos`. The form should require the album. Try a neutral, legally cleared **non-explicit** small test video only in the **private preview** environment with correctly configured staging. The successful result is `Pending review` in the admin queue and 0 new public.media entries. Check that no video card appears on Free, STANDARD/VIP Home.

## Explicit release boundary

This PR is a **private upload intake only**, not a public media publishing system. Existing legacy catalog hold remains on. The publication workflow must separately enforce independent lawful-content clearance and membership-specific server-side authorization before moving/approving objects for access. FREE member videos require their own reviewed 20-selection rule; upload-to-album alone does not grant public playback.

This branch is a **draft** stacked atop Phase 333I. The PR is not merged, no Supabase migration is applied by this commit, no R2 credentials have been configured by this commit, and **no production release has occurred**.
