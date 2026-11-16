# Phase 333G — Legacy catalog hold on Home (draft, non-destructive)

## Why
The prior Cloudflare R2 bucket overview showed 0 objects / 0 B, but the Supabase `public.media` table still held 4,647 legacy video records. The legacy rows were still shown by Most Watched and the media grid. Empty storage does not remove database records.

## What this draft does
- A **default-on** `LEGACY_CATALOG_HOME_HOLD` gate prevents Home from querying the old media grid, popular videos and Free preview catalog. It also disables playback/download through Home while held.
- Client private-media ticket request helpers reject requests during this hold.
- Home displays neutral 'new catalog being prepared' messaging instead of old video cards.
- The dynamic album directory continues to display album metadata, including Educational Videos and its cover.
- There are **no DELETE operations**, data modifications, new R2 objects, or production deployments.
- Existing billing, subscription, Admin Album Manager, and PayMongo integrations are untouched.

## Critical limitations
**THIS IS NOT a database deletion or a complete backend security hold.** Existing media rows remain stored. Direct Supabase queries, SECURITY DEFINER RPCs, direct /v metadata URLs, paid issuer Edge Functions and other paths may still expose metadata or issue old media links. The old Admin Media Manager remains able to view stored records. Do not merge/publish this branch as a comprehensive security fix.

Before exposing any new catalog publicly, enforce a default-deny rule for legacy records through every relevant backend read, ticket issuance and playback route. Preserve potentially reportable evidence and obtain independent professional review where child protection concerns exist, rather than issuing mass deletion of suspect records.

## Local QA
From the clean Phase333-Albums worktree:

```powershell
git status --short
git fetch origin phase-333g-legacy-catalog-home-hold
git switch --detach origin/phase-333g-legacy-catalog-home-hold

node --test .\scripts\tests\test-album-directory.mjs .\scripts\tests\test-home-section-order.mjs .\scripts\tests\test-album-artwork.mjs .\scripts\tests\test-album-bulk-hide.mjs .\scripts\tests\test-legacy-catalog-home-hold.mjs

npm run build
```

If the worktree has local changes, back them up before switching. No need to re-run the previously completed unrelated regression suite.

**Expected Home**: zero legacy cards in Most Watched and Media Library, visible Explore Albums cards with approved static covers. This is local UI behavior only; it is not a production access-control test.
