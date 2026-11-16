# Fresh catalog admin intake — informational component (draft)

This draft is intended for the user's request to start a fresh JB Premium Hub catalog **without modifying or deleting existing media**.

- The upload workspace now summarizes the existing indexed-media count, queued new files, optional cover images, and logo-fallback covers.
- No videos or frames are read by this code. No thumbnails are generated or uploaded by the new component.
- The existing manual thumbnail upload and default JB Collections cover behavior are unchanged.
- A zero-count display is **not** proof that past R2 objects, billing records, or other data were safely removed.
- The existing upload handler still uploads media to R2 and inserts rows directly; this preview-only UI **does not** implement an independent server-side media approval or quarantine mechanism.

**Do not promote or enable media publishing solely on the basis of this UI.** Before approving new public video uploads, independently verified content review and a trusted server-side publish gate are required.

Do not bulk-delete potentially exploitative or otherwise suspect material before appropriate child-protection reporting, evidence preservation and lawful retention review.

Test only the new informational component:

```powershell
node --test .\scripts\tests\test-new-catalog-readiness.mjs
npm run build
```

Keep this PR as draft. No changes to production or existing media storage have been made.
