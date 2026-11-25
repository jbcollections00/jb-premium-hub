-- Phase 344: Display membership tiers, NOT legacy profile account_type.
-- Read-only. Authenticated admin-only. Does not grant/modify/revoke access.
CREATE OR REPLACE FUNCTION public.jb_admin_account_tier_counts_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_counts jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR (SELECT public.is_current_user_admin()) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Admin permission required'
      USING ERRCODE = '42501';
  END IF;

  -- Mirror jb_billing_my_access: current LIVE paid grants and current
  -- complimentary admin grants. VIP beats STANDARD, both beat FREE.
  -- Legacy profiles.account_type='standard' does not establish paid access.
  WITH eligible_profiles AS (
    SELECT p.id
    FROM public.profiles p
    WHERE nullif(pg_catalog.btrim(p.email), '') IS NOT NULL
      AND pg_catalog.lower(coalesce(p.role, '')) <> 'admin'
      AND pg_catalog.lower(coalesce(p.account_type, ''))
          NOT IN ('admin', 'guest', 'anonymous')
  ), valid_grants AS (
    SELECT g.user_id, g.plan_code
    FROM public.jb_billing_entitlement_grants g
    WHERE g.provider_environment = 'live'
      AND g.revoked_at IS NULL
      AND g.effective_from <= pg_catalog.now()
      AND g.effective_until > pg_catalog.now()
      AND g.plan_code IN ('standard', 'vip')

    UNION ALL

    SELECT g.user_id, g.plan_code
    FROM public.jb_admin_membership_grants g
    WHERE g.revoked_at IS NULL
      AND g.effective_from <= pg_catalog.now()
      AND g.effective_until > pg_catalog.now()
      AND g.plan_code IN ('standard', 'vip')
  ), one_tier_per_user AS (
    SELECT p.id,
      CASE
        WHEN pg_catalog.bool_or(g.plan_code = 'vip') THEN 'vip'
        WHEN pg_catalog.bool_or(g.plan_code = 'standard') THEN 'standard'
        ELSE 'free'
      END AS tier
    FROM eligible_profiles p
    LEFT JOIN valid_grants g ON g.user_id = p.id
    GROUP BY p.id
  )
  SELECT pg_catalog.jsonb_build_object(
    'free', count(*) FILTER (WHERE tier = 'free')::integer,
    'standard', count(*) FILTER (WHERE tier = 'standard')::integer,
    'vip', count(*) FILTER (WHERE tier = 'vip')::integer,
    'account_users', count(*)::integer,
    'source', 'active_live_and_admin_memberships'
  )
  INTO v_counts
  FROM one_tier_per_user;

  RETURN v_counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.jb_admin_account_tier_counts_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jb_admin_account_tier_counts_v1()
  TO authenticated;

COMMENT ON FUNCTION public.jb_admin_account_tier_counts_v1()
IS 'Admin read-only dashboard counts: effective FREE, STANDARD, VIP entitlements; excludes admins, guests, TEST grants and expired/revoked grants.';
