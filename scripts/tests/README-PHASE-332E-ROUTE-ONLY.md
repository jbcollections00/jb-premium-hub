# Phase 332E — Restore route splitting without media changes (DRAFT)

## Why this branch exists
- Permanent independent Phase 332D admin-only checkout passed 23/23 unit tests and Vite build, but its main entry remained 784.54 KB (gzip 227.93 KB), triggering a >500 KB performance warning.
- Earlier optimized Phase 315 working directory loaded 17 page routes lazily and had an entry around 245.52 KB. That optimization originally came from a PR that also touched public video thumbnails.
- This new branch starts on Phase 332D admin-only branch, and copies **only** the route-level lazy-loading App.jsx from the previous optimized work. It does not change Home.jsx or any thumbnail/video code.

## Change and safety scope
- App.jsx: React.lazy for 17 route-level components with Suspense loading fallback.
- scripts/tests/test-route-code-splitting.mjs: four tests for route parity, admin guards, redirect paths and fallback.
- Admin Dashboard retains nine separate lazy-loaded tabs from the parent Phase 332D branch.
- No billing, payment, role/entitlement, Supabase SQL, media rights, thumbnail generation, media metadata or public Home page code is changed here.
- Release remains DRAFT pending isolated build verification and separate content-safety restrictions on unverified media.

## Verify in existing permanent Phase 332D checkout (Windows PowerShell)

Backup current App.jsx first, then fetch only the two route-splitting files, preserving the current checkout and all admin changes.

    $backup = Join-Path $env:USERPROFILE ('JB_App_Backup_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
    New-Item -ItemType Directory -Force -Path $backup | Out-Null
    Copy-Item .\src\App.jsx (Join-Path $backup 'App.jsx')
    git fetch origin phase-332e-admin-only-route-splitting
    git restore --source=FETCH_HEAD --worktree -- src/App.jsx scripts/tests/test-route-code-splitting.mjs
    node --test .\scripts\tests\test-route-code-splitting.mjs .\scripts\tests\test-admin-lazy-workspaces.mjs .\scripts\tests\test-admin-billing-reliability.mjs .\scripts\tests\test-admin-users-presence-profile.mjs .\scripts\tests\test-admin-live-paid-tiers.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Regression failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }

Expected 27 unit tests and Vite build PASS, but do NOT claim a specific bundle reduction until measuring the actual output. This uses no new packages and does not require another npm ci.

## Review npm audit (non-mutating)

    npm audit --omit=dev
    npm audit

The previous npm ci reported 3 moderate vulnerabilities, but their packages, versions, and production-vs-development scope have not yet been inspected. Do NOT run npm audit fix blindly; inspect output first.

## Restrictions
- Do not merge/deploy any public video or thumbnail changes from earlier draft PRs as a side effect of this performance work.
- User data and untracked secrets from the previous temporary and OneDrive checkouts remain untouched.
- A working admin UI is not evidence that unreviewed potentially exploitative video content is safe to publish.
