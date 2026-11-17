# Phase 333I — Different Home pages for FREE vs member accounts (draft)

## Requested behavior

- **FREE users**: Home features a dedicated Free to Watch hero and Free to Watch Media Library tab only. Member-only Most Watched, All Videos and admin-created album tabs are not rendered.
- **STANDARD / VIP / Admin**: Home shows Most Watched, Media Library, All Videos, and the dynamic album filter tabs from the Admin Album Manager. FREE tab may additionally appear for members when enabled by existing configuration.
- On membership expiry or downgrade, any saved album URL filter is reset to Free to Watch and the rendered video list is filtered so stale member cards cannot flash on screen.
- FREE home never falls through to the full media-table query. When available, its future listing comes from the existing admin-curated Free to Watch RPC, which must enforce a max of 20 and omit private video URLs.
- This does not change membership pricing, payments, R2, admin uploads, or media storage.

## Content-safety / production boundary

The current hardcoded legacy catalog hold remains ON. Phase 333I does **not** turn on video playback or publish any unreviewed files. The FREE Home shows a neutral preparation message until separately verified, permitted Free to Watch content has passed server-side controls and the hold is replaced by a new-media-only approved publication process.

Client-side presentation is not security. Existing album-directory SQL allowed *anonymous/FREE* clients to query visible album names even when UI tabs were hidden. A new additive migration **20261117_phase333i_member_album_read_rls.sql** removes that public SELECT policy, revokes anon SELECT, and gates member-album metadata on trusted active STANDARD/VIP entitlements (plus existing valid legacy VIP and the existing Admin SELECT policy).

**Do not apply the new SQL migration unreviewed.** It assumes the existing zero-argument public.jb_billing_my_access() returns tabular tier, can_view_albums and access_expires_at fields and public.profiles contains id, account_type and vip_until. If not, PostgreSQL should reject the transaction; adapt to the actual verified schema first. After application, validate account-level SELECT for FREE, STANDARD, VIP, and ADMIN. Empty thumbnails, old media records, and potential reporting/evidence preservation obligations remain separate issues.

## Windows local checks

Existing clean workspace (no new clone):
C:\Users\vivz0\JB_ReleaseCandidates\Phase333-Albums

1. git status --short
2. git fetch origin phase-333i-tier-home-views
3. git switch --detach origin/phase-333i-tier-home-views
4. node --test .\scripts\tests\test-home-tier-views.mjs .\scripts\tests\test-home-tier-album-rls.mjs
5. npm run build
6. npm run dev

Local browser QA: login as FREE, verify Free to Watch only, no albums even with ?cat=album:<uuid>. Login as STANDARD or VIP, verify member albums appear and Free layout is gone. Existing legacy media remains held for all tiers.

No production or database changes were made by this branch. Keep PR draft until backend authorization and release readiness are verified.
