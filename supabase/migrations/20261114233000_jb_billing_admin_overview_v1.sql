-- Phase 313C: Admin-only, read-only LIVE billing reporting.
-- REQUIREMENT: public.is_current_user_admin() exists and checks the authenticated
-- user via database-trusted role data. Billing tables already exist.
--
-- No provider IDs, checkout URLs, customers' emails, phone numbers, tokens,
-- or personal names are exposed. No settlement/grant mutation is performed.
--
-- Deploy manually in Supabase SQL Editor before merging the Admin UI.
BEGIN;

CREATE OR REPLACE FUNCTION public.jb_billing_admin_overview_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_metrics jsonb;
  v_recent jsonb;
  v_membership jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR (SELECT public.is_current_user_admin()) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Admin permission required'
      USING ERRCODE = '42501';
  END IF;

  -- A paid order is included only if a payment ID was recorded by the
  -- independently verifying LIVE PayMongo settlement worker.
  SELECT pg_catalog.jsonb_build_object(
    'live_orders', COUNT(*)::integer,
    'paid_orders', COUNT(*) FILTER (
      WHERE o.status = 'paid' AND o.paymongo_payment_id IS NOT NULL
    )::integer,
    'standard_paid_orders', COUNT(*) FILTER (
      WHERE o.status = 'paid' AND o.paymongo_payment_id IS NOT NULL
        AND o.plan_code = 'standard'
    )::integer,
    'vip_paid_orders', COUNT(*) FILTER (
      WHERE o.status = 'paid' AND o.paymongo_payment_id IS NOT NULL
        AND o.plan_code = 'vip'
    )::integer,
    'pending_checkouts', COUNT(*) FILTER (WHERE o.status = 'pending')::integer,
    'needs_review', COUNT(*) FILTER (
      WHERE o.status = 'paid' AND o.paymongo_payment_id IS NULL
    )::integer,
    'paid_gross_centavos', COALESCE(SUM(o.amount_centavos) FILTER (
      WHERE o.status = 'paid' AND o.paymongo_payment_id IS NOT NULL
        AND o.currency = 'PHP'
    ), 0)::bigint,
    'currency', 'PHP'
  )
  INTO v_metrics
  FROM public.jb_billing_orders o
  WHERE o.provider_environment = 'live';

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'order_id', x.id,
        'plan_code', x.plan_code,
        'amount_centavos', x.amount_centavos,
        'currency', x.currency,
        'status', x.status,
        'payment_recorded', x.payment_recorded,
        'checkout_created', x.checkout_created,
        'created_at', x.created_at
      )
      ORDER BY x.created_at DESC, x.id DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent
  FROM (
    SELECT
      o.id, o.plan_code, o.amount_centavos, o.currency, o.status,
      (o.paymongo_payment_id IS NOT NULL) AS payment_recorded,
      (o.paymongo_checkout_session_id IS NOT NULL) AS checkout_created,
      o.created_at
    FROM public.jb_billing_orders o
    WHERE o.provider_environment = 'live'
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT 50
  ) x;

  -- Active access is calculated exclusively from live settled orders linked
  -- to entitlement grants with a recorded unexpired end date.
  --
  -- JSON extraction keeps this report compatible with grant schema versions:
  -- existing billing functions may use different end-date column names.
  -- If matching, timestamped grants cannot be established, report UNKNOWN
  -- rather than inventing an active subscription count.
  WITH paid AS (
    SELECT o.id, o.user_id, o.plan_code, o.subscription_id
    FROM public.jb_billing_orders o
    WHERE o.provider_environment = 'live'
      AND o.status = 'paid'
      AND o.paymongo_payment_id IS NOT NULL
  ), grant_rows AS (
    SELECT
      p.id AS paid_order_id,
      p.user_id,
      p.plan_code,
      COALESCE(
        NULLIF(gj.doc ->> 'expires_at', ''),
        NULLIF(gj.doc ->> 'effective_until', ''),
        NULLIF(gj.doc ->> 'valid_until', ''),
        NULLIF(gj.doc ->> 'ends_at', ''),
        NULLIF(gj.doc ->> 'period_end', '')
      ) AS expiry,
      NULLIF(gj.doc ->> 'revoked_at', '') IS NOT NULL AS revoked
    FROM public.jb_billing_entitlement_grants g
    CROSS JOIN LATERAL (SELECT pg_catalog.to_jsonb(g) AS doc) gj
    JOIN paid p ON (
      gj.doc ->> 'order_id' = p.id::text
      OR gj.doc ->> 'source_order_id' = p.id::text
      OR (p.subscription_id IS NOT NULL AND (
        gj.doc ->> 'subscription_id' = p.subscription_id::text
        OR gj.doc ->> 'source_subscription_id' = p.subscription_id::text
      ))
    )
  ), active_by_user AS (
    SELECT
      user_id,
      BOOL_OR(plan_code = 'vip') AS has_vip,
      BOOL_OR(plan_code = 'standard') AS has_standard
    FROM grant_rows
    WHERE revoked IS FALSE
      AND expiry IS NOT NULL
      AND expiry::timestamptz > pg_catalog.now()
    GROUP BY user_id
  ), coverage AS (
    SELECT
      (SELECT COUNT(*) FROM paid) AS paid_count,
      (SELECT COUNT(DISTINCT paid_order_id) FROM grant_rows WHERE expiry IS NOT NULL) AS dated_link_count
  )
  SELECT pg_catalog.jsonb_build_object(
    'available', (coverage.paid_count = 0 OR coverage.dated_link_count = coverage.paid_count),
    'source', 'verified live paid entitlements',
    'active_vip', CASE WHEN coverage.paid_count = 0 OR coverage.dated_link_count = coverage.paid_count
      THEN (SELECT COUNT(*) FILTER (WHERE has_vip) FROM active_by_user)
      ELSE NULL END,
    'active_standard', CASE WHEN coverage.paid_count = 0 OR coverage.dated_link_count = coverage.paid_count
      THEN (SELECT COUNT(*) FILTER (WHERE NOT has_vip AND has_standard) FROM active_by_user)
      ELSE NULL END
  )
  INTO v_membership
  FROM coverage;

  RETURN pg_catalog.jsonb_build_object(
    'environment', 'live',
    'read_only', true,
    'generated_at', pg_catalog.now(),
    'metrics', v_metrics,
    'memberships', v_membership,
    'recent_orders', v_recent
  );
END;
$function$;

-- Closing privilege window inside the same transaction.
REVOKE ALL ON FUNCTION public.jb_billing_admin_overview_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jb_billing_admin_overview_v1() FROM anon;
GRANT EXECUTE ON FUNCTION public.jb_billing_admin_overview_v1() TO authenticated;

COMMENT ON FUNCTION public.jb_billing_admin_overview_v1() IS
  'Read-only, database-admin-authorized LIVE PayMongo order summary and non-PII checkout list.';
COMMIT;
