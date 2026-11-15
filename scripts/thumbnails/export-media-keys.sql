-- JB Premium Hub — Phase 317E-3
-- READ-ONLY Supabase SQL Editor export for offline exact R2 key matching.
-- Export results as CSV named JB_317E_media_keys.csv.
-- Keep this file PRIVATE: object keys and media IDs are sensitive project metadata.
SELECT
  id::text AS media_id,
  REGEXP_REPLACE(
    SPLIT_PART(SPLIT_PART(media_url, '?', 1), '#', 1),
    '^https?://[^/]+/?',
    '',
    'i'
  ) AS object_key,
  LOWER(
    SPLIT_PART(
      SPLIT_PART(media_url, '://', 2),
      '/',
      1
    )
  ) AS source_host,
  CASE
    WHEN thumbnail_url IS NULL OR BTRIM(thumbnail_url) = ''
      THEN 'missing'
    WHEN BTRIM(thumbnail_url) =
      'https://assets.jb-premium-hub.vip/thumbnails/logo_JBCollections.png'
      THEN 'default_logo'
    WHEN thumbnail_url LIKE 'data:image/%'
      THEN 'embedded'
    ELSE 'existing_custom'
  END AS thumbnail_status
FROM public.media
WHERE type = 'video'
ORDER BY id;
