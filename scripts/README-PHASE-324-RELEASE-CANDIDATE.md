# Phase 324 — Unified thumbnail fallback + route performance release candidate

## Scope

This branch combines two previously independently tested draft changes:
- Phase 318 / PR #24 — static JB Collections fallback for missing or broken video card covers; preserves stored covers and never fetches a video for its card-only preview.
- Phase 320 / PR #25 — code-split 17 lazy-loaded page components under existing route guards, preserving 20 paths, redirects, and EventPopup.

There are no changes to media database rows, Cloudflare R2 buckets, private-media URLs, membership authorization, checkout, or published thumbnails.

The fallback displays the neutral JB Collections logo for video records with blank thumbnail_url. It does not create, distribute, or publish video-frame images.

## Safety and release

**DRAFT ONLY; NOT deployed.** Prior library metadata exposed indicators requiring independent qualified adult review for potential child exploitation. Retain the production release hold until responsible moderation/legal staff independently confirm site readiness. Title changes and metadata heuristics are not content clearance.

## Local integration verification

From your existing JB Premium Hub working folder in PowerShell, first check for local edits you wish to preserve:

    git status --short -- src/App.jsx src/pages/public/Home.jsx

To copy the exact integration files into the current working tree (this overwrites listed working-tree files; do not run if you need to preserve unrelated edits):

    git fetch origin phase-324-thumbnails-performance-integration

    git restore --source=FETCH_HEAD --worktree -- src/App.jsx src/pages/public/Home.jsx scripts/tests/test-thumbnail-display.mjs scripts/tests/test-route-code-splitting.mjs

Then run one integrated regression suite and production build:

    node --test .\scripts\tests\test-thumbnail-display.mjs .\scripts\tests\test-route-code-splitting.mjs

    npm run build

Expected: 10 total unit tests PASS (6 thumbnails and 4 routes); build PASS. This does not replace browser auth, content review, or production smoke testing. If the local build passes, this branch is technically ready for independent release review, not automatic public deployment.

Database snapshot from user read-only query: 4,647 videos; 1,001 embedded image covers; 29 generated/published covers; 262 saved default-logo values; 3,355 blank/missing thumbnail_url values. Display fallback is expected to cover blank values wherever Home cards render, but 100% live production coverage has NOT been verified.
