# Phase 318 — static default JB Collections thumbnail fallback

This is a presentation-only change to two Home video-card layouts. No new video previews, thumbnails, content processing, video/storage mutation, database writes, or access changes.

## Behavior
- Existing stored thumbnails (embedded images and approved public-assets URLs) continue to display.
- Missing/blank thumbnail URLs use the shared default JB Collections logo automatically through the existing resolver.
- Broken images use the existing single-attempt local /jb-logo.png fallback.
- Video URLs are never fetched merely to synthesize thumbnail card images. This removes the previous conditional video #t=1 card fallback.
- This does not publish any new video-frame thumbnails and does not clear content for publication.

## PowerShell local verification
From the JB Premium Hub working copy:

    git fetch origin phase-318-static-thumbnail-fallback

    git restore --source=FETCH_HEAD --worktree -- src/pages/public/Home.jsx scripts/tests/test-thumbnail-display.mjs

    node --test .\scripts\tests\test-thumbnail-display.mjs

    npm run build

Check authenticated Home and Most Watched cards across FREE/STANDARD/VIP roles:
- Existing covers remain visible.
- Missing covers show the static JB Collections logo.
- Broken images fall back to the local logo.
- No card-only #t=1 video metadata requests.
- Playback/access restrictions remain enforced as before.

Do not commit private media inventory, local moderation CSVs or .env.local.
This display-only change does not authorize publication of any unreviewed video-frame images.
