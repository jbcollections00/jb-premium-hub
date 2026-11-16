# Phase 320 — route-specific code splitting (non-content performance improvement)

The latest local Vite production build succeeded but reported a JS chunk larger than 500 kB. This change lazy-loads the app's route page components, so the browser does not need all page modules on the initial route. **This does not guarantee a specific bundle reduction until a fresh build is measured.**

## Scope and safeguards
- The same 20 route paths stay registered, with the same redirects.
- Existing `ProtectedRoute` wrappers remain unchanged, including admin-only handling.
- Existing `EventPopup` and `MainLayout` behavior remains unchanged.
- Changes are confined to `src/App.jsx` plus source regression tests.
- No media URLs or content inspected; no changes to Supabase, Cloudflare R2, subscriptions, pricing, login logic, or thumbnail publishing.
- This PR is draft and is **not** deployed.

## PowerShell verification
From your working JB Premium Hub repo:

    git status --short -- src/App.jsx

If this is empty (no local work to overwrite):

    git fetch origin phase-320-route-code-splitting

    git restore --source=FETCH_HEAD --worktree -- src/App.jsx scripts/tests/test-route-code-splitting.mjs

Then run:

    node --test .\scripts\tests\test-route-code-splitting.mjs

    npm run build

Expect 4 unit tests to pass. In the build output compare the initial JS chunk and number of additional page chunks against the previous ~1,148.71 kB entry JS. It may still show some warnings from other libraries.

## Manual functional regression before any release
Check login, sign-up, password reset, logout, /home, account, /subscribe, legal pages, /messages, and admin route on desktop/mobile. The route transition may display a brief accessible "Loading page…" status on first visit.

**Release remains gated on separate independent content-safety/legal clearance** of flagged media in the library. Do not merge or deploy on a passed build alone.
