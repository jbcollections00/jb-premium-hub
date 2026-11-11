-- CI ONLY: synthetic billing test data. NEVER run in Supabase production.
-- Requires dedicated ephemeral PostgreSQL database jb_payment_ci and
-- connection setting: PGOPTIONS='-c jb.isolated_ci=true'.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
  IF current_database() <> 'jb_payment_ci'
     OR current_setting('jb.isolated_ci', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ABORT: not the isolated jb_payment_ci database';
  END IF;
END
$guard$;


SET ROLE service_role;
DO $test$
DECLARE v_order uuid := (SELECT val::uuid FROM ci.fixtures WHERE name='concurrent_order');
        v_audit uuid := (SELECT val::uuid FROM ci.fixtures WHERE name='concurrent_audit');
        v_count integer;
        v_grants integer;
        v_subs integer;
        v_existing jsonb;
BEGIN
 PERFORM ci.check_true((SELECT status='paid' FROM public.jb_billing_orders WHERE id=v_order),
                   'concurrent settlement order must be paid');
 SELECT count(*) INTO v_grants FROM public.jb_billing_entitlement_grants WHERE order_id=v_order;
 PERFORM ci.check_true(v_grants=1, 'concurrency must create exactly one grant');
 SELECT count(*) INTO v_subs FROM public.jb_billing_subscriptions
 WHERE id=(SELECT subscription_id FROM public.jb_billing_orders WHERE id=v_order)
   AND plan_code='vip' AND status='active';
 PERFORM ci.check_true(v_subs=1, 'concurrency must leave one active VIP subscription');
 v_existing := public.jb_billing_settle_verified_live_v1(v_audit);
 PERFORM ci.check_true(v_existing->>'status'='already_settled','post-concurrency idempotency');
 PERFORM ci.check_true((SELECT count(*)=2 FROM public.jb_billing_entitlement_grants),
                   'exactly two synthetic paid orders have entitlements');
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SET ROLE authenticated;
DO $test$
DECLARE v record;
BEGIN
 SELECT * INTO v FROM public.jb_billing_my_access();
 PERFORM ci.check_true(v.tier='vip' AND v.can_view_albums AND v.can_download AND NOT v.show_ads,
                   'VIP user has correct LIVE entitlement');
END $test$;
RESET ROLE;
SELECT 'CONCURRENT_INTEGRATION_TESTS_PASSED' AS outcome;
