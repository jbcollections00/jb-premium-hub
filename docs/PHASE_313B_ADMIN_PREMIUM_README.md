# JB PREMIUM HUB — Phase 313B complete replacement files

These are complete replacement versions of the existing Admin Panel source files, not patches or snippets. The working feature code was preserved and the visual system was unified. The live `main` branch is unchanged until PR #12 is approved and merged. Phase 313C adds an admin-only read-only billing report.

## Included files

- `src/pages/admin/AdminDashboard.jsx` — seven visible tabs: Overview, Users, Billing & memberships, Messages, Support, Access codes and Media manager
- `src/pages/admin/AdminBillingTab.jsx` — verified LIVE transactions, pending orders, gross paid revenue and verified active access when available
- `supabase/migrations/20261114233000_jb_billing_admin_overview_v1.sql` — restricted read-only admin billing RPC; **apply separately before production merge**
- `src/pages/admin/AdminUsersTab.jsx` — profile search, filters, user tools, pagination
- `src/pages/admin/AdminMessagesTab.jsx` — broadcast/direct message composer, templates, media attachments
- `src/pages/admin/SupportTicketsTab.jsx` — ticket list, search, replies, status updates, support templates
- `src/pages/admin/AccessCodesTab.jsx` — code generation, targeting, sending, redemption history
- `src/pages/admin/AdminMediaTab.jsx` — existing R2 uploads, duplicate review, media grid, thumbnail actions, pagination
- `src/pages/admin/AdminMembershipModal.jsx` — complimentary membership grant/extend/revoke dialog
- `src/pages/admin/AdminLogin.jsx` — admin sign-in design, same auth checks
- `src/pages/admin/adminWorkspace.css` — new shared premium Admin component styles
- `src/index.css` — existing Phase 313B Admin shell design and shared design tokens
- `public/jb-logo.png` — existing logo already supplied with the repo

## Hidden, not deleted

Events, Chat reports and Chat analytics are not in the admin navigation. Their components and render branches are retained in `AdminDashboard.jsx` so they can be restored later. No event or chat data is modified or deleted.

## What stays unchanged

No PayMongo implementation, LIVE billing switches, Edge Functions or Cloudflare R2 URLs are changed. The only required database addition is a restricted read-only billing report function. Existing billing tables and RLS policies are unchanged.

The Admin Dashboard profile counts are not PayMongo subscriber counts. The new billing report shows settled LIVE orders (requiring a recorded payment ID), gross paid amounts and pending checkouts, while active paid memberships only display when dated entitlement grants can be confidently linked. Guest profiles are excluded only from dashboard cards and charts; no records are deleted.

## Required pre-production database step

From an authorized Supabase SQL Editor session run the COMPLETE SQL file:
`supabase/migrations/20261114233000_jb_billing_admin_overview_v1.sql`.

This creates only `public.jb_billing_admin_overview_v1()` and grants execute to authenticated callers. It independently checks `auth.uid()` and `public.is_current_user_admin()`. It does not update orders, subscriptions, entitlements, webhooks or settlements.

The page will show "Billing report is unavailable" until the SQL function is installed. If actual entitlement-grant fields cannot be linked confidently, active-membership metrics show a dash rather than misleading totals.

**Production gate:** As the authorized admin, confirm the report loads and the known PAID VIP order appears. Verify with a non-admin authenticated account that a call to `public.jb_billing_admin_overview_v1()` is denied. Do not post private payment IDs, passwords or credentials.

## How to use

Preferred: review the Vercel preview and merge PR #12 into `main` once approved; Vercel will build the full project automatically.

Manual option: copy **all** the files above into the same relative paths in your existing project, without replacing backend credentials or changing .env files. Run:

```powershell
npm ci
npm run build
```

Verify that the seven Admin pages open, VIP/Standard billing still works, message sending is accessible only to admins, media upload & thumbnails are functional, and the sidebar renders well on desktop/mobile.

## Validation

The PR's GitHub Actions workflow verifies the Vite production build, login guard and key admin feature entry points. Visual QA remains important before the production merge.
