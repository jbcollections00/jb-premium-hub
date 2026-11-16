-- JB Premium Hub — Phase 334
-- Read-only, admin-authorized LIVE paid membership classification.
-- Does NOT modify profiles, payment orders, subscriptions, grants or roles.
--
-- This RPC provides the IDs and tiers of users with CURRENT verified LIVE
-- entitlement grants. It intentionally omits expired/revoked/TEST grants.
-- Admin Users UI classifies other profiles as Free User only after a
-- successful authorized RPC response. Complimentary grants are separate.
--
-- Run as the Supabase database owner after reviewing the SQL.
CREATE OR REPLACE FUNCTION public.jb_admin_live_paid_tiers_v1()
RETURNS TABLE (
  user_id uuid,
  tier text,
  access_expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR
     NOT COALESCE(public.is_current_user_admin(), false) THEN
    RAISE EXCEPTION 'Admin authorization required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (g.user_id)
    g.user_id,
    g.plan_code::text AS tier,
    g.effective_until AS access_expires_at
  FROM public.jb_billing_entitlement_grants AS g
  WHERE g.provider_environment = 'live'
    AND g.plan_code IN ('standard', 'vip')
    AND g.revoked_at IS NULL
    AND g.effective_from <= now()
    AND g.effective_until > now()
  ORDER BY g.user_id,
    CASE WHEN g.plan_code = 'vip' THEN 0 ELSE 1 END,
    g.effective_until DESC,
    g.id DESC;
END;
$function$;

-- Do not permit direct RPC execution by anonymous callers. Authenticated
-- users still must pass the function's SERVER-SIDE admin authorization.
REVOKE ALL ON FUNCTION public.jb_admin_live_paid_tiers_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jb_admin_live_paid_tiers_v1()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.jb_admin_live_paid_tiers_v1()
  IS 'Read-only admin report: one currently active LIVE paid tier per user (VIP takes precedence). Not a membership grant or access issuer.';
