-- JB Premium Hub: authenticated, read-only LIVE PayMongo checkout history.
-- Apply through the Supabase SQL Editor before merging the related Profile UI.
--
-- The only identity used is auth.uid() from the caller's verified JWT.
-- A user must not be allowed to supply another person's user_id.
-- No PayMongo credentials, payment IDs, checkout URLs or secrets are returned.

CREATE OR REPLACE FUNCTION public.jb_billing_my_history_v1()
RETURNS TABLE (
  order_id uuid,
  plan_code text,
  amount_centavos integer,
  currency text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    o.id::uuid,
    o.plan_code::text,
    o.amount_centavos::integer,
    o.currency::text,
    o.status::text,
    o.created_at::timestamptz
  FROM public.jb_billing_orders AS o
  WHERE o.user_id = (SELECT auth.uid())
    AND o.provider_environment = 'live'
    AND (SELECT auth.uid()) IS NOT NULL
  ORDER BY o.created_at DESC, o.id DESC
  LIMIT 50;
$$;

-- Postgres grants EXECUTE to PUBLIC by default on newly created functions.
REVOKE ALL ON FUNCTION public.jb_billing_my_history_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jb_billing_my_history_v1() FROM anon;
GRANT EXECUTE ON FUNCTION public.jb_billing_my_history_v1() TO authenticated;

COMMENT ON FUNCTION public.jb_billing_my_history_v1() IS
  'Read-only, auth-bound LIVE checkout history for the current JB Premium Hub account; returns at most 50 own orders.';
