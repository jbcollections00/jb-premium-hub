# Phase 332C — Consolidated Admin Release Candidate (DRAFT)

## Scope

Includes the previously verified admin fixes in one stacked branch, without merging or deploying any user media:
- Phase 329: nine lazy admin workspaces; local 4/4 tests passed; AdminDashboard reduced from ~532.58 KB to ~383.71 KB.
- Phase 330: read-only Billing display/refresh improvements; local 6/6 tests and Vite build passed.
- Phase 333: shared Users/Dashboard presence, correct profile filter/feedback; local 6/6 tests and Vite build passed.
- Phase 334: authorized read-only LIVE membership tier report (Free/Standard/VIP); user confirmed browser display.
- Phase 332B: user confirmed browser regression checks 5/5 (Overview, Users, Billing, Support, Media Manager).

This branch is based on the unmerged Phase 329 admin branch. Its parent PR #30 also depends on the earlier Phase 324 optimized routes. All those pull requests remain draft. Do NOT merge or deploy without resolving those dependencies.

This consolidation also updates the older Phase 329 test to accept the new Users onlineUserIds prop.

## Combined local verification — optimized Phase 315 temporary checkout

The source fixes and Supabase read-only RPC have already been installed in that local working folder. The only newly corrected test file is the Admin lazy-workspaces test. DO NOT delete or reset local files.

    git fetch origin phase-332c-admin-release-candidate

    git restore --source=FETCH_HEAD --worktree -- scripts/tests/test-admin-lazy-workspaces.mjs

    node --test .\scripts\tests\test-admin-lazy-workspaces.mjs .\scripts\tests\test-admin-billing-reliability.mjs .\scripts\tests\test-admin-users-presence-profile.mjs .\scripts\tests\test-admin-live-paid-tiers.mjs

    npm run build

Expected: 23 unit tests PASS (4 + 6 + 6 + 7), production build PASS. Previous verified optimized output: entry ~245.52 KB, AdminDashboard ~383.73 KB. Check actual build output; do not assume it will be identical.

## Protection boundaries

- No payment settlement, checkout mutations, entitlement grants, account deletions, thumbnail generation or private R2 media actions in this PR.
- SQL function grants read-only reporting to authenticated callers after server-side admin check; does not rewrite payment data.
- Do not run git reset/clean or stage untracked temp files.
- Admin UI test success is NOT media content-safety clearance.
- Unreviewed media publication remains on hold because of earlier potential child-exploitation concerns; no bulk thumbnail extraction, title suppression for flagged media or full-site release may bypass that hold.
