# Phase 332D — Admin-only release candidate (DRAFT)

## Verified stacked dependencies
- PR #26: main -> route lazy split and public Home thumbnail fallback
- PR #30: on top of #26 -> nine lazy Admin workspaces
- PR #35: on top of #30 -> Billing, Users, active LIVE Free/Standard/VIP
- PR #29 titleless video UI: separate, excluded

This branch is **based directly on main**, avoiding automatic inclusion of any public Home or media changes from PR #26. Admin fixes only; not deployed.

## Admin-only scope
- Three admin pages: AdminDashboard, AdminBillingTab, AdminUsersTab
- Three UI data helpers: adminBillingDisplay, adminMemberTierView, adminUserProfileView
- Four regression suites and read-only admin-authorized paid entitlement SQL
- No changes to src/App.jsx, src/pages/public/Home.jsx, video player, thumbnails, publishing, entitlement settlement or content access
- The isolated branch does NOT include site-wide route lazy splitting; main entry bundle may be larger than the previous 245 KB optimized checkout.

## Create permanent clean checkout on Windows

Use a **new PowerShell window**. The steps do not alter the existing OneDrive checkout or temporary Phase 315 working directory and do not copy .env files or untracked data.

    $destination = Join-Path $env:USERPROFILE 'JB_ReleaseCandidates\Phase332D-AdminOnly'
    if (Test-Path -LiteralPath $destination) { throw 'Folder already exists; nothing overwritten' }
    New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
    git clone --branch phase-332d-admin-only-release-candidate --single-branch https://github.com/jbcollections00/jb-premium-hub.git $destination
    if ($LASTEXITCODE -ne 0) { throw 'Clone failed' }
    Set-Location -LiteralPath $destination
    git status --short
    git branch --show-current
    node --test .\scripts\tests\test-admin-lazy-workspaces.mjs .\scripts\tests\test-admin-billing-reliability.mjs .\scripts\tests\test-admin-users-presence-profile.mjs .\scripts\tests\test-admin-live-paid-tiers.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Combined regression failed' }
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }

Do not run git reset, git clean, or overwrite an existing local folder. Do not commit private environment files or secrets.

## Evidence and release hold
- Earlier optimized temporary checkout: combined 23/23 tests passed; Vite build PASS, main 245.52 KB and AdminDashboard 383.73 KB.
- Local admin-browser smoke checks: user reported 5/5 PASS.
- The new independent main-based branch has **NOT** yet been built or tested by the user; previous bundle figures do not transfer.
- Existing admin-only Supabase RPC need not be reinstalled if already working.
- No merge/deployment authorized. The existing media collection still has unresolved independent content-safety clearance requirements, and no unverified video content or thumbnails are published as part of this change.
