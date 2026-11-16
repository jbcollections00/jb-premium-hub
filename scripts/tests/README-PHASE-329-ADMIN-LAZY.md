# Phase 329 — Admin workspace lazy-load optimization

This draft splits nine optional Admin Dashboard tab modules into independent lazy-loaded JavaScript chunks. It does not alter media catalog, thumbnail generator, title visibility, billing logic, Supabase permissions or admin route guards.

## Why
The user-verified Vite build reported AdminDashboard at 532.58 KB (nonblocking bundle warning). AdminDashboard imported every tab statically, even when not opened.

## Change
- React.lazy on Support, Access Codes, Users, Messages, Media Manager, Billing, Chat Reports, Chat Analytics and Events.
- Single Suspense boundary with accessible status message while loading an active tab.
- Overview page, all existing props, active-tab IDs, admin auth and navigation remain unchanged.
- The Recharts dependency on the Overview still loads with Admin Dashboard. Bundle-size improvement is **not yet measured**; it requires the user's Vite build output.

## PowerShell (from existing JB Premium Hub checkout)

    git fetch origin phase-329-admin-dashboard-lazy-tabs

    git restore --source=FETCH_HEAD --worktree -- src/pages/admin/AdminDashboard.jsx scripts/tests/test-admin-lazy-workspaces.mjs

    node --test .\scripts\tests\test-admin-lazy-workspaces.mjs

    npm run build

Expect four tests and a build success. Check the new size of AdminDashboard in the output. The final bundle impact must be measured, not estimated.

## Release condition

This is a draft-only performance change to administration. It does not authorize publishing or accelerating distribution of any video content. Existing release gates for potentially exploitative media remain in place.
