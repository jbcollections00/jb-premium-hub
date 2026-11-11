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


-- Fixture is entirely synthetic. These users do not belong to any real project.
INSERT INTO auth.users(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.jb_billing_plans
 (code, display_name, price_centavos, currency, interval_unit, interval_count, grants_download, shows_ads, is_active)
VALUES
 ('standard','Standard CI',5000,'PHP','month',1,false,true,true),
 ('vip','VIP CI',15000,'PHP','month',1,true,false,true);
INSERT INTO public.jb_billing_live_checkout_control(singleton,checkout_enabled) VALUES (true,false);
INSERT INTO public.jb_billing_live_settlement_control(singleton,settlement_enabled) VALUES (true,false);
INSERT INTO public.jb_billing_live_webhook_worker_control(singleton,processing_enabled) VALUES (true,false);

-- Ensure the code remains unreachable to regular logged-in users.
DO $test$
DECLARE v_count integer;
BEGIN
 SELECT count(*) INTO v_count
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'jb_billing_%'
   AND p.proname <> 'jb_billing_my_access'
   AND (has_function_privilege('anon',p.oid,'EXECUTE')
        OR has_function_privilege('authenticated',p.oid,'EXECUTE'));
 PERFORM ci.check_true(v_count=0,'RPC privilege escalation');
END $test$;

SET ROLE service_role;
DO $test$
DECLARE v_denied boolean := false;
BEGIN
 BEGIN
  PERFORM public.jb_billing_create_live_order_v1('11111111-1111-4111-8111-111111111111','standard','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied := true;
 END;
 PERFORM ci.check_true(v_denied,'disabled checkout must refuse new orders');
END $test$;
RESET ROLE;

UPDATE public.jb_billing_live_checkout_control SET checkout_enabled=true;
SET ROLE service_role;
DO $test$
DECLARE v jsonb; v_second jsonb; v_claim jsonb; v_link jsonb;
        v_order uuid; v_bad boolean := false;
BEGIN
 v := public.jb_billing_create_live_order_v1(
  '11111111-1111-4111-8111-111111111111','standard','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 PERFORM ci.check_true(v->>'status'='created','standard order creation');
 v_order := (v->>'order_id')::uuid;
 v_second := public.jb_billing_create_live_order_v1(
  '11111111-1111-4111-8111-111111111111','standard','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 PERFORM ci.check_true(v_second->>'status'='existing' AND (v_second->>'order_id')::uuid = v_order,
                   'same idempotency key creates only one order');
 BEGIN
  PERFORM public.jb_billing_create_live_order_v1(
   '22222222-2222-4222-8222-222222222222','vip','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 EXCEPTION WHEN OTHERS THEN v_bad := true;
 END;
 PERFORM ci.check_true(v_bad,'idempotency key cannot be stolen by other user');
 v_claim := public.jb_billing_claim_live_checkout_v1(v_order);
 PERFORM ci.check_true(v_claim->>'status'='claimed','checkout claim acquired');
 v_link := public.jb_billing_link_live_checkout_v1(v_order,(v_claim->>'claim_token')::uuid,
              'cs_ci_standard0001','https://checkout.paymongo.com/ci-standard0001');
 PERFORM ci.check_true(v_link->>'status'='linked','session linked under claim');
 INSERT INTO ci.fixtures(name,val) VALUES('standard_order',v_order::text);
END $test$;

-- Synthetic provider-verification evidence, not a claimed actual PayMongo call.
DO $test$
DECLARE v_order uuid := (SELECT val::uuid FROM ci.fixtures WHERE name='standard_order');
        v_audit uuid;
        v_denied boolean := false;
BEGIN
 INSERT INTO public.jb_billing_live_payment_verification_audit
  (request_key, order_id, provider_environment, provider_event_id,
   provider_checkout_session_id, provider_payment_id,
   expected_amount_centavos, verified_amount_centavos, currency,
   verification_status, verification_reason, verified_at)
 VALUES
  ('ci_live_std_paid',v_order,'live','evt_ci_standard0001',
   'cs_ci_standard0001','pay_ci_standard0001',5000,5000,'PHP',
   'verified','paymongo_paid_payment_verified',now()) RETURNING id INTO v_audit;
 INSERT INTO ci.fixtures(name,val) VALUES('standard_audit',v_audit::text);
 BEGIN
  PERFORM public.jb_billing_settle_verified_live_v1(v_audit);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true;
 END;
 PERFORM ci.check_true(v_denied,'disabled settlement lock rejects verified evidence');
 PERFORM ci.check_true((SELECT count(*)=0 FROM public.jb_billing_entitlement_grants),
                   'disabled settlement cannot grant membership');
END $test$;
RESET ROLE;

UPDATE public.jb_billing_live_settlement_control SET settlement_enabled=true;
SET ROLE service_role;
DO $test$
DECLARE v_order uuid := (SELECT val::uuid FROM ci.fixtures WHERE name='standard_order');
        v_audit uuid := (SELECT val::uuid FROM ci.fixtures WHERE name='standard_audit');
        v_result jsonb; v_again jsonb;
BEGIN
 v_result:=public.jb_billing_settle_verified_live_v1(v_audit);
 PERFORM ci.check_true(v_result->>'status'='settled','verified payment settles exactly once');
 v_again:=public.jb_billing_settle_verified_live_v1(v_audit);
 PERFORM ci.check_true(v_again->>'status'='already_settled','settlement retry is idempotent');
 PERFORM ci.check_true((SELECT count(*)=1 FROM public.jb_billing_entitlement_grants WHERE order_id=v_order),
                  'one entitlement per paid order');
 PERFORM ci.check_true((SELECT count(*)=1 FROM public.jb_billing_subscriptions s
                    JOIN public.jb_billing_orders o ON o.subscription_id=s.id
                    WHERE o.id=v_order AND s.status='active' AND s.plan_code='standard'),
                  'standard subscription created');
 PERFORM ci.check_true((SELECT count(*)=1 FROM public.jb_billing_orders WHERE id=v_order AND status='paid'),
                  'order finalized');
END $test$;

-- Verify access is derived from the LIVE-only grant and RLS self-access.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
DO $test$
DECLARE v record;
BEGIN
 SELECT * INTO v FROM public.jb_billing_my_access();
 PERFORM ci.check_true(v.tier='standard' AND v.can_view_albums AND NOT v.can_download AND v.show_ads,
                   'standard user has correct access');
 PERFORM ci.check_true((SELECT count(*)=1 FROM public.jb_billing_orders),
                   'authenticated user may see only their own orders');
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SET ROLE authenticated;
DO $test$
DECLARE v record;
BEGIN
 SELECT * INTO v FROM public.jb_billing_my_access();
 PERFORM ci.check_true(v.tier='free' AND NOT v.can_view_albums AND NOT v.can_download,
                   'user without paid grant is free');
 PERFORM ci.check_true((SELECT count(*)=0 FROM public.jb_billing_orders),
                   'RLS hides another user order');
END $test$;
RESET ROLE;

-- Queue and event tests. The production worker checks PayMongo independently;
-- SQL tests exercise queue handling with synthetic verified audit evidence.
SET ROLE service_role;
DO $test$
DECLARE v_order uuid := (SELECT val::uuid FROM ci.fixtures WHERE name='standard_order');
        v_audit uuid := (SELECT val::uuid FROM ci.fixtures WHERE name='standard_audit');
        v_record jsonb; v_dup jsonb; v_claim jsonb; v_completed jsonb;
        v_denied boolean:=false; v_invalid boolean:=false;
BEGIN
 v_record:=public.jb_billing_record_enqueue_live_webhook_v1(
   'evt_ci_standard0001','cs_ci_standard0001',v_order);
 PERFORM ci.check_true(v_record->>'status'='queued','first webhook is queued');
 v_dup:=public.jb_billing_record_enqueue_live_webhook_v1(
   'evt_ci_standard0001','cs_ci_standard0001',v_order);
 PERFORM ci.check_true(v_dup->>'status'='duplicate','duplicate webhook cannot create new queue');
 BEGIN
   PERFORM public.jb_billing_claim_live_webhook_v1();
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true;
 END;
 PERFORM ci.check_true(v_denied,'worker disabled lock prevents claim');
END $test$;
RESET ROLE;
UPDATE public.jb_billing_live_webhook_worker_control SET processing_enabled=true;
SET ROLE service_role;
DO $test$
DECLARE v_order uuid := (SELECT val::uuid FROM ci.fixtures WHERE name='standard_order');
        v_audit uuid := (SELECT val::uuid FROM ci.fixtures WHERE name='standard_audit');
        v_claim jsonb; v_completed jsonb; v_bad boolean:=false;
BEGIN
 v_claim:=public.jb_billing_claim_live_webhook_v1();
 PERFORM ci.check_true(v_claim->>'status'='claimed','eligible webhook claimed');
 BEGIN
  PERFORM public.jb_billing_complete_live_webhook_v1(
     (v_claim->>'queue_id')::uuid,'99999999-9999-4999-8999-999999999999',v_audit);
 EXCEPTION WHEN OTHERS THEN v_bad:=true;
 END;
 PERFORM ci.check_true(v_bad,'incorrect claim token must fail completion');
 v_completed:=public.jb_billing_complete_live_webhook_v1(
     (v_claim->>'queue_id')::uuid,(v_claim->>'claim_token')::uuid,v_audit);
 PERFORM ci.check_true(v_completed->>'status'='completed','matching verified webhook completes');
 PERFORM ci.check_true((SELECT count(*)=1 FROM public.jb_billing_live_webhook_queue
                    WHERE processing_state='completed'), 'one completed webhook');
 PERFORM ci.check_true((SELECT count(*)=1 FROM public.jb_billing_webhook_events
                    WHERE processing_status='processed'), 'matching event processed');
 PERFORM ci.check_true((SELECT count(*)=1 FROM public.jb_billing_entitlement_grants WHERE order_id=v_order),
                   'webhook completion does not duplicate a grant');
 PERFORM ci.check_true((public.jb_billing_claim_live_webhook_v1()->>'status')='empty',
                   'queue drains after completion');
END $test$;

-- Concurrency fixture: prepare another legitimate synthetic verified audit.
DO $test$
DECLARE v_order uuid; v_audit uuid; v_result jsonb; v_claim jsonb; v_bad boolean:=false;
BEGIN
 v_result:=public.jb_billing_create_live_order_v1(
    '22222222-2222-4222-8222-222222222222','vip','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 PERFORM ci.check_true(v_result->>'status'='created','vip order created');
 v_order:=(v_result->>'order_id')::uuid;
 v_claim:=public.jb_billing_claim_live_checkout_v1(v_order);
 PERFORM ci.check_true(v_claim->>'status'='claimed','VIP checkout claimed');
 PERFORM ci.check_true((public.jb_billing_link_live_checkout_v1(
     v_order,(v_claim->>'claim_token')::uuid,'cs_ci_vip00001',
     'https://checkout.paymongo.com/ci-vip00001')->>'status')='linked',
     'VIP checkout linked');
 -- Deliberately weak/pending evidence must not settle.
 INSERT INTO public.jb_billing_live_payment_verification_audit
   (request_key,order_id,provider_environment,provider_checkout_session_id,
    provider_payment_id,expected_amount_centavos,verified_amount_centavos,currency,
    verification_status)
 VALUES('ci_pending_vip',v_order,'live','cs_ci_vip00001',
        'pay_ci_pendingvip',15000,15000,'PHP','pending') RETURNING id INTO v_audit;
 BEGIN
  PERFORM public.jb_billing_settle_verified_live_v1(v_audit);
 EXCEPTION WHEN OTHERS THEN v_bad:=true;
 END;
 PERFORM ci.check_true(v_bad,'pending/unverified audit must not settle');
 PERFORM ci.check_true((SELECT status='pending' FROM public.jb_billing_orders WHERE id=v_order),
                   'unverified audit does not change order');
 -- A payment ID already verified for a different order cannot be reused.
 v_bad := false;
 BEGIN
  INSERT INTO public.jb_billing_live_payment_verification_audit
   (request_key,order_id,provider_environment,provider_event_id,
    provider_checkout_session_id,provider_payment_id,
    expected_amount_centavos,verified_amount_centavos,currency,
    verification_status,verification_reason,verified_at)
  VALUES('ci_vip_stolen_payment',v_order,'live','evt_ci_stolen0001',
    'cs_ci_vip00001','pay_ci_standard0001',15000,15000,'PHP',
    'verified','paymongo_paid_payment_verified',now());
 EXCEPTION WHEN unique_violation THEN v_bad:=true;
 END;
 PERFORM ci.check_true(v_bad,'verified provider payment IDs must be globally unique');
 -- A signed-but-wrong amount is not eligible for VIP settlement.
 v_bad := false;
 INSERT INTO public.jb_billing_live_payment_verification_audit
  (request_key,order_id,provider_environment,provider_event_id,
   provider_checkout_session_id,provider_payment_id,
   expected_amount_centavos,verified_amount_centavos,currency,
   verification_status,verification_reason,verified_at)
 VALUES('ci_vip_wrong_amount',v_order,'live','evt_ci_wrongamt0001',
    'cs_ci_vip00001','pay_ci_wrongamt0001',5000,5000,'PHP',
    'verified','paymongo_paid_payment_verified',now()) RETURNING id INTO v_audit;
 BEGIN
  PERFORM public.jb_billing_settle_verified_live_v1(v_audit);
 EXCEPTION WHEN OTHERS THEN v_bad:=true;
 END;
 PERFORM ci.check_true(v_bad,'VIP payment with wrong verified amount cannot settle');
 INSERT INTO public.jb_billing_live_payment_verification_audit
  (request_key,order_id,provider_environment,provider_event_id,
   provider_checkout_session_id,provider_payment_id,
   expected_amount_centavos,verified_amount_centavos,currency,
   verification_status,verification_reason,verified_at)
 VALUES('ci_live_vip_paid',v_order,'live','evt_ci_vip00001',
    'cs_ci_vip00001','pay_ci_vip00001',15000,15000,'PHP',
    'verified','paymongo_paid_payment_verified',now()) RETURNING id INTO v_audit;
 INSERT INTO ci.fixtures(name,val) VALUES('concurrent_audit',v_audit::text),('concurrent_order',v_order::text);
END $test$;

-- Other role must never be able to execute the financial mutation RPC.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SET ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.jb_billing_settle_verified_live_v1('00000000-0000-4000-8000-000000000001'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;
 END;
 PERFORM ci.check_true(v_denied,'authenticated cannot execute settlement RPC');
END $test$;
RESET ROLE;

SELECT 'BASE_INTEGRATION_TESTS_PASSED' AS outcome;
