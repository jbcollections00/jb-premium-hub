# Phase 336AZ — deployed Free Preview issuer v20 (rollback snapshot)

On 2026-11-22 production function `jb-free-preview-ticket` was v20, JWT verified, hash: `e7a3939309fd25b94dc233b6560060c902e0c3000386ba88d17cc832c4116eab`.

The **unchanged original source** is available in this branch at `supabase/functions/jb-free-preview-ticket/index.ts` and `ticket.ts`, with the commit state frozen by this backup branch. Redeploy both files with JWT verification ON to roll back. This branch must not be deployed automatically.
