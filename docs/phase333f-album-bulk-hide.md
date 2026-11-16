# Phase 333F — Reversible bulk album hide (draft)

Adds one admin-only action: **Hide All Albums**. The action asks the administrator to type `HIDE ALL`, then updates only `public.jb_media_albums.is_visible` from `true` to `false`.

This is a reversible bulk visibility operation, **not** `DELETE ALL`:
- Existing album names, descriptions, covers, and IDs remain stored.
- Each album can be restored through the existing **Show** action.
- RLS continues to enforce admin-only updates.
- No code touches the `public.media` table, thumbnail objects, videos, R2 buckets, storage retention, PayMongo, or membership settings.
- The action **does not hide existing legacy videos** in Most Watched or the public media grid and does not prevent direct media API access. A separate independently verified backend media hold is necessary before production.
- Do not implement broad record deletion for previously flagged content without appropriate child-protection reporting, evidence preservation, and legal retention procedures.

To test in the existing Phase333-Albums worktree after checking it is clean:

```powershell
git fetch origin phase-333f-bulk-hide-albums
git switch --detach origin/phase-333f-bulk-hide-albums
node --test .\scripts\tests\test-album-directory.mjs .\scripts\tests\test-home-section-order.mjs .\scripts\tests\test-album-artwork.mjs .\scripts\tests\test-album-bulk-hide.mjs
npm run build
```

PR is draft only. No deployment, database mutation or media deletion was performed by creating this branch.
