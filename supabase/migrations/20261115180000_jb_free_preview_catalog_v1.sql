-- Phase 315D: Minimum safe catalog data for signed-in FREE accounts.
-- An ordinary media SELECT may correctly be hidden by existing membership
-- RLS policies; do NOT broaden the media table policies for this feature.
--
-- The only authorization for video bytes remains jb-free-preview-ticket
-- and the private HMAC Cloudflare video Worker.
BEGIN;

CREATE OR REPLACE FUNCTION public.jb_free_preview_catalog_v1()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id', m.id,
    'type', 'video',
    'title', m.title,
    'category', pg_catalog.to_jsonb(m)->>'category',
    'thumbnail_url', pg_catalog.to_jsonb(m)->>'thumbnail_url',
    'duration', pg_catalog.to_jsonb(m)->>'duration',
    'views_count', COALESCE((pg_catalog.to_jsonb(m)->>'views_count')::integer, 0),
    'created_at', pg_catalog.to_jsonb(m)->>'created_at',
    'is_free_preview', true
  )
  FROM public.media AS m
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND m.type = 'video'
    AND m.is_free_preview IS TRUE
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 20;
$function$;

REVOKE ALL ON FUNCTION public.jb_free_preview_catalog_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jb_free_preview_catalog_v1() TO authenticated;

COMMENT ON FUNCTION public.jb_free_preview_catalog_v1() IS
  'Authenticated Free to Watch metadata only, 20 max. Does not return media_url, storage keys, private tickets, or full paid catalog.';

COMMIT;
