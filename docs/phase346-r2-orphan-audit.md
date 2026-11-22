# Phase 346 — Cloudflare R2 orphan file audit (READ-ONLY)

## Findings from existing production implementation
- Phase 343 published-media deletion invokes `DeleteObjectCommand` for verified private R2 video and thumbnail objects. Failed R2 cleanup is recorded in `jb_admin_media_delete_audit`.
- Phase 341 unpublished deletion also tries to remove verified objects immediately, but its failed R2 cleanup does not persist in a dedicated retry queue.
- A separate public thumbnail copy is written under `thumbnails/published/<staging-id>.jpg` in a public R2 bucket. The current published-media delete does not remove that public copy automatically.
- **There was no orphan reconciliation scheduled in `cron.job`**, and no repository R2 orphan scanner. Consequently, no reliable total number of orphan objects is known until a complete R2 listing runs. The absence of deletion audit records does not prove the absence of orphan objects.

## Safe audit implementation
- Admin Media Manager > Private Album Upload: **Cloudflare R2 Orphan File Audit**.
- Admin authenticated, same-origin, POST-only Vercel route `/api/jb-admin-staging-upload` with `action: orphan-audit`.
- Scope-limited to fixed prefixes: `jb-premium-private-videos/staging/` (private MP4s), `jb-premium-private-videos/staging-thumbnails/` (private JPEGs), and the configured public thumbnail bucket under `thumbnails/published/`.
- Uses ListObjectsV2 pagination, 200 per page, up to 30 pages per scope per run; any short scan is visibly labeled **PARTIAL**.
- Reads all Supabase staging keys, live published media links and media cover references in paginated service-role reads. If the authoritative reference scan fails or is too large, audit fails closed.
- Only objects with no known live reference and R2 LastModified **older than 72 hours** are flagged as **suspected**; recent objects or unknown dates are protected from classification.
- UI reports read-only inventory: scanned/referenced/recent-protected/suspected counts, suspected bytes, and capped sample keys.
- **No R2 DELETE, no database mutation, no automated cleanup, no storage-credential exposure, and no public access.**
- Non-staging R2, historic buckets/CDNs, and older legacy URLs are not included in this scan. A complete, clean report for these three prefixes is not proof all other buckets are free of orphan files.

## Manual validation after deployment
1. Open production Admin > Media Manager > Private Album Upload > Cloudflare R2 Orphan File Audit.
2. Click **Run read-only R2 scan**; verify all three scopes finish with "Scope scan complete".
3. If R2 list permissions are missing, display the precise error; a zero must never be fabricated.
4. Record suspected object count and sample storage paths. Check each sample's provenance against recent uploads and past delete audit.
5. Only after investigation may a separate, explicitly confirmed cleanup workflow be designed; avoid fully automated deletion of unverified keys.

## Release protections
- Unit/security tests inspect the admin authentication order, strict bucket/prefix scope, no deletion commands, source reference coverage, pagination, fail-closed behavior, and UI.
- CI also runs Phase 343–345 regressions and Vite build.
- The scan does not change payments, access controls, video player, thumbnails or publishing.
