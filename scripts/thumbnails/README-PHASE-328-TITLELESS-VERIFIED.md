# Phase 328 — thumbnail-first titles for independently cleared items only

## User request

Remove visible video titles on public cards while retaining individual thumbnails.

## What is implemented (draft; not deployed)

- Most Watched cards, main video grid and video modal check a **verified non-explicit ID allowlist** before removing visible title text.
- Matching thumbnail ALT text becomes generic for titleless items.
- Admins keep the original titles.
- Database title, internal metadata, category search, sharing, moderation logs, playback rights, VIP, Standard, Free logic, and ad placement remain unchanged.
- All unreviewed media **retain their original displayed titles**. This prevents hiding concerning metadata to sidestep independent content review.

**The allowlist starts EMPTY** in src/services/verifiedTitlelessPresentation.js. There is NO verified independent clearance evidence yet in this repo. Accordingly this draft deliberately makes no videos titleless as initially submitted. The feature must not be enabled en masse based on a blanket "all green" or renamed titles. Verified lawful, non-explicit IDs require documented independent adult moderation evidence before inclusion.

## Windows PowerShell — tests

    git fetch origin phase-328-reviewed-titleless-cards

    git restore --source=FETCH_HEAD --worktree -- src/pages/public/Home.jsx src/services/verifiedTitlelessPresentation.js scripts/tests/test-verified-titleless-presentation.mjs

    node --test .\scripts\tests\test-verified-titleless-presentation.mjs

    npm run build

Expected: 6 unit tests PASS and build PASS. Not yet run on user's local computer.

## Safety and release

This changes presentation only; it does not review media content, remove titles in Supabase, suppress internal audit information, or change content access control. Do not merge or deploy until independent content safety review and deployment authorization are complete. PR #26 remains draft.
