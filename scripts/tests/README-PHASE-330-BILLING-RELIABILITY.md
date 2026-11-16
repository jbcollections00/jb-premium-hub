# Phase 330 — Admin Billing report reliability

Improves the existing READ-ONLY LIVE billing report UI only. This does not modify PayMongo checkout, transaction settlement, entitlement grants, webhooks, payment methods, Supabase table policies, or site media.

## What changed

- Monetary amounts in centavos display as a dash when omitted, malformed, non-integral or negative, instead of incorrectly displaying zero PHP. Genuine zero is still zero.
- Counts display a dash for unknown values; zero remains 0.
- A late result from an earlier billing report refresh cannot overwrite a newer response.
- Outstanding requests completing after a lazy tab unmount are ignored.
- If a manual refresh fails after a valid snapshot was loaded, the prior snapshot stays visible with an explicit "may be outdated" warning. No financial records are changed.

All changes are client presentation; the existing privileged, server-authorized jb_billing_admin_overview_v1 RPC and strict read_only===true and environment==='live' checks remain in place.

## Windows PowerShell — from existing JB Premium Hub checkout

    git fetch origin phase-330-admin-billing-report-reliability

    git restore --source=FETCH_HEAD --worktree -- src/pages/admin/AdminBillingTab.jsx src/services/adminBillingDisplay.js scripts/tests/test-admin-billing-reliability.mjs

    node --test .\scripts\tests\test-admin-billing-reliability.mjs

    npm run build

Expected six unit tests and a successful Vite build. Check Admin > Billing: report loads, refresh works, and a failed refresh shows the stale-data warning. No LIVE PayMongo changes are necessary.

**Authoring checks:** 14 direct helper/source conditions passed. Local user Node tests and full build have not yet been run on this branch.

This draft contains no media content or thumbnail changes and does not waive independent safety review requirements.
