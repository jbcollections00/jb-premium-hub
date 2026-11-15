# JB PREMIUM HUB — Phase 315: Free to Watch

## Approved settings

- Administrator selects **at most 20** video records.
- Initially **0** selected: existing media stays members-only.
- Registered Free users may watch an approved video **unlimited times**.
- Free users never gain download rights, full-library rights or member billing entitlements.
- Standard/VIP keep their pre-existing access and PayMongo behavior.
- Admin can remove or replace selections at any time.
- Events and checkout, webhook, settlement, and subscriber SQL are unaffected.

## Complete replacement / new files

- `supabase/migrations/20261115120000_jb_free_preview_v1.sql` — immutable default false, admin selection RPC, 20-slot DB trigger, read-only IDs discovery
- `src/pages/admin/AdminMediaTab.jsx` — admin toggle, 20-slot counter, confirmation and unavailable-state behavior
- `src/pages/public/Home.jsx` — Free to Watch filter, video badges, locked-video upgrade prompt and signed free playback
- `src/services/freePreview.js` — authenticated one-time request for short-lived video URL
- `api/free-preview-url.js` — secure authorization, private R2 GET signer and fail-closed switches
- `src/components/VIPVideoPlayer.jsx` — prevents signed URL referer leak
- `.github/tests/free-preview-fixture.sql` and `.github/tests/free-preview-assertions.sql` — automated privilege and cap regression
- `.github/workflows/jb-free-preview-security.yml` — PostgreSQL 16 tests, NO DEPLOY
- `.github/workflows/jb-subscribe-ui-review.yml` — Vite build, existing paid/ads regression and new guard assertions

## Why separate private authorization is required

The React badge/toggle is **never** the permission boundary. `/api/free-preview-url` independently:

1. Requires a matching same-site Origin and logged-in Supabase JWT.
2. Calls `auth.getUser()` server-side.
3. Reads the requested `media` row using the server-only Supabase key, and requires `type='video'` and `is_free_preview=true`.
4. Parses only a trusted R2 CDN URL rooted at `videos/` and signs **GET**, never PUT or DELETE.
5. Returns a signed R2 URL expiring in 900 seconds, with `Cache-Control: no-store`.
6. Has no watch-count restriction. A new short-lived link is requested when the user reopens the video.

The backend is **OFF BY DEFAULT**. The two flags below must intentionally be enabled.

### CRITICAL: current CDN may be public

This GitHub repository does **not** contain the deployed `jb-private-media-ticket` Edge Function or the Cloudflare private R2 Worker implementation. Current Home media records include CDN URLs and may be played directly when private-media UI is disabled.

If `cdn.jb-premium-hub.vip/videos/<key>` or a public `r2.dev` URL can be opened anonymously and returns media bytes, **the full library is not protected by a paywall**, even if React hides it. Neither the database flag nor the new signer changes that.

**Do not call the feature secure or merge to production until the video bucket is verified private, unauthenticated direct CDN GET is denied, and existing Standard/VIP users continue to play through an authenticated ticket mechanism.**

### Backend environment configuration (Vercel)

These environment variables are read **only on the server**. Never prefix server secrets with `VITE_`.

| Variable | Requirement |
|---|---|
| `SUPABASE_URL` | Existing Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing Vercel server-only Supabase key |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 credentials authorized for **GET on the private video bucket** |
| `R2_PUBLIC_URL` | Canonical metadata URL/host for stored `media_url` values, used only for key parsing |
| `R2_FREE_PREVIEW_BUCKET_NAME` | Explicit **private video bucket** whose object keys match `videos/<key>`. There is no implicit fallback to the public upload bucket |
| `JB_FREE_PREVIEW_ENABLED` | Must be exactly `true` when ready |
| `JB_FREE_PREVIEW_PRIVATE_STORAGE_CONFIRMED` | Must be exactly `true` only after private storage and direct URL checks |

The key must exist in the private bucket with the same `videos/...` path referenced by `media.media_url`. If migrating to a different bucket, copy/repoint files **without exposing the private bucket publicly**. The existing public-asset bucket for thumbnails should remain separate.

### Deploy order — do not skip

1. Inspect Supabase media schema and policies (the migration assumes `public.media.id` is UUID, `type` is text, `media_url` is text, and `public.is_current_user_admin()` exists).
2. Review the full SQL; apply it in Supabase SQL Editor. It adds a column and trigger/RPC but **does not select any video**.
3. Confirm the SQL fixture tests pass for a fresh PostgreSQL database. Test admin selection and non-admin rejection on the real project after migration.
4. Confirm the video objects are on **private** R2 and direct anonymous CDN URLs cannot fetch paid videos. Confirm current paid membership playback still works.
5. Configure `R2_FREE_PREVIEW_BUCKET_NAME` for that private bucket and test cross-origin video playback/Range (including seeking).
6. On a protected preview environment, enable both flags and test a single sample video.
7. Check: Free can watch the approved video repeatedly; unapproved media gets 403; Free cannot download; Standard/VIP see the same paid features and VIP remains ad-free.
8. Select up to 20 as admin; verify the 21st selection is rejected both by RPC and raw SQL. Remove a free video to free a slot.
9. After tests and owner approval, merge and deploy with explicit rollout. Do not change PayMongo settings.

### Caveats

- A short-lived signed URL can be used until it expires. Removing the free flag blocks new tickets but cannot revoke a previously issued URL immediately.
- R2 GET and CORS configuration must support video Range requests. On a long video, a new ticket may be required after the 15-minute URL expiration if the browser performs a late seek.
- Free playback deliberately does not collect a watch count for monetization or billing. The existing player view-logging behavior remains unchanged.
- The server never accepts a client-supplied R2 URL, signing key, subscription level or video file key.
