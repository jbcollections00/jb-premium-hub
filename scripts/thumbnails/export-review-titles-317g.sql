-- JB Premium Hub / Phase 317G-5 — metadata-only audit export.
-- READ ONLY. Does not open or change video files.
-- Export FULL results (4,647 rows) as JB_317G_titles.csv, keep file local/private.
SELECT
  id::text AS media_id,
  title
FROM public.media
WHERE type = 'video'
ORDER BY id;
