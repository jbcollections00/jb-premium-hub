# JB PREMIUM HUB — Phase 313B complete replacement files

These are complete replacement versions of the existing Admin Panel source files, not patches or snippets. The working feature code was preserved and the visual system was unified. The live `main` branch is unchanged until PR #12 is approved and merged.

## Included files

- `src/pages/admin/AdminDashboard.jsx` — six visible tabs: Overview, Users, Messages, Support, Access codes and Media manager
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

No PayMongo implementation, LIVE billing switches, Edge Functions, databases, RLS policies, Cloudflare R2 URLs, or media upload operations are modified by these UI replacements.

The Admin Dashboard profile counts are not PayMongo subscriber counts. Guest profiles are excluded only from dashboard cards and charts; their records are not deleted.

## How to use

Preferred: review the Vercel preview and merge PR #12 into `main` once approved; Vercel will build the full project automatically.

Manual option: copy **all** the files above into the same relative paths in your existing project, without replacing backend credentials or changing .env files. Run:

```powershell
npm ci
npm run build
```

Verify that the six Admin pages open, VIP/Standard billing still works, message sending is accessible only to admins, media upload & thumbnails are functional, and the sidebar renders well on desktop/mobile.

## Validation

The PR's GitHub Actions workflow verifies the Vite production build, login guard and key admin feature entry points. Visual QA remains important before the production merge.
