# Phase 333E — Album manager UI refinement (DRAFT)

Phase 333's album directory and original migration were already validated locally: 5/5 tests and Vite build passed. This phase adds a separate, non-destructive metadata migration and user interface changes only.

## Included

- Admin Albums: responsive color-theme selection, live logo or reviewed-art preview, search by name/description, visible/hidden filter, sort newest/A–Z; existing rename, hide/show and delete remain.
- Home Explore Albums: responsive themed cards, with optional search when more than four albums exist.
- Six predefined visual cover themes and the existing JB Collections neutral logo fallback.
- Optional, already independently cleared static artwork by an HTTPS URL on the isolated public-assets prefix, such as https://assets.jb-premium-hub.vip/album-covers/Educational_2026.webp.
- URL validation in browser and database limits paths and static extensions. This verifies the *address format* only, NOT image safety.
- No image uploader or video-frame extraction; cover artwork must already be separately reviewed and hosted through an authorized process.
- No changes to membership access, Free to Watch, PayMongo, media table, R2 video files, or the existing Home video grid.

## Database

Original Phase 333 album table already exists (per user result). Review and run the new SQL migration:
supabase/migrations/20261117_phase333e_album_artwork.sql

It adds cover_style (default indigo) and nullable cover_image_url to the album-directory metadata. It does not modify existing media records or delete anything.

## Local QA in the existing clean worktree

Working folder: C:\Users\vivz0\JB_ReleaseCandidates\Phase333-Albums

PowerShell commands, in order:

1. git status --short
2. git fetch origin phase-333e-album-cover-ui
3. git switch --detach origin/phase-333e-album-cover-ui
4. node --test .\scripts\tests\test-album-directory.mjs .\scripts\tests\test-home-section-order.mjs .\scripts\tests\test-album-artwork.mjs
5. npm run build

If git status shows local modifications, stop and preserve those changes before switching. Do not reset/clean the folder or re-run historical security tests.

Once the schema migration is applied, localhost Admin > Albums can update an existing album theme; Home will show the style after refresh.

## Deployment limitations

This is a draft. Validating URL format does not establish actual content-safety clearance. Do not upload or link suspect media or unlawful imagery. Previously flagged material requires appropriate child-protection reporting and evidence-preservation review.

Media-to-album attachment, server-side media safety gating, public video release, and automatic video-derived thumbnails are not enabled by Phase 333E.
