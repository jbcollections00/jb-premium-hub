# Phase 333 — Admin Users online presence + profile labels

## Verified existing-source issues

1. Admin Dashboard owns the Supabase online-users channel; AdminUsersTab also opened a duplicate channel, removing the preexisting one. Switching tabs could leave online counts stale.
2. Profile account_type/role fields were easily mistaken for the user's current paid membership entitlement. The backend billing entitlement is separate.
3. Filter dropdown did not request a dark browser color scheme, unlike the rest of the admin UI.

## Changes

- Users reuses the shared onlineUserIds Set from parent AdminDashboard, without a second presence subscription.
- Badges say Standard profile, Legacy VIP profile or Admin role. Do not imply verified paid status.
- Filters classify Admin/VIP/Standard/Guest separately.
- Accessible label and dark theme on the native filter select (browser/OS determines popup rendering).
- Profile-fetch failures are visible. Late fetch results after lazy unmount are ignored.
- No SQL, payment, role, entitlement or administrator-action changes. Ban/delete/impersonate/membership actions retain existing behavior.

## Windows PowerShell — optimized Phase 315 temp folder

Do not run git reset, git clean, or remove untracked files.

    git fetch origin phase-333-admin-users-presence-profile-fix

    git restore --source=FETCH_HEAD --worktree -- src/pages/admin/AdminUsersTab.jsx src/pages/admin/AdminDashboard.jsx src/services/adminUserProfileView.js scripts/tests/test-admin-users-presence-profile.mjs

    node --test .\scripts\tests\test-admin-users-presence-profile.mjs

    npm run build

Expected: 6 tests PASS and production build PASS. Ten authoring checks passed, but actual user-side Node/Vite test outputs are not yet available.

## Manual browser QA

At localhost Admin > Users: check profile count, search/filter, navigating away/back and Online Now count. Check Admin > Billing still loads/refreshes. No destructive Ban/Delete, live payments or content changes needed.

Draft only. No production deployment; unrelated thumbnail/content safety holds remain.
