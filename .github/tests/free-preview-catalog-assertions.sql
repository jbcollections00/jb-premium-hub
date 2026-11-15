-- Verify only admin-selected videos are discoverable by authenticated FREE
-- accounts. All protected object URLs/tickets remain private.
RESET ROLE;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false
);
SET ROLE authenticated;

DO $$
DECLARE
  v_catalog_count integer;
  v_leaked_count integer;
  v_nonfree_count integer;
BEGIN
  SELECT COUNT(*) INTO v_catalog_count
  FROM public.jb_free_preview_catalog_v1();

  IF v_catalog_count <> 20 THEN
    RAISE EXCEPTION 'Expected 20 approved catalog entries; got %', v_catalog_count;
  END IF;

  SELECT COUNT(*) INTO v_leaked_count
  FROM public.jb_free_preview_catalog_v1() AS x
  WHERE x ? 'media_url'
     OR x ? 'r2_key'
     OR x ? 'ticket'
     OR x ? 'signed_url'
     OR (x->>'is_free_preview') IS DISTINCT FROM 'true'
     OR (x->>'type') IS DISTINCT FROM 'video';
  IF v_leaked_count <> 0 THEN
    RAISE EXCEPTION 'Catalog exposed a private URL or unapproved content';
  END IF;

  SELECT COUNT(*) INTO v_nonfree_count
  FROM public.jb_free_preview_catalog_v1() AS x
  WHERE (x->>'id')::uuid NOT IN (
    SELECT id FROM public.media WHERE is_free_preview IS TRUE
  );
  IF v_nonfree_count <> 0 THEN
    RAISE EXCEPTION 'Catalog exposed an unapproved video';
  END IF;

  RAISE NOTICE 'PASS: authenticated non-admin sees 20 free entries without private URLs';
END;
$$;

-- Missing JWT has no identity, so discovery must return 0.
SELECT pg_catalog.set_config('request.jwt.claim.sub', '', false);
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.jb_free_preview_catalog_v1()) <> 0 THEN
    RAISE EXCEPTION 'Unidentified user received catalog entries';
  END IF;
  RAISE NOTICE 'PASS: missing JWT returns no entries';
END;
$$;

RESET ROLE;
SET ROLE anon;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.jb_free_preview_catalog_v1();
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Anonymous user can execute free catalog RPC';
  END IF;
  RAISE NOTICE 'PASS: anon cannot execute catalog RPC';
END;
$$;
RESET ROLE;
