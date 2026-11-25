# Phase 347 — Cloudflare R2 automatic cleanup on explicit admin delete

## Scope and safety

- Admin Media Library **Delete Selected**, and unpublished **Review & Publish / Private Queue** deletes are explicitly authorized by logged-in admins. No automatic orphan deletion or bulk removal on navigation.
- In an atomic SQL transaction, validate every selected row, its authoritative owner/key, publishing status, and upload lease; remove the matching media or draft; enqueue exact R2 object keys into the private \`jb_r2_cleanup_jobs\` table.
- Published videos enqueue **private MP4**, **private JPEG**, and the **matching public JPEG** only when the original \`media.thumbnail_url\` exactly matches \`https://assets.jb-premium-hub.vip/thumbnails/published/<staging-id>.jpg\`. The global logo and external/legacy URLs are never deleted.
- Unpublished draft deletion has a separate service-role-only RPC with an expiring presigned-upload lease guard. \`jb_media_publication_links\` stops deleting published uploads through the draft route.
- Worker claims rows with \`FOR UPDATE SKIP LOCKED\`, 5-minute lease and unique token. Double-checks that the R2 key is still unreferenced by Supabase. Deletes then HEAD-checks absence (404) before acknowledging. If the job fails, the outbox remains pending and retries with exponential backoff. After 12 attempts the row becomes \`blocked\` for manual review, never silently discarded.
- All database RPCs are service-role-only. Public browser tokens cannot call claims, acknowledgements, or insert/update the queue. The shared worker is outside public \`/api\` routes.
- The existing \`jb_admin_media_delete_audit\` remains for published-media audit, with a new \`public_thumbnail_key\` field. No historic media records are deleted by the migration.

## Automatic scheduler

- Vercel Production Cron: \`GET /api/jb-r2-cleanup-cron\`, configured in \`vercel.json\` at \`0 3 * * *\` UTC (daily, supported on Vercel Hobby).
- **Required new Vercel Production server-side secret: \`CRON_SECRET\`**, at least 32 random characters. Vercel automatically includes \`Authorization: Bearer <CRON_SECRET>\` in its cron requests. Without this configuration, the route intentionally refuses to run with HTTP 503; never disable authentication to work around missing secrets.
- Uses the existing private R2 and Supabase service-role environment settings and known public thumbnail bucket settings; do not change working credentials.
- Admin **Media Manager → Automatic R2 Delete Cleanup** shows counts and lets an authenticated admin use **Retry pending now** (without exposing keys or secrets). Normal deletes attempt a small first batch immediately; unfinished rows are retained for cron retry.

## Deployment checklist

1. CI passes Phase 347 tests, existing Phase 341/343/346 media and Phase 344/345 membership regressions, production Vite build.
2. Run SQL migration in transaction with \`ROLLBACK\` first; install only DDL and read-only RPC definitions, without deleting live media.
3. Verify service-role-only grants and RLS. Confirm media and staging record counts unchanged.
4. Configure \`CRON_SECRET\` in Vercel Production, and redeploy production. Confirm Vercel Cron registration.
5. For live smoke, \`GET\` cron without bearer should be 401. Use admin panel to refresh queue; it should start at zero. Never test destructive paths with live content.
6. After any authorized future admin delete, verify matching private video+JPEG and public JPEG are removed, and all outbox jobs are \`complete\`. A missing public R2 permission leaves the job pending for retry, never falsely marked complete.

The previous Phase 346 3-scope read-only orphan scanner remains a separate feature. It cannot enqueue jobs.
