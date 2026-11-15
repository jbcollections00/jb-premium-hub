# JB PREMIUM HUB — Phase 315 production cutover
**User-approved settings:** maximum **20** admin-selected Free to Watch videos; **unlimited repeat views**; no free downloads. Zero videos selected by default.

## Existing infrastructure — reuse, not rebuild
- Cloudflare Worker: `jb-premium-private-media-v1`, at `https://jb-premium-private-media-v1.jbnetproxy.workers.dev`
- R2 binding: `VIDEO_BUCKET` → `jb-collections-hub`
- Cloudflare Worker flags: `PRIVATE_MEDIA_ENABLED` (exactly `true` unlocks streaming)
- Shared secret: `JB_PRIVATE_MEDIA_HMAC_SECRET` (same secret in ticket issuer and Worker, keep private)
- Supabase paid issuer: `jb-private-media-ticket` — **unchanged**
- Supabase new free issuer: `jb-free-preview-ticket` — play-only; uses the SAME Worker HMAC and path format
- Vercel frontend gate: `VITE_JB_PRIVATE_MEDIA_UI_ENABLED=true` at **build time** (rebuild/redeploy is required after changing this)
- Supabase free issuer gate: BOTH `JB_FREE_PREVIEW_TICKETS_ENABLED=true` and `JB_FREE_PREVIEW_PRIVATE_CDN_CONFIRMED=true` (only AFTER the CDN is closed)

## Code and safety state
- Database migration `supabase/migrations/20261115120000_jb_free_preview_v1.sql` was already installed by owner; verified counts: **0/4646 free**, trigger=1, admin RPC=1.
- `src/pages/admin/AdminMediaTab.jsx`: admin-managed Free selection, 0–20 counter, RPC + database cap.
- `src/pages/public/Home.jsx`: Free to Watch category, video cards, locked upgrade CTA. The free category is hidden until the private UI build flag is enabled.
- `src/services/freePreview.js`: the free client invokes `jb-free-preview-ticket` and requires the expected private Worker URL. No direct R2/presigned S3 links.
- `supabase/functions/jb-free-preview-ticket/index.ts` and `ticket.ts`: independently verify signed-in Supabase user, read media row's `is_free_preview=true`, restrict action to `play`, parse video key, and sign a **15-minute PLAY-only HMAC ticket** accepted by the existing Worker. Disabled by default.
- `supabase/config.toml`: `verify_jwt=true` for the new issuer.
- Tests: PostgreSQL cap/role checks, TypeScript Edge function typecheck, original Worker fixture + HMAC/Range contract, frontend production build, and payment/ad regressions.
- The extra Vercel R2 signing endpoint was **removed** from the draft. No extra video streaming gateway is created.

## IMPORTANT: Current verified security gap (November 15, 2026)
A members-only video was accessible in an anonymous/InPrivate browser. Cloudflare R2 `jb-collections-hub` has BOTH:
- `cdn.jb-premium-hub.vip` custom domain: **Active / Access Enabled**
- `pub-...r2.dev`: public development URL **Enabled**.

**Disabling only one does not secure the bucket.** The Worker binding is not equivalent to public domain access; when both public URLs are disabled, the R2 binding continues to serve objects to the Worker.

### Do not change these settings prematurely
If `PRIVATE_MEDIA_ENABLED` remains `false`, Worker returns `503`. If `VITE_JB_PRIVATE_MEDIA_UI_ENABLED` remains `false`, Home can still use direct CDN URLs. Enabling the private UI while Worker is locked will stop playback. Closing both public entry points before protected player tests may also stop paid playback. Do not reveal HMAC secrets, JWTs, or signed video tickets in screenshots.

### Controlled LIVE cutover, with rollback
1. **Server first:** Confirm the existing `jb-private-media-ticket` is deployed with Verify JWT enabled. Enable `PRIVATE_MEDIA_ENABLED=true` on the existing Cloudflare Worker only, leaving both public CDN routes intact for now. Check no-ticket Worker GET → **403** (when unlocked; previously **503** when locked), and the authorized test ticket delivers video Range → **206**. Previously tested: FREE 403, Standard play 200/download 403, VIP/Admin 200/200. Reconfirm current deployed environment.
2. **Build-time frontend:** Set Vercel Production `VITE_JB_PRIVATE_MEDIA_UI_ENABLED=true` and redeploy the exact approved commit. Validate Standard and VIP video playback/seek/download permissions and FREE denial. The Home source has NO direct CDN fallback when this flag is true.
3. **Thumbnails audit:** Some existing `thumbnail_url` values may still point to the video CDN. Verify public-assets thumbnails (or local `/jb-logo.png` fallback) before public access is disabled. Public assets must use a separate public bucket/domain. Do not let a thumbnail test hold private videos hostage.
4. **Close BOTH public R2 entry points:** Cloudflare bucket `jb-collections-hub` → Settings → disable **Public Development URL**, then disable **Custom Domain Access** for `cdn.jb-premium-hub.vip`. Do NOT delete any bucket, object, Worker, or DNS record. Test anonymous direct video GET → denied and private Worker authorized playback → 206. If protected playback breaks, restore public access temporarily only as an emergency rollback and diagnose while avoiding sharing private URLs.
5. **Deploy free Edge issuer:** After staging and LIVE Worker verification, from a secure terminal using the existing Supabase CLI:
   ```powershell
   supabase functions deploy jb-free-preview-ticket --project-ref kwazrebdlzdkwdhrintr
   ```
   The shared `JB_PRIVATE_MEDIA_HMAC_SECRET` must be present in the Supabase project's Edge secrets (same value already used by paid tickets). Do not paste it into chat or frontend.
6. **Free preview activation, LAST:** After anonymous direct-CDN denial and authenticated paid playback pass, set Supabase Edge secrets `JB_FREE_PREVIEW_TICKETS_ENABLED=true` and `JB_FREE_PREVIEW_PRIVATE_CDN_CONFIRMED=true`. If any check fails, leave them unset/false. Neither switch grants download access.
7. **One-video test:** Select ONE sample video using Admin → Media Manager → **Make free**. FREE signed-in user plays and replays it using private Worker, an unselected video stays locked, FREE download remains disabled, Standard/VIP can still watch all content and VIP has zero ads. Remove the free selection if a problem arises. Add up to 20 only after validation.

## Deployment constraints
- The GitHub connector can commit/merge frontend code. It CANNOT itself change the live Cloudflare Worker flag, disable R2 public access, set Vercel Production environment variables, or deploy this Supabase Edge Function because those applications are not connected to this chat.
- Merging the code **does not switch** the Worker, private frontend, or free issuer on.
- Keep rollback path: Vercel previous deployment + `VITE_JB_PRIVATE_MEDIA_UI_ENABLED=false` if the Worker flow fails; do not call the site secured until both CDN public routes are closed.
- Existing PayMongo checkout, payment settlement, membership entitlements and Standard/VIP authorization RPC are untouched.
