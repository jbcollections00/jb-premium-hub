# Phase 334 — Admin Users: actual Free / Standard / VIP paid tiers

## Problem

The old Users UI labeled most of the 476 loaded profiles "Standard profile" because it relied on profiles.account_type. This is NOT verified payment status. The user reports 1 paid Standard and 1 paid VIP, but real counts must be read from the live backend rather than hard-coded.

## Fix

- New read-only, authenticated admin-only Supabase RPC: public.jb_admin_live_paid_tiers_v1()
- Returns one row for each account with a current, unrevoked, LIVE entitlement grant. VIP takes priority over Standard for users holding both.
- EXCLUDES provider_environment=test, revoked and expired grants. This does not grant access, update profiles, charge accounts or change subscription records.
- Users page joins those exact user IDs to the existing profiles on the client and labels everyone else Free User, ONLY if the admin RPC succeeds.
- Three tier filters: Free Users / Standard Users / VIP, plus All users. Online only is now a separate checkbox.
- Admin role remains a small secondary label, not an extra paid membership tier. Complimentary access grants are intentionally separate from paid statuses.
- On missing/unauthorized/invalid RPC response, tier shows Unavailable; cannot accidentally show all profiles as Free.
- Includes "Refresh tiers" and explicit errors. Existing Manage Membership, Ban, Impersonate, and Delete User controls have not been modified.

## Supabase one-time installation — required

Review and run exactly the SQL in:

    supabase/sql/phase334_admin_live_paid_tiers_v1.sql

Use the Supabase project for JB Premium Hub, SQL Editor, as an authorized database owner. This creates one function and function-level privileges only; it does NOT insert/update/delete payment data or profiles. Avoid creating this function under an untrusted role. Confirm a regular authenticated non-admin caller is denied; ensure a real admin user can read it via the authenticated RPC.

**Never use profile.account_type as proof of paid status.** A completed payment transaction is not necessarily an active entitlement; access expires. Test-mode payments do not count as LIVE.

## Optimized local project — PowerShell

First back up the current two JSX files and the existing test file if edited locally. Do NOT use git reset/clean and do NOT delete untracked files.

    git fetch origin phase-334-admin-users-live-membership-tiers

    git restore --source=FETCH_HEAD --worktree -- src/pages/admin/AdminUsersTab.jsx src/services/adminMemberTierView.js scripts/tests/test-admin-live-paid-tiers.mjs scripts/tests/test-admin-users-presence-profile.mjs supabase/sql/phase334_admin_live_paid_tiers_v1.sql

    node --test .\scripts\tests\test-admin-live-paid-tiers.mjs .\scripts\tests\test-admin-users-presence-profile.mjs

    npm run build

Expected: **13 tests** (7 new + 6 previous) and build PASS. The project already uses lazy Admin Dashboard tabs from Phase 329 and the Phase 330 Billing reliability fix; preserve those local working features.

## Manual verification

On localhost authenticated as an authorized admin:
1. Open Users; 476 loaded profiles should remain 476 unless the actual database changes.
2. Filters should show Free/Standard/VIP. If the true live database has one active Standard grant and one VIP grant, expect 474 Free, 1 Standard and 1 VIP (subject to all accounts appearing in the loaded profile list).
3. Switch to Billing & memberships; compare the LIVE active payment-backed entitlement summary. Some complimentary access grants may appear in separate access reports, not these paid counts.
4. Check Search, Online only, navigation and Refresh tiers. No test payments, access grants, or account deletions needed.

## Status

Draft code only until the SQL is installed and actual browser/RPC checks pass. No production merge/deployment. Unrelated media/thumbnail safety holds remain in place.
