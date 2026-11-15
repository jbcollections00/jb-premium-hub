-- Phase 315: admin-managed Free to Watch, maximum 20 video records.
-- Safe initial state: zero free videos. This migration does not expose R2 files
-- or change paid subscriptions, payment settlement, or existing media RLS.
BEGIN;

ALTER TABLE public.media
  ADD COLUMN IF NOT EXISTS is_free_preview boolean NOT NULL DEFAULT false;

-- Serialize all edits of free-preview eligibility so concurrent admins and
-- bulk API requests cannot exceed the shared 20-video cap.
CREATE OR REPLACE FUNCTION public.jb_guard_media_free_preview_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_free_preview IS NOT TRUE THEN RETURN NEW; END IF;
  ELSIF NEW.is_free_preview IS NOT DISTINCT FROM OLD.is_free_preview THEN
    RETURN NEW;
  END IF;

  -- Even if a wider media-update policy is ever introduced, normal users
  -- must not be able to mark a video as a public preview.
  IF (SELECT auth.uid()) IS NULL
     OR (SELECT public.is_current_user_admin()) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Only administrators can change Free to Watch selection'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_free_preview IS TRUE THEN
    IF NEW.type IS DISTINCT FROM 'video'
       OR NEW.media_url IS NULL
       OR pg_catalog.btrim(NEW.media_url) = '' THEN
      RAISE EXCEPTION 'Only an uploaded video can be selected for Free to Watch'
        USING ERRCODE = '23514';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(315, 20);
    SELECT COUNT(*)::integer INTO v_count
    FROM public.media AS m
    WHERE m.is_free_preview IS TRUE
      AND m.id IS DISTINCT FROM NEW.id;

    IF v_count >= 20 THEN
      RAISE EXCEPTION 'Maximum of 20 Free to Watch videos reached'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS jb_media_free_preview_guard_v1 ON public.media;
CREATE TRIGGER jb_media_free_preview_guard_v1
BEFORE INSERT OR UPDATE OF is_free_preview ON public.media
FOR EACH ROW EXECUTE FUNCTION public.jb_guard_media_free_preview_v1();

-- Admin-only, atomic selection RPC. The trigger is the final authority and
-- checks the cap again so direct writes cannot bypass it.
CREATE OR REPLACE FUNCTION public.jb_set_media_free_preview_v1(
  p_media_id uuid,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_item public.media%ROWTYPE;
  v_count integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR (SELECT public.is_current_user_admin()) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Administrator access required'
      USING ERRCODE = '42501';
  END IF;
  IF p_media_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Media ID and selection are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.media m WHERE m.id = p_media_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Video not found' USING ERRCODE = 'P0002'; END IF;
  IF v_item.type IS DISTINCT FROM 'video' THEN
    RAISE EXCEPTION 'Only videos can be selected' USING ERRCODE = '23514';
  END IF;

  UPDATE public.media
  SET is_free_preview = p_enabled
  WHERE id = p_media_id
  RETURNING * INTO v_item;

  SELECT COUNT(*)::integer INTO v_count
  FROM public.media WHERE is_free_preview IS TRUE;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_item.id, 'is_free_preview', v_item.is_free_preview,
    'selected_count', v_count, 'maximum_count', 20
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.jb_guard_media_free_preview_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jb_set_media_free_preview_v1(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jb_set_media_free_preview_v1(uuid,boolean) TO authenticated;

-- Read-only discovery returns video IDs, never file URLs or signed tickets.
CREATE OR REPLACE FUNCTION public.jb_free_preview_ids_v1()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT m.id FROM public.media m
  WHERE m.is_free_preview IS TRUE AND m.type = 'video'
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 20;
$function$;

REVOKE ALL ON FUNCTION public.jb_free_preview_ids_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jb_free_preview_ids_v1() TO authenticated;

COMMENT ON COLUMN public.media.is_free_preview IS
  'Explicitly admin-selected Free to Watch video; max 20 rows. This flag is not a direct R2 permission.';
COMMENT ON FUNCTION public.jb_set_media_free_preview_v1(uuid,boolean) IS
  'Admin-only video free-preview selection; transaction-safe cap of 20.';
COMMIT;
