# Phase 353 — Automatic branding deployment checklist

Status: database queue installed; 5 private published videos in Pending. No worker processing activated.

## GitHub Actions secrets (Settings > Secrets and variables > Actions)
Create secrets SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
Do NOT put credential values in the repository or chat.

## GitHub Actions variables
- JB_STAGING_R2_BUCKET_NAME = jb-premium-private-videos
- JB_PUBLIC_THUMBNAIL_R2_BUCKET_NAME = jb-collections-public-assets
- JB_BRANDING_WORKER_ENABLED = true only after a real one-video acceptance run.

## Vercel
- Existing private R2 keys and Supabase keys are required.
- JB_BRANDED_DOWNLOADS_ENABLED = true only after branded-file QA and production ticket cutover.
- Configure private R2 bucket GET CORS for the web app's browser-download origin.

## Cutover order
1. Deploy the admin branding manager; admin uploads intro MP4, watermark PNG, logo PNG, and saves settings.
2. Test one real sample video through manually dispatched Phase353 GitHub Action.
3. Verify actual output MP4 bytes: intro has no overlay; moving watermark and fixed logo start after intro and stay within portrait/landscape frame.
4. Verify clean thumbnail was published from original main video and original R2 object was untouched.
5. Deploy Vercel branded-only download endpoint and matching patched Supabase Edge ticket issuer TOGETHER.
6. Confirm FREE/STANDARD have no download access; VIP gets branded bytes only; Pending gives 409 without original fallback.
7. Enable scheduled job, monitor Pending/Processing/Ready/Failed and retries.

Scheduled GitHub Actions can be delayed and video processing may exceed hosted runner resources. Do not promise strict time-to-ready. For stronger uptime, run worker on a managed always-on container.
Phase352 Access Code changes are on a separate branch. GitHub Actions runs on default branch after merge.
Do not merge or enable the branded-only download cutover until every release gate is confirmed.