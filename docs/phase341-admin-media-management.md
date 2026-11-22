# Phase 341 — Admin media bulk approval and private staging cleanup

## UI changes
- **Media Manager, Files:** published media cards reuse the same verified published JPEG endpoint as Home instead of displaying the default logo for approved staging thumbnails.
- **Review & Publish:** lists only unpublished/pending-review drafts. Publication links are verified server-side before generating private preview URLs, so all already published videos disappear here.
- **Review & Publish bulk actions:** row selector, select all pending, bulk Approve & Publish, Delete selected, Delete this draft, Delete all unpublished reviews.
- **Bulk rights:** requires the admin to confirm rights for ALL selected videos and acknowledge possible duplicate filenames; disabled if any selected destination album is hidden. Each file still passes through the existing service-role publishing RPC and R2 validation.
- **Private upload queue:** lists only unlinked drafts; includes selector, select all eligible, Delete selected, Delete all unpublished. Incomplete drafts younger than 65 minutes are non-deletable until the signed PUT lease expires. All deletions require explicit confirmation; the delete-all action also requires typing DELETE ALL.
- Queue and Review refresh after a successful publication or deletion. No upload, delete or publication runs automatically.

## Destructive action guardrails
Only unpublished staging rows belonging to the authenticated admin can be deleted through `delete-unpublished` on the existing admin-only staging API.
- Maximum 50 UUIDs per request, unique IDs; reject the entire request if any row is absent, not owned by this admin, currently uploading, or linked to a published media record.
- Confirm no row in `jb_media_publication_links` before any delete.
- Validate deterministic private video/thumbnail R2 keys.
- Delete the DB staging row first; its FK `ON DELETE RESTRICT` prevents a concurrent published link from becoming dangling.
- After successful DB deletion, attempt to delete the associated private R2 video object and saved JPEG. A failed R2 delete is reported explicitly as cleanup pending and logged, rather than pretending it succeeded. Existing published media records, publication links, and public thumbnails are untouched.
- Previously issued direct signed URLs may still be valid until their TTL expires; draft deletion of `awaiting_upload` is disabled until 65 minutes after creation.
- **No current production records have been deleted by this branch.** Admin must explicitly select and confirm.

## Testing
Phase 341 checks should pass together with 337/338/339 regressions and Vite build. Preview QA: refresh both queues; verify previously published Nature and Jungle disappear from upload/review queues but still appear in the Media Manager; verify selected bulk flow and safe deletion options. Do not publish or delete test videos during QA without explicit rights and intent.

## Limits
- Deletes are hard deletions of unpublished staging; no recycle bin is implemented.
- R2 delete failure after DB deletion needs manual/private cleanup based on application logs.
- Multiple files are published sequentially to avoid serverless function timeouts; individual failures are reported and do not automatically roll back successful publications.
- The public Media Manager already has individual deletion for published videos. This phase does not introduce bulk deletion of published member-facing media.
