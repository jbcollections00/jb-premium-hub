-- Phase 355: registered-only Free, Standard, VIP and Admin accounts.
-- Do not treat anonymous users as Free or return a GUEST entitlement.
CREATE OR REPLACE FUNCTION public.jb_admin_user_membership_tiers_v1(p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, tier text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR (SELECT public.is_current_user_admin()) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Admin permission required'
      USING ERRCODE = '42501';
  END IF;

  -- Bound requests to current UI batches, never return an unrestricted
  -- all-user data dump to an arbitrary caller.
  IF p_user_ids IS NULL
     OR pg_catalog.cardinality(p_user_ids) NOT BETWEEN 1 AND 200
     OR pg_catalog.array_position(p_user_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid user ID batch'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH eligible_grants AS (
    SELECT g.user_id, g.plan_code
    FROM public.jb_billing_entitlement_grants AS g
    WHERE g.provider_environment = 'live'
      AND g.revoked_at IS NULL
      AND g.effective_from <= pg_catalog.now()
      AND g.effective_until > pg_catalog.now()
      AND g.plan_code IN ('standard', 'vip')
      AND g.user_id = ANY(p_user_ids)

    UNION ALL

    SELECT g.user_id, g.plan_code
    FROM public.jb_admin_membership_grants AS g
    WHERE g.revoked_at IS NULL
      AND g.effective_from <= pg_catalog.now()
      AND g.effective_until > pg_catalog.now()
      AND g.plan_code IN ('standard', 'vip')
      AND g.user_id = ANY(p_user_ids)
  )
  SELECT p.id,
    (CASE
      WHEN pg_catalog.lower(coalesce(p.role, '')) = 'admin'
        OR pg_catalog.lower(coalesce(p.account_type, '')) = 'admin'
        THEN 'ADMIN'
      WHEN pg_catalog.bool_or(g.plan_code = 'vip') THEN 'VIP'
      WHEN pg_catalog.bool_or(g.plan_code = 'standard') THEN 'STANDARD'
      ELSE 'FREE'
    END)::text AS tier
  FROM public.profiles AS p
  LEFT JOIN eligible_grants AS g ON g.user_id = p.id
  WHERE p.id = ANY(p_user_ids)
    AND nullif(pg_catalog.btrim(p.email), '') IS NOT NULL
    AND pg_catalog.lower(coalesce(p.account_type, '')) NOT IN ('guest', 'anonymous')
  GROUP BY p.id, p.role, p.account_type, p.email
  ORDER BY p.id;
END;
$function$;

alter table public.profiles
  drop constraint if exists jb_profiles_no_guest_v1;
alter table public.profiles
  add constraint jb_profiles_no_guest_v1
  check (
    nullif(pg_catalog.btrim(email), '') is not null
    and pg_catalog.lower(coalesce(role, '')) not in ('guest','anonymous')
    and pg_catalog.lower(coalesce(account_type, '')) not in ('guest','anonymous')
  );
notify pgrst, 'reload schema';
