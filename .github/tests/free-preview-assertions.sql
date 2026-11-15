-- Verify zero-by-default, twenty max, valid admin authorization and removal.
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SET ROLE authenticated;

DO $$
DECLARE
  ids uuid[];
  i integer;
  result jsonb;
  denied boolean;
BEGIN
  SELECT ARRAY(SELECT m.id FROM public.media m ORDER BY m.title, m.id) INTO ids;
  IF (SELECT COUNT(*) FROM public.media WHERE is_free_preview) <> 0 THEN
    RAISE EXCEPTION 'New media must be locked by default';
  END IF;

  FOR i IN 1..20 LOOP
    SELECT public.jb_set_media_free_preview_v1(ids[i],true) INTO result;
  END LOOP;
  IF (SELECT COUNT(*) FROM public.media WHERE is_free_preview) <> 20 THEN
    RAISE EXCEPTION 'Admin should be able to select exactly 20 videos';
  END IF;
  IF (result ->> 'selected_count')::integer <> 20
     OR (result ->> 'maximum_count')::integer <> 20 THEN
    RAISE EXCEPTION 'Incorrect cap result: %', result;
  END IF;

  denied := false;
  BEGIN
    PERFORM public.jb_set_media_free_preview_v1(ids[21],true);
  EXCEPTION WHEN check_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION '21st preview was accepted'; END IF;

  -- Direct edits cannot bypass the database trigger.
  denied := false;
  BEGIN
    UPDATE public.media SET is_free_preview = true WHERE id = ids[21];
  EXCEPTION WHEN check_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Direct write bypassed cap'; END IF;

  PERFORM public.jb_set_media_free_preview_v1(ids[1],false);
  PERFORM public.jb_set_media_free_preview_v1(ids[21],true);
  IF (SELECT COUNT(*) FROM public.media WHERE is_free_preview) <> 20 THEN
    RAISE EXCEPTION 'Unselecting did not free a selection slot';
  END IF;

  IF (SELECT COUNT(*) FROM public.jb_free_preview_ids_v1()) <> 20 THEN
    RAISE EXCEPTION 'Public discovery does not return exactly 20 IDs';
  END IF;
  RAISE NOTICE 'PASS: zero initial, cap=20, direct update blocked, removal frees slot';
END;
$$;

-- Authenticated non-admin cannot select OR unselect videos, even via direct UPDATE.
SELECT pg_catalog.set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);

DO $$
DECLARE
  test_id uuid;
  denied boolean;
BEGIN
  SELECT id INTO test_id FROM public.media LIMIT 1;
  denied := false;
  BEGIN
    PERFORM public.jb_set_media_free_preview_v1(test_id,false);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Non-admin can toggle selection'; END IF;

  denied := false;
  BEGIN
    UPDATE public.media SET is_free_preview = false WHERE id = test_id;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  -- If the row was already false, it would be a no-op. Choose a selected row.
  SELECT id INTO test_id FROM public.media WHERE is_free_preview LIMIT 1;
  BEGIN
    UPDATE public.media SET is_free_preview = false WHERE id = test_id;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Non-admin can bypass toggle with direct write'; END IF;
  RAISE NOTICE 'PASS: non-admin cannot write free-preview selection';
END;
$$;

RESET ROLE;
SET ROLE anon;
DO $$
DECLARE
  denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.jb_set_media_free_preview_v1(pg_catalog.gen_random_uuid(),true);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous toggle was allowed'; END IF;
  RAISE NOTICE 'PASS: anon has no admin-selection RPC access';
END;
$$;
