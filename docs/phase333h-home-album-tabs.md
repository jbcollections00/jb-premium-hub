# Home Album Category Tabs — UI-only draft

This change matches the requested Home layout:

- **Most Watched** remains above the **Media Library**.
- **Explore Albums** no longer appears as a separate large card section.
- The Media Library filter row shows **All Videos**, the existing conditional **Free to Watch**, and dynamically retrieved admin-created **album names**.
- The old fixed **Pinay / Asian** tab and its ad-hoc Home category tagging selector are removed.
- Visible album titles come from `jb_media_albums`, which already has admin-write RLS.
- Selecting an album uses `cat=album:<uuid>` in the page URL and visibly highlights its tab.

### Current limitation

This is a **metadata-only UI update**. The app does not yet have a verified, authorized video-to-album relation. Selecting an album therefore shows an empty state and never falls through to the unfiltered legacy media query. The default-on legacy catalog Home hold from Phase 333G remains in place, including client-side ticket suppression. Do not remove the hold or interpret it as server-side enforcement.

**No change** to public media permissions, Vercel production, Cloudflare, Supabase schema, PayMongo, or Admin Media uploader. No existing video file is read, republished, or deleted. A separate backend-reviewed upload and publication process is required before public video release.

### Verify

From the existing `Phase333-Albums` worktree (stop if `git status --short` shows uncommitted work):

```powershell
git fetch origin phase-333h-home-album-tabs
git switch --detach origin/phase-333h-home-album-tabs

node --test .\scripts\tests\test-home-dynamic-album-tabs.mjs .\scripts\tests\test-home-section-order.mjs .\scripts\tests\test-album-directory.mjs .\scripts\tests\test-album-artwork.mjs .\scripts\tests\test-legacy-catalog-home-hold.mjs

npm run build
npm run dev
```

At the local Home route, inspect the category row. After creating/hiding an album in the Admin panel, refresh or refocus the Home tab. The category list should reflect visible albums. Selecting an album shows the safe empty state.

Not merged and not deployed to production.
