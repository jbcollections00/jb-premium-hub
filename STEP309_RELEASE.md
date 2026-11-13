# JB Premium Hub — Step 309 Release Readiness
**Prepared:** 2026-11-13  
**Scope:** No JB CHAT integration. No landing page. No For You page. Existing `/messages` (admin announcements) is retained.

## What this branch changes
- `/` routes to `/home`, which uses existing auth protection to redirect signed-out visitors to `/login`.
- `/for-you` and `/chat` no longer have active routes; unmatched paths redirect to `/home`.
- Removes the For You link from the header.
- Leaves subscriptions, frontend billing access, admin messages, DB, Edge Functions, PayMongo, and production configuration untouched.

## Existing payment implementation (reviewed)
- Frontend `src/pages/public/Subscribe.jsx` already supports PayMongo LIVE Checkout, gated by:
  - `VITE_JB_LIVE_CHECKOUT_UI_ENABLED=true` in the **production Vercel build**
  - exact `https://www.jb-premium-hub.vip` origin
- Server-side `jb-paymongo-checkout-live` separately requires:
  - `JB_LIVE_CHECKOUT_ACCESS_MODE=public`
  - `JB_LIVE_CHECKOUT_PUBLIC_RELEASE_APPROVED=true`
  - `JB_BILLING_LIVE_SITE_ORIGIN=https://www.jb-premium-hub.vip`
  - correctly configured LIVE PayMongo credential and service-role authorization
  - DB `jb_billing_live_checkout_control.checkout_enabled=true`
- The LIVE webhook receiver separately requires `JB_LIVE_WEBHOOK_RECORDING_ENABLED=true`.
- The LIVE worker separately requires `JB_LIVE_WEBHOOK_WORKER_ENABLED=true`, a valid private scheduler call token, and DB settlement + worker processing flags.
- A return from PayMongo does **not** grant membership. Verified settlement creates the subscription/entitlement.
- Purchases grant **one month of access per verified checkout**; the current code does NOT implement recurring automatic charges.

## Current documented state before release
The user-confirmed November 13 database control snapshot had:
- Checkout: false
- Settlement: false
- Worker processing: false

Earlier supervised LIVE VIP payment and scheduler testing were reportedly successful. Those earlier reports do not demonstrate that LIVE Standard purchase, renewal, refund handling, webhooks and secrets are correct **in the current deployed revision**.

## Controlled release sequence (do not skip)
1. Compare this branch against the latest **local** files from Step 307D/307E before merging; the GitHub main repository may lag the local successful build. Preserve all local fixes. Build and retest login, home, signup, profile, subscription, refresh and logout. Confirm `/chat` and `/for-you` are inaccessible.
2. Verify current deployed Supabase Edge Function revisions, PayMongo webhook endpoint status, webhook signing key, live credentials, worker scheduler call token, Vercel production origin, and UI environment flags **without sharing secrets**. Do not assume local source equals deployed source.
3. Ensure webhook intake, settlement, worker processing and scheduled invocation operate correctly **while public checkout stays disabled**, with a clean/understood backlog and a tested safe recovery path for stuck claims.
4. Run a controlled LIVE Standard ₱50 transaction through the authorized tester gate (not public mode), verify order, audit, one entitlement, access, and expiry; verify a cancelled/unpaid checkout grants no access. Avoid repeating paid tests unnecessarily.
5. After verified tests and explicit merchant approval, enable **public** checkout. Enable the Vercel UI flag for production, server public gate and DB checkout lock **only as final rollout actions**. Monitor new payments, callbacks, queues, memberships, and support tickets.
6. Have a rollback plan: stop **new** checkout first. Do not disable settlement or webhook intake with unsettled customer payments unless the security incident requires it; otherwise keep enough backend processing enabled to fulfill existing paid orders.

## Release safety
Never put `sk_live_*`, webhook signing secrets, `service_role` keys, bearer tokens, or private user IDs into frontend files, GitHub, chat, screenshots or logs.

This branch is **release preparation, not production activation**. Do not merge and deploy without checking the newer local project state.
