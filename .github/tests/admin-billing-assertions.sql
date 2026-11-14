-- Temporary CI authorization checks; tests production SQL in a clean database.
-- Admin with a valid JWT can read verified, aggregated LIVE billing data.
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SET ROLE authenticated;

DO $$
DECLARE
  report jsonb;
BEGIN
  SELECT public.jb_billing_admin_overview_v1() INTO report;
  IF report ->> 'environment' <> 'live' OR report ->> 'read_only' <> 'true' THEN
    RAISE EXCEPTION 'Report must be live/read-only: %', report;
  END IF;
  IF (report #>> '{metrics,paid_orders}')::integer <> 1
     OR (report #>> '{metrics,pending_checkouts}')::integer <> 1
     OR (report #>> '{metrics,paid_gross_centavos}')::bigint <> 15000
     OR (report #>> '{metrics,standard_paid_orders}')::integer <> 0
     OR (report #>> '{metrics,vip_paid_orders}')::integer <> 1 THEN
    RAISE EXCEPTION 'Verified LIVE billing totals are wrong: %', report;
  END IF;
  IF (report #>> '{memberships,available}')::boolean IS DISTINCT FROM true
     OR (report #>> '{memberships,active_vip}')::integer <> 1
     OR (report #>> '{memberships,active_standard}')::integer <> 0 THEN
    RAISE EXCEPTION 'VIP membership coverage mismatch: %', report;
  END IF;
  IF pg_catalog.jsonb_array_length(report -> 'recent_orders') <> 2 THEN
    RAISE EXCEPTION 'Only two LIVE orders must appear: %', report;
  END IF;
  IF (report::text LIKE '%cs_live_test%')
     OR (report::text LIKE '%pay_live_verified%')
     OR (report::text LIKE '%bbbbbbbb-bbbb-4bbb%') THEN
    RAISE EXCEPTION 'Billing report leaked protected references or user ID';
  END IF;
  RAISE NOTICE 'PASS: admin sees correct verified totals and no sensitive identifiers';
END;
$$;

-- Non-admin authenticated user must get a database authorization error.
SELECT pg_catalog.set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);

DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.jb_billing_admin_overview_v1();
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'Non-admin was allowed to read billing report';
  END IF;
  RAISE NOTICE 'PASS: non-admin cannot read report';
END;
$$;

-- Anonymous role has no EXECUTE grant.
RESET ROLE;
SET ROLE anon;
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.jb_billing_admin_overview_v1();
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Anon was allowed to execute billing report'; END IF;
  RAISE NOTICE 'PASS: anon cannot execute report';
END;
$$;
