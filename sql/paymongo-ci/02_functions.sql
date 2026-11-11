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

CREATE OR REPLACE FUNCTION public.jb_billing_claim_live_checkout_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_order record;
    v_attempt record;
    v_token uuid;
    v_expected_amount integer;
BEGIN

    IF p_order_id IS NULL THEN
        RAISE EXCEPTION 'Order ID required';
    END IF;

    -- Lock the order to serialize concurrent claims.

    SELECT *
    INTO v_order
    FROM public.jb_billing_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'LIVE order not found';
    END IF;

    IF v_order.provider_environment IS DISTINCT FROM 'live'
       OR v_order.status IS DISTINCT FROM 'pending'
       OR v_order.billing_mode IS DISTINCT FROM 'manual_checkout'
       OR v_order.subscription_id IS NOT NULL
       OR v_order.paymongo_payment_id IS NOT NULL
       OR v_order.paymongo_checkout_session_id IS NOT NULL
       OR v_order.currency IS DISTINCT FROM 'PHP'
    THEN
        RAISE EXCEPTION 'LIVE order not eligible';
    END IF;

    v_expected_amount :=
        CASE v_order.plan_code
            WHEN 'standard' THEN 5000
            WHEN 'vip' THEN 15000
            ELSE NULL
        END;

    IF v_expected_amount IS NULL
       OR v_order.amount_centavos IS DISTINCT FROM
          v_expected_amount
       OR NOT EXISTS (
           SELECT 1
           FROM public.jb_billing_plans p
           WHERE p.code = v_order.plan_code
             AND p.is_active = true
             AND p.price_centavos = v_expected_amount
             AND p.currency = 'PHP'
             AND p.interval_unit = 'month'
             AND p.interval_count = 1
       )
    THEN
        RAISE EXCEPTION 'LIVE order plan mismatch';
    END IF;

    -- Create the tracking row only if missing.
    -- An existing row is never reset automatically.

    INSERT INTO public.jb_billing_live_checkout_attempts (
        order_id,
        state
    )
    VALUES (
        p_order_id,
        'ready'
    )
    ON CONFLICT (order_id) DO NOTHING;

    -- Claim only an attempt still marked ready.

    v_token := pg_catalog.gen_random_uuid();

    UPDATE public.jb_billing_live_checkout_attempts
    SET
        state = 'creating',
        claim_token = v_token,
        attempted_at = now(),
        updated_at = now(),
        last_error_code = NULL
    WHERE order_id = p_order_id
      AND state = 'ready'
    RETURNING *
    INTO v_attempt;

    IF NOT FOUND THEN

        SELECT *
        INTO v_attempt
        FROM public.jb_billing_live_checkout_attempts
        WHERE order_id = p_order_id;

        RETURN pg_catalog.jsonb_build_object(
            'status', 'not_claimed',
            'environment', 'live',
            'order_id', p_order_id,
            'state', v_attempt.state,
            'message',
                'Existing checkout attempt requires review or reuse'
        );

    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'status', 'claimed',
        'environment', 'live',
        'order_id', p_order_id,
        'claim_token', v_token,
        'state', 'creating'
    );

END;
$function$;

CREATE OR REPLACE FUNCTION public.jb_billing_claim_live_webhook_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_enabled boolean;
    v_item record;
    v_token uuid;
BEGIN

    -- 1. Check database-level worker switch.

    SELECT processing_enabled
    INTO v_enabled
    FROM public.jb_billing_live_webhook_worker_control
    WHERE singleton = true;

    IF v_enabled IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'LIVE webhook worker disabled'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Generate a unique claim token.

    v_token := pg_catalog.gen_random_uuid();

    -- 3. Atomically claim one eligible LIVE event.
    --
    -- SKIP LOCKED prevents two concurrent workers
    -- from claiming the same queue row.
    --
    -- Processing rows are NOT reclaimed automatically.
    -- They require explicit recovery review.

    WITH candidate AS (
        SELECT q.id
        FROM public.jb_billing_live_webhook_queue q
        JOIN public.jb_billing_webhook_events e
          ON e.id = q.webhook_event_id
        WHERE q.processing_state = 'pending'
          AND e.provider_environment = 'live'
          AND e.processing_status = 'received'
          AND q.attempt_count < 5
          AND (
              q.next_attempt_at IS NULL
              OR q.next_attempt_at <= now()
          )
        ORDER BY q.created_at, q.id
        LIMIT 1
        FOR UPDATE OF q SKIP LOCKED
    )
    UPDATE public.jb_billing_live_webhook_queue q
    SET
        processing_state = 'processing',
        claim_token = v_token,
        claimed_at = now(),
        attempt_count = q.attempt_count + 1,
        updated_at = now(),
        last_error_code = NULL
    FROM candidate c
    WHERE q.id = c.id
    RETURNING
        q.id,
        q.webhook_event_id,
        q.attempt_count
    INTO v_item;

    -- 4. Empty queue is a normal condition.

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
            'status', 'empty',
            'environment', 'live'
        );
    END IF;

    -- 5. Return the claimed event information.

    RETURN pg_catalog.jsonb_build_object(
        'status', 'claimed',
        'environment', 'live',
        'queue_id', v_item.id,
        'webhook_event_id', v_item.webhook_event_id,
        'claim_token', v_token,
        'attempt_count', v_item.attempt_count
    );

END;
$function$;

CREATE OR REPLACE FUNCTION public.jb_billing_complete_live_webhook_v1(p_queue_id uuid, p_claim_token uuid, p_audit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_queue record;
    v_event record;
    v_audit record;
    v_order record;
    v_subscription record;
    v_grant record;
    v_expected_amount integer;
BEGIN

    -- 1. Required identifiers.

    IF p_queue_id IS NULL
       OR p_claim_token IS NULL
       OR p_audit_id IS NULL
    THEN
        RAISE EXCEPTION
            'Webhook completion parameters required';
    END IF;

    -- 2. Lock the claimed queue item.

    SELECT *
    INTO v_queue
    FROM public.jb_billing_live_webhook_queue
    WHERE id = p_queue_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Webhook queue item not found';
    END IF;

    IF v_queue.processing_state IS DISTINCT FROM
       'processing'
       OR v_queue.claim_token IS DISTINCT FROM
          p_claim_token
       OR v_queue.claimed_at IS NULL
       OR v_queue.attempt_count < 1
    THEN
        RAISE EXCEPTION
            'Webhook processing claim mismatch';
    END IF;

    -- 3. Lock and validate the exact LIVE event.

    SELECT *
    INTO v_event
    FROM public.jb_billing_webhook_events
    WHERE id = v_queue.webhook_event_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_event.provider_environment
          IS DISTINCT FROM 'live'
       OR v_event.processing_status
          IS DISTINCT FROM 'received'
       OR v_event.event_type
          IS DISTINCT FROM 'checkout_session.payment.paid'
       OR v_event.provider_event_id IS NULL
       OR v_event.provider_object_id IS NULL
    THEN
        RAISE EXCEPTION
            'LIVE webhook event not eligible';
    END IF;

    -- 4. Verified audit must explicitly reference
    -- this exact PayMongo event.
    --
    -- Independent PayMongo verification is required
    -- in the trusted backend BEFORE this RPC.

    SELECT *
    INTO v_audit
    FROM public.jb_billing_live_payment_verification_audit
    WHERE id = p_audit_id
    FOR SHARE;

    IF NOT FOUND
       OR v_audit.provider_environment
          IS DISTINCT FROM 'live'
       OR v_audit.provider_event_id
          IS DISTINCT FROM v_event.provider_event_id
       OR v_audit.verification_status
          IS DISTINCT FROM 'verified'
       OR v_audit.verification_reason
          IS DISTINCT FROM 'paymongo_paid_payment_verified'
       OR v_audit.verified_at IS NULL
       OR v_audit.provider_payment_id IS NULL
       OR v_audit.provider_checkout_session_id IS NULL
    THEN
        RAISE EXCEPTION
            'LIVE webhook verification evidence mismatch';
    END IF;

    -- Checkout paid webhook identifies the CHECKOUT SESSION,
    -- not the individual PayMongo payment ID.
    -- Payment ID is independently verified in the audit/order.
    IF v_event.provider_object_id
       IS DISTINCT FROM v_audit.provider_checkout_session_id
    THEN
        RAISE EXCEPTION
            'Webhook checkout session mismatch';
    END IF;

    -- 5. Lock and validate the settled order.

    SELECT *
    INTO v_order
    FROM public.jb_billing_orders
    WHERE id = v_audit.order_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_order.provider_environment
          IS DISTINCT FROM 'live'
       OR v_order.status IS DISTINCT FROM 'paid'
       OR v_order.subscription_id IS NULL
       OR v_order.paymongo_payment_id
          IS DISTINCT FROM v_audit.provider_payment_id
       OR v_order.paymongo_checkout_session_id
          IS DISTINCT FROM
             v_audit.provider_checkout_session_id
       OR v_order.currency IS DISTINCT FROM 'PHP'
    THEN
        RAISE EXCEPTION
            'Settled LIVE order mismatch';
    END IF;

    v_expected_amount :=
        CASE v_order.plan_code
            WHEN 'standard' THEN 5000
            WHEN 'vip' THEN 15000
            ELSE NULL
        END;

    IF v_expected_amount IS NULL
       OR v_order.amount_centavos
          IS DISTINCT FROM v_expected_amount
       OR v_audit.expected_amount_centavos
          IS DISTINCT FROM v_expected_amount
       OR v_audit.verified_amount_centavos
          IS DISTINCT FROM v_expected_amount
       OR v_audit.currency IS DISTINCT FROM 'PHP'
    THEN
        RAISE EXCEPTION
            'Verified LIVE payment amount mismatch';
    END IF;

    -- 6. Confirm matching active subscription.

    SELECT *
    INTO v_subscription
    FROM public.jb_billing_subscriptions
    WHERE id = v_order.subscription_id
    FOR SHARE;

    IF NOT FOUND
       OR v_subscription.provider_environment
          IS DISTINCT FROM 'live'
       OR v_subscription.user_id
          IS DISTINCT FROM v_order.user_id
       OR v_subscription.plan_code
          IS DISTINCT FROM v_order.plan_code
       OR v_subscription.status IS DISTINCT FROM 'active'
       OR v_subscription.period_start IS NULL
       OR v_subscription.period_end IS NULL
       OR v_subscription.period_end <=
          v_subscription.period_start
    THEN
        RAISE EXCEPTION
            'LIVE subscription evidence mismatch';
    END IF;

    -- 7. Confirm exactly one matching entitlement.

    SELECT *
    INTO v_grant
    FROM public.jb_billing_entitlement_grants
    WHERE order_id = v_order.id
    FOR SHARE;

    IF NOT FOUND
       OR v_grant.provider_environment
          IS DISTINCT FROM 'live'
       OR v_grant.user_id
          IS DISTINCT FROM v_order.user_id
       OR v_grant.subscription_id
          IS DISTINCT FROM v_subscription.id
       OR v_grant.plan_code
          IS DISTINCT FROM v_order.plan_code
       OR v_grant.revoked_at IS NOT NULL
       OR v_grant.effective_until <=
          v_grant.effective_from
       OR v_grant.effective_from
          IS DISTINCT FROM v_subscription.period_start
       OR v_grant.effective_until
          IS DISTINCT FROM v_subscription.period_end
    THEN
        RAISE EXCEPTION
            'LIVE entitlement evidence mismatch';
    END IF;

    -- 8. Mark webhook event and queue completed.
    -- Both updates belong to one transaction.

    UPDATE public.jb_billing_webhook_events
    SET
        processing_status = 'processed',
        processed_at = now(),
        processing_error = NULL
    WHERE id = v_event.id
      AND provider_environment = 'live'
      AND processing_status = 'received';

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Webhook event completion failed';
    END IF;

    UPDATE public.jb_billing_live_webhook_queue
    SET
        processing_state = 'completed',
        claim_token = NULL,
        claimed_at = NULL,
        next_attempt_at = NULL,
        last_error_code = NULL,
        updated_at = now()
    WHERE id = p_queue_id
      AND processing_state = 'processing'
      AND claim_token = p_claim_token;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Webhook queue completion failed';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'status', 'completed',
        'environment', 'live',
        'queue_id', p_queue_id,
        'order_id', v_order.id,
        'subscription_id', v_subscription.id,
        'audit_id', v_audit.id,
        'payment_already_settled', true,
        'new_payment_created', false,
        'new_membership_created', false
    );

END;
$function$;

CREATE OR REPLACE FUNCTION public.jb_billing_create_live_order_v1(p_user_id uuid, p_plan_code text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_enabled boolean;
    v_existing record;
    v_price integer;
    v_count bigint;
    v_order_id uuid;
BEGIN

    -- Checkout must be explicitly enabled.

    SELECT checkout_enabled
    INTO v_enabled
    FROM public.jb_billing_live_checkout_control
    WHERE singleton = true;

    IF v_enabled IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'LIVE checkout disabled'
            USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS NULL OR p_request_id IS NULL
       OR p_plan_code NOT IN ('standard', 'vip')
       OR p_plan_code IS NULL
    THEN
        RAISE EXCEPTION 'Invalid LIVE checkout request';
    END IF;

    -- Prevent concurrent order creation for the same
    -- authenticated user.

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            p_user_id::text,
            928542
        )
    );

    -- Reuse a prior order only when its idempotency key
    -- belongs to the same user and plan.

    SELECT *
    INTO v_existing
    FROM public.jb_billing_live_checkout_requests
    WHERE request_id = p_request_id;

    IF FOUND THEN

        IF v_existing.user_id IS DISTINCT FROM p_user_id
           OR v_existing.plan_code IS DISTINCT FROM p_plan_code
        THEN
            RAISE EXCEPTION
                'Checkout request key belongs to another request';
        END IF;

        RETURN pg_catalog.jsonb_build_object(
            'status', 'existing',
            'environment', 'live',
            'order_id', v_existing.order_id
        );

    END IF;

    -- Validate plan and pricing on the server.

    v_price :=
        CASE p_plan_code
            WHEN 'standard' THEN 5000
            WHEN 'vip' THEN 15000
            ELSE NULL
        END;

    IF NOT EXISTS (
        SELECT 1
        FROM public.jb_billing_plans p
        WHERE p.code = p_plan_code
          AND p.is_active = true
          AND p.price_centavos = v_price
          AND p.currency = 'PHP'
          AND p.interval_unit = 'month'
          AND p.interval_count = 1
    ) THEN
        RAISE EXCEPTION
            'LIVE subscription plan configuration invalid';
    END IF;

    -- Limit new orders to three per user per hour.

    SELECT count(*)
    INTO v_count
    FROM public.jb_billing_orders o
    WHERE o.user_id = p_user_id
      AND o.provider_environment = 'live'
      AND o.created_at > now() - interval '1 hour';

    IF v_count >= 3 THEN
        RAISE EXCEPTION
            'LIVE checkout rate limit reached';
    END IF;

    -- Create pending order only.
    -- No PayMongo request or subscription activation.

    INSERT INTO public.jb_billing_orders (
        user_id,
        plan_code,
        billing_mode,
        provider_environment,
        amount_centavos,
        currency,
        status
    )
    VALUES (
        p_user_id,
        p_plan_code,
        'manual_checkout',
        'live',
        v_price,
        'PHP',
        'pending'
    )
    RETURNING id INTO v_order_id;

    INSERT INTO public.jb_billing_live_checkout_requests (
        request_id,
        user_id,
        plan_code,
        order_id
    )
    VALUES (
        p_request_id,
        p_user_id,
        p_plan_code,
        v_order_id
    );

    RETURN pg_catalog.jsonb_build_object(
        'status', 'created',
        'environment', 'live',
        'order_id', v_order_id
    );

END;
$function$;

CREATE OR REPLACE FUNCTION public.jb_billing_finalize_live_webhook_failure_v1(p_queue_id uuid, p_claim_token uuid, p_outcome text, p_error_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_queue record;
    v_event record;
    v_next_state text;
    v_next_attempt timestamptz;
    v_delay_minutes integer;
    v_error text;
BEGIN

    -- 1. Validate request.

    IF p_queue_id IS NULL
       OR p_claim_token IS NULL
       OR p_outcome NOT IN ('retry', 'review_required')
       OR p_outcome IS NULL
    THEN
        RAISE EXCEPTION
            'Invalid webhook finalization request';
    END IF;

    -- Allow controlled, non-sensitive error codes only.

    IF p_error_code IS NULL
       OR p_error_code !~ '^[A-Z][A-Z0-9_]{2,63}$'
    THEN
        RAISE EXCEPTION
            'Invalid webhook error code';
    END IF;

    v_error := p_error_code;

    -- 2. Lock the queue item.

    SELECT *
    INTO v_queue
    FROM public.jb_billing_live_webhook_queue
    WHERE id = p_queue_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Webhook queue item not found';
    END IF;

    -- 3. Confirm matching LIVE event.

    SELECT *
    INTO v_event
    FROM public.jb_billing_webhook_events
    WHERE id = v_queue.webhook_event_id;

    IF NOT FOUND
       OR v_event.provider_environment IS DISTINCT FROM 'live'
       OR v_event.processing_status IS DISTINCT FROM 'received'
    THEN
        RAISE EXCEPTION 'LIVE webhook event mismatch';
    END IF;

    -- 4. Only the current claim holder may finalize.

    IF v_queue.processing_state IS DISTINCT FROM 'processing'
       OR v_queue.claim_token IS DISTINCT FROM p_claim_token
       OR v_queue.claimed_at IS NULL
       OR v_queue.attempt_count < 1
    THEN
        RAISE EXCEPTION
            'Webhook processing claim mismatch';
    END IF;

    -- 5. Only retry transient failures.
    -- Payment inconsistencies require manual review.

    IF p_outcome = 'retry'
       AND v_error NOT IN (
           'PROVIDER_UNAVAILABLE',
           'PROVIDER_TIMEOUT',
           'TRANSIENT_DB_ERROR'
       )
    THEN
        RAISE EXCEPTION
            'Non-transient webhook errors require review';
    END IF;

    -- 6. Bound retries.
    -- 5 is the maximum number of claims.

    IF p_outcome = 'retry'
       AND v_queue.attempt_count < 5
    THEN
        v_next_state := 'pending';

        -- Backoff: 2, 4, 8, 16 minutes
        -- for attempts 1 through 4.

        v_delay_minutes :=
            power(2, v_queue.attempt_count)::integer;

        v_next_attempt :=
            now() + make_interval(mins => v_delay_minutes);
    ELSE
        v_next_state := 'review_required';
        v_next_attempt := NULL;
    END IF;

    -- 7. Finalize failure handling atomically.
    -- No order, payment, or entitlement mutation.

    UPDATE public.jb_billing_live_webhook_queue
    SET
        processing_state = v_next_state,
        claim_token = NULL,
        claimed_at = NULL,
        next_attempt_at = v_next_attempt,
        last_error_code = v_error,
        updated_at = now()
    WHERE id = p_queue_id
      AND processing_state = 'processing'
      AND claim_token = p_claim_token;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Webhook failure finalization unsuccessful';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'status', v_next_state,
        'environment', 'live',
        'queue_id', p_queue_id,
        'attempt_count', v_queue.attempt_count,
        'next_attempt_at', v_next_attempt,
        'payment_settled', false,
        'membership_activated', false
    );

END;
$function$;

CREATE OR REPLACE FUNCTION public.jb_billing_link_live_checkout_v1(p_order_id uuid, p_claim_token uuid, p_checkout_session_id text, p_checkout_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_order record;
    v_attempt record;
    v_expected_price integer;
BEGIN

    -- 1. Validate required identifiers.

    IF p_order_id IS NULL
       OR p_claim_token IS NULL
       OR p_checkout_session_id IS NULL
       OR p_checkout_url IS NULL
    THEN
        RAISE EXCEPTION
            'Checkout linking parameters required';
    END IF;

    -- 2. Validate basic PayMongo session format.

    IF p_checkout_session_id
       !~ '^cs_[A-Za-z0-9_-]{6,200}$'
    THEN
        RAISE EXCEPTION
            'Invalid PayMongo checkout session ID';
    END IF;

    -- Basic checkout URL protection.
    -- Backend must additionally validate the URL
    -- and independently retrieve the PayMongo session.

    IF p_checkout_url !~
       '^https://checkout[.]paymongo[.]com/[^[:space:]]+$'
       OR pg_catalog.length(p_checkout_url) > 2048
    THEN
        RAISE EXCEPTION
            'Invalid PayMongo checkout URL';
    END IF;

    -- 3. Lock the LIVE billing order.

    SELECT *
    INTO v_order
    FROM public.jb_billing_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Billing order not found';
    END IF;

    IF v_order.provider_environment IS DISTINCT FROM 'live'
       OR v_order.billing_mode IS DISTINCT FROM 'manual_checkout'
       OR v_order.status IS DISTINCT FROM 'pending'
       OR v_order.subscription_id IS NOT NULL
       OR v_order.paymongo_payment_id IS NOT NULL
       OR v_order.paymongo_checkout_session_id IS NOT NULL
       OR v_order.currency IS DISTINCT FROM 'PHP'
    THEN
        RAISE EXCEPTION
            'LIVE order is not eligible for session linking';
    END IF;

    -- 4. Validate exact plan pricing.

    v_expected_price :=
        CASE v_order.plan_code
            WHEN 'standard' THEN 5000
            WHEN 'vip' THEN 15000
            ELSE NULL
        END;

    IF v_expected_price IS NULL
       OR v_order.amount_centavos
          IS DISTINCT FROM v_expected_price
       OR NOT EXISTS (
           SELECT 1
           FROM public.jb_billing_plans p
           WHERE p.code = v_order.plan_code
             AND p.is_active = true
             AND p.price_centavos = v_expected_price
             AND p.currency = 'PHP'
             AND p.interval_unit = 'month'
             AND p.interval_count = 1
       )
    THEN
        RAISE EXCEPTION
            'LIVE billing plan or price mismatch';
    END IF;

    -- 5. Verify the checkout creation claim.
    -- Only the request holding this exact claim token
    -- may attach the checkout session.

    SELECT *
    INTO v_attempt
    FROM public.jb_billing_live_checkout_attempts
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_attempt.state IS DISTINCT FROM 'creating'
       OR v_attempt.claim_token
          IS DISTINCT FROM p_claim_token
    THEN
        RAISE EXCEPTION
            'LIVE checkout claim mismatch';
    END IF;

    -- 6. Attach the verified session.
    -- Existing database unique indexes prevent
    -- session reuse across different LIVE orders.

    UPDATE public.jb_billing_orders
    SET
        paymongo_checkout_session_id =
            p_checkout_session_id,
        checkout_url = p_checkout_url,
        updated_at = now()
    WHERE id = p_order_id
      AND provider_environment = 'live'
      AND status = 'pending'
      AND paymongo_checkout_session_id IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'LIVE checkout session attachment failed';
    END IF;

    -- 7. Mark the attempt linked.
    -- Everything commits or rolls back together.

    UPDATE public.jb_billing_live_checkout_attempts
    SET
        state = 'linked',
        updated_at = now(),
        last_error_code = NULL
    WHERE order_id = p_order_id
      AND state = 'creating'
      AND claim_token = p_claim_token;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'LIVE checkout attempt finalization failed';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'status', 'linked',
        'environment', 'live',
        'order_id', p_order_id,
        'checkout_session_id',
            p_checkout_session_id
    );

END;
$function$;

CREATE OR REPLACE FUNCTION public.jb_billing_my_access()
 RETURNS TABLE(tier text, can_view_albums boolean, can_download boolean, show_ads boolean, access_expires_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with best_grant as (
    select g.plan_code, g.effective_until, p.grants_download, p.shows_ads
    from public.jb_billing_entitlement_grants g
    join public.jb_billing_plans p on p.code = g.plan_code
    where g.user_id = (select auth.uid())
      and g.provider_environment = 'live'
      and g.revoked_at is null
      and g.effective_from <= now()
      and g.effective_until > now()
    order by p.grants_download desc, g.effective_until desc
    limit 1
  )
  select coalesce(b.plan_code,'free')::text,
         (b.plan_code is not null),
         coalesce(b.grants_download,false),
         coalesce(b.shows_ads,false),
         b.effective_until
  from (select 1) v left join best_grant b on true;
$function$;

CREATE OR REPLACE FUNCTION public.jb_billing_quarantine_live_checkout_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_order record;
    v_attempt record;
BEGIN

    IF p_order_id IS NULL THEN
        RAISE EXCEPTION 'Order ID required';
    END IF;

    -- Serialize against existing checkout operations.

    SELECT *
    INTO v_order
    FROM public.jb_billing_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_order.provider_environment IS DISTINCT FROM 'live'
    THEN
        RAISE EXCEPTION 'LIVE order not found';
    END IF;

    SELECT *
    INTO v_attempt
    FROM public.jb_billing_live_checkout_attempts
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Checkout attempt not found';
    END IF;

    -- Idempotent: already quarantined.

    IF v_attempt.state = 'review_required' THEN
        RETURN pg_catalog.jsonb_build_object(
            'status', 'already_quarantined',
            'environment', 'live',
            'order_id', p_order_id
        );
    END IF;

    -- Never quarantine a linked session or reset
    -- a completed/failed payment automatically.

    IF v_order.status IS DISTINCT FROM 'pending'
       OR v_order.paymongo_checkout_session_id IS NOT NULL
       OR v_attempt.state IS DISTINCT FROM 'creating'
       OR v_attempt.attempted_at IS NULL
       OR v_attempt.attempted_at >
          now() - interval '15 minutes'
    THEN
        RAISE EXCEPTION
            'Checkout attempt not eligible for quarantine';
    END IF;

    -- Metadata-only recovery quarantine.
    -- No PayMongo API request.
    -- No new checkout session.
    -- No membership activation.

    UPDATE public.jb_billing_live_checkout_attempts
    SET
        state = 'review_required',
        updated_at = now(),
        last_error_code = 'STALE_CHECKOUT_REQUIRES_REVIEW'
    WHERE order_id = p_order_id
      AND state = 'creating';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Checkout quarantine failed';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'status', 'quarantined',
        'environment', 'live',
        'order_id', p_order_id,
        'requires_provider_review', true,
        'new_checkout_created', false
    );

END;
$function$;

CREATE OR REPLACE FUNCTION public.jb_billing_record_enqueue_live_webhook_v1(p_event_id text, p_session_id text, p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_order record;
    v_event record;
    v_queue record;
    v_inserted boolean := false;
BEGIN
    IF p_order_id IS NULL
       OR p_event_id IS NULL OR p_event_id !~ '^evt_[A-Za-z0-9_-]{6,200}$'
       OR p_session_id IS NULL OR p_session_id !~ '^cs_[A-Za-z0-9_-]{6,200}$'
    THEN
        RAISE EXCEPTION 'Invalid LIVE webhook identifiers';
    END IF;

    -- A trusted, service-role backend must verify the PayMongo signature
    -- on the raw body *before* invoking this function.
    SELECT id, status, paymongo_checkout_session_id
      INTO v_order
      FROM public.jb_billing_orders
     WHERE id = p_order_id
       AND provider_environment = 'live'
       AND billing_mode = 'manual_checkout'
     FOR SHARE;

    IF NOT FOUND
       OR v_order.paymongo_checkout_session_id IS DISTINCT FROM p_session_id
       OR v_order.status NOT IN ('pending', 'paid')
    THEN
        RAISE EXCEPTION 'LIVE webhook checkout order mismatch';
    END IF;

    -- On conflict do not mutate a previously processed event or overwrite
    -- event identity. The same event ID cannot be reused for another session.
    INSERT INTO public.jb_billing_webhook_events (
        provider_environment, provider_event_id, event_type,
        provider_object_id, processing_status
    ) VALUES (
        'live', p_event_id, 'checkout_session.payment.paid',
        p_session_id, 'received'
    )
    ON CONFLICT (provider_environment, provider_event_id) DO NOTHING
    RETURNING id, event_type, provider_object_id, processing_status INTO v_event;

    IF FOUND THEN v_inserted := true; END IF;

    IF NOT v_inserted THEN
        SELECT id, event_type, provider_object_id, processing_status
          INTO v_event
          FROM public.jb_billing_webhook_events
         WHERE provider_environment = 'live'
           AND provider_event_id = p_event_id
         FOR UPDATE;
        IF NOT FOUND
           OR v_event.event_type IS DISTINCT FROM 'checkout_session.payment.paid'
           OR v_event.provider_object_id IS DISTINCT FROM p_session_id
           OR v_event.processing_status NOT IN ('received','processed')
        THEN
            RAISE EXCEPTION 'Conflicting or failed LIVE webhook event';
        END IF;
    END IF;

    IF v_event.processing_status = 'processed' AND NOT EXISTS (
       SELECT 1 FROM public.jb_billing_live_webhook_queue
        WHERE webhook_event_id = v_event.id
    ) THEN
       RAISE EXCEPTION 'Processed webhook missing queue record';
    END IF;

    INSERT INTO public.jb_billing_live_webhook_queue (
        webhook_event_id, processing_state
    ) VALUES (v_event.id, 'pending')
    ON CONFLICT (webhook_event_id) DO NOTHING
    RETURNING id, processing_state INTO v_queue;

    IF NOT FOUND THEN
        SELECT id, processing_state
          INTO v_queue
          FROM public.jb_billing_live_webhook_queue
         WHERE webhook_event_id = v_event.id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'LIVE webhook queue unavailable';
        END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'status', CASE WHEN v_inserted THEN 'queued' ELSE 'duplicate' END,
        'environment', 'live',
        'event_id', v_event.id,
        'queue_id', v_queue.id,
        'queue_state', v_queue.processing_state,
        'settlement_performed', false
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.jb_billing_recover_stale_live_webhook_v1(p_queue_id uuid, p_expected_claim_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_item record;
    v_event record;
    v_worker_enabled boolean;
    v_settlement_enabled boolean;
BEGIN
    IF p_queue_id IS NULL
       OR p_expected_claim_token IS NULL
    THEN
        RAISE EXCEPTION
            'Recovery identifiers required';
    END IF;

    -- Safety controls remain SELECT-only.
    -- Do not use FOR SHARE here.

    SELECT processing_enabled
    INTO v_worker_enabled
    FROM public.jb_billing_live_webhook_worker_control
    WHERE singleton = true;

    IF v_worker_enabled IS DISTINCT FROM false THEN
        RAISE EXCEPTION
            'Disable LIVE webhook worker before recovery';
    END IF;

    SELECT settlement_enabled
    INTO v_settlement_enabled
    FROM public.jb_billing_live_settlement_control
    WHERE singleton = true;

    IF v_settlement_enabled IS DISTINCT FROM false THEN
        RAISE EXCEPTION
            'Disable LIVE settlement before recovery';
    END IF;

    -- Lock the exact processing queue item.

    SELECT *
    INTO v_item
    FROM public.jb_billing_live_webhook_queue
    WHERE id = p_queue_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Webhook queue item not found';
    END IF;

    IF v_item.processing_state IS DISTINCT FROM 'processing'
       OR v_item.claim_token IS DISTINCT FROM p_expected_claim_token
       OR v_item.claimed_at IS NULL
    THEN
        RAISE EXCEPTION
            'Recovery claim mismatch';
    END IF;

    IF v_item.claimed_at >
       pg_catalog.now() - interval '15 minutes'
    THEN
        RAISE EXCEPTION
            'Webhook claim is not stale';
    END IF;

    -- Confirm exact LIVE webhook event.
    -- Plain SELECT is sufficient here.

    SELECT *
    INTO v_event
    FROM public.jb_billing_webhook_events
    WHERE id = v_item.webhook_event_id;

    IF NOT FOUND
       OR v_event.provider_environment IS DISTINCT FROM 'live'
       OR v_event.processing_status IS DISTINCT FROM 'received'
    THEN
        RAISE EXCEPTION
            'LIVE webhook event mismatch';
    END IF;

    -- Quarantine only; never settle payment.

    UPDATE public.jb_billing_live_webhook_queue
    SET
        processing_state = 'review_required',
        claim_token = NULL,
        claimed_at = NULL,
        next_attempt_at = NULL,
        last_error_code = 'STALE_CLAIM_RECOVERY',
        updated_at = pg_catalog.now()
    WHERE id = p_queue_id
      AND processing_state = 'processing'
      AND claim_token = p_expected_claim_token;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Stale recovery update failed';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'status', 'review_required',
        'environment', 'live',
        'queue_id', p_queue_id,
        'reason', 'STALE_CLAIM_RECOVERY',
        'payment_settled_by_recovery', false,
        'membership_activated_by_recovery', false
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.jb_billing_requeue_settled_live_webhook_v1(p_queue_id uuid, p_audit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_queue record;
    v_event record;
    v_audit record;
    v_order record;
    v_subscription record;
    v_grant record;
    v_worker_enabled boolean;
    v_settlement_enabled boolean;
    v_checkout_enabled boolean;
    v_expected integer;
BEGIN

    IF p_queue_id IS NULL OR p_audit_id IS NULL THEN
        RAISE EXCEPTION 'Recovery identifiers required';
    END IF;

    -- This procedure is for offline supervised maintenance.
    -- Never permit recovery while live processing is enabled.

    SELECT processing_enabled
    INTO v_worker_enabled
    FROM public.jb_billing_live_webhook_worker_control
    WHERE singleton = true;

    SELECT settlement_enabled
    INTO v_settlement_enabled
    FROM public.jb_billing_live_settlement_control
    WHERE singleton = true;

    SELECT checkout_enabled
    INTO v_checkout_enabled
    FROM public.jb_billing_live_checkout_control
    WHERE singleton = true;

    IF v_worker_enabled IS DISTINCT FROM false
       OR v_settlement_enabled IS DISTINCT FROM false
       OR v_checkout_enabled IS DISTINCT FROM false
    THEN
        RAISE EXCEPTION
            'Disable LIVE checkout, worker and settlement first';
    END IF;

    -- Lock exactly one quarantined queue item.

    SELECT *
    INTO v_queue
    FROM public.jb_billing_live_webhook_queue
    WHERE id = p_queue_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_queue.processing_state IS DISTINCT FROM 'review_required'
       OR v_queue.last_error_code IS DISTINCT FROM 'STALE_CLAIM_RECOVERY'
       OR v_queue.claim_token IS NOT NULL
       OR v_queue.claimed_at IS NOT NULL
       OR v_queue.attempt_count < 1
    THEN
        RAISE EXCEPTION
            'Queue is not eligible for settled-payment requeue';
    END IF;

    SELECT *
    INTO v_event
    FROM public.jb_billing_webhook_events
    WHERE id = v_queue.webhook_event_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_event.provider_environment IS DISTINCT FROM 'live'
       OR v_event.processing_status IS DISTINCT FROM 'received'
       OR v_event.event_type IS DISTINCT FROM
          'checkout_session.payment.paid'
       OR v_event.provider_event_id IS NULL
       OR v_event.provider_object_id IS NULL
    THEN
        RAISE EXCEPTION
            'LIVE webhook evidence mismatch';
    END IF;

    SELECT *
    INTO v_audit
    FROM public.jb_billing_live_payment_verification_audit
    WHERE id = p_audit_id
    FOR SHARE;

    IF NOT FOUND
       OR v_audit.provider_environment IS DISTINCT FROM 'live'
       OR v_audit.verification_status IS DISTINCT FROM 'verified'
       OR v_audit.verification_reason IS DISTINCT FROM
          'paymongo_paid_payment_verified'
       OR v_audit.verified_at IS NULL
       OR v_audit.provider_event_id IS DISTINCT FROM
          v_event.provider_event_id
       OR v_audit.provider_checkout_session_id IS DISTINCT FROM
          v_event.provider_object_id
       OR v_audit.provider_payment_id IS NULL
    THEN
        RAISE EXCEPTION
            'Verified LIVE payment audit mismatch';
    END IF;

    SELECT *
    INTO v_order
    FROM public.jb_billing_orders
    WHERE id = v_audit.order_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_order.provider_environment IS DISTINCT FROM 'live'
       OR v_order.billing_mode IS DISTINCT FROM 'manual_checkout'
       OR v_order.status IS DISTINCT FROM 'paid'
       OR v_order.subscription_id IS NULL
       OR v_order.paymongo_payment_id IS DISTINCT FROM
          v_audit.provider_payment_id
       OR v_order.paymongo_checkout_session_id IS DISTINCT FROM
          v_audit.provider_checkout_session_id
       OR v_order.currency IS DISTINCT FROM 'PHP'
    THEN
        RAISE EXCEPTION
            'Already-paid LIVE order mismatch';
    END IF;

    v_expected :=
        CASE v_order.plan_code
            WHEN 'standard' THEN 5000
            WHEN 'vip' THEN 15000
            ELSE NULL
        END;

    IF v_expected IS NULL
       OR v_order.amount_centavos IS DISTINCT FROM v_expected
       OR v_audit.expected_amount_centavos IS DISTINCT FROM v_expected
       OR v_audit.verified_amount_centavos IS DISTINCT FROM v_expected
       OR v_audit.currency IS DISTINCT FROM 'PHP'
    THEN
        RAISE EXCEPTION
            'LIVE payment amount mismatch';
    END IF;

    SELECT *
    INTO v_subscription
    FROM public.jb_billing_subscriptions
    WHERE id = v_order.subscription_id
    FOR SHARE;

    IF NOT FOUND
       OR v_subscription.provider_environment IS DISTINCT FROM 'live'
       OR v_subscription.user_id IS DISTINCT FROM v_order.user_id
       OR v_subscription.plan_code IS DISTINCT FROM v_order.plan_code
       OR v_subscription.status IS DISTINCT FROM 'active'
       OR v_subscription.period_start IS NULL
       OR v_subscription.period_end IS NULL
       OR v_subscription.period_end <= v_subscription.period_start
    THEN
        RAISE EXCEPTION
            'LIVE subscription mismatch';
    END IF;

    SELECT *
    INTO v_grant
    FROM public.jb_billing_entitlement_grants
    WHERE order_id = v_order.id
    FOR SHARE;

    IF NOT FOUND
       OR v_grant.provider_environment IS DISTINCT FROM 'live'
       OR v_grant.user_id IS DISTINCT FROM v_order.user_id
       OR v_grant.subscription_id IS DISTINCT FROM v_subscription.id
       OR v_grant.plan_code IS DISTINCT FROM v_order.plan_code
       OR v_grant.revoked_at IS NOT NULL
       OR v_grant.effective_from IS DISTINCT FROM
          v_subscription.period_start
       OR v_grant.effective_until IS DISTINCT FROM
          v_subscription.period_end
       OR v_grant.effective_until <= v_grant.effective_from
    THEN
        RAISE EXCEPTION
            'LIVE entitlement mismatch';
    END IF;

    -- Reset claim eligibility after explicit review.
    -- The worker must perform a fresh PayMongo verification
    -- when this item is claimed again.

    UPDATE public.jb_billing_live_webhook_queue
    SET
        processing_state = 'pending',
        claim_token = NULL,
        claimed_at = NULL,
        next_attempt_at = pg_catalog.now(),
        attempt_count = 0,
        last_error_code = 'MANUAL_RECOVERY_REQUEUED',
        updated_at = pg_catalog.now()
    WHERE id = p_queue_id
      AND processing_state = 'review_required'
      AND last_error_code = 'STALE_CLAIM_RECOVERY';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Recovery requeue failed';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'status', 'requeued',
        'environment', 'live',
        'queue_id', p_queue_id,
        'order_id', v_order.id,
        'audit_id', v_audit.id,
        'requires_fresh_provider_verification', true,
        'payment_settled_by_recovery', false,
        'membership_created_by_recovery', false
    );

END;
$function$;

CREATE OR REPLACE FUNCTION public.jb_billing_settle_verified_live_v1(p_audit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_enabled boolean;
    v_audit record;
    v_order record;
    v_plan record;
    v_sub record;
    v_grant record;

    v_subscription_id uuid;
    v_period_start timestamptz;
    v_period_end timestamptz;
BEGIN

    -- 1. Database-level emergency lock.
    -- An unset or disabled switch always denies settlement.

    SELECT settlement_enabled
    INTO v_enabled
    FROM public.jb_billing_live_settlement_control
    WHERE singleton = true;

    IF v_enabled IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'LIVE settlement disabled'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Lock the independently verified LIVE audit.

    SELECT *
    INTO v_audit
    FROM public.jb_billing_live_payment_verification_audit
    WHERE id = p_audit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'LIVE verification audit not found';
    END IF;

    IF v_audit.provider_environment IS DISTINCT FROM 'live'
       OR v_audit.verification_status IS DISTINCT FROM 'verified'
       OR v_audit.verification_reason IS DISTINCT FROM
          'paymongo_paid_payment_verified'
       OR v_audit.provider_payment_id IS NULL
       OR v_audit.provider_checkout_session_id IS NULL
       OR v_audit.verified_at IS NULL
       OR v_audit.currency IS DISTINCT FROM 'PHP'
       OR v_audit.verified_amount_centavos
          IS DISTINCT FROM v_audit.expected_amount_centavos
    THEN
        RAISE EXCEPTION
            'LIVE payment verification evidence invalid';
    END IF;

    -- 3. Lock the matching LIVE order.

    SELECT *
    INTO v_order
    FROM public.jb_billing_orders
    WHERE id = v_audit.order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Billing order not found';
    END IF;

    IF v_order.provider_environment IS DISTINCT FROM 'live'
       OR v_order.billing_mode IS DISTINCT FROM 'manual_checkout'
       OR v_order.plan_code NOT IN ('standard', 'vip')
       OR v_order.currency IS DISTINCT FROM 'PHP'
       OR v_order.amount_centavos
          IS DISTINCT FROM v_audit.verified_amount_centavos
       OR v_order.paymongo_checkout_session_id
          IS DISTINCT FROM v_audit.provider_checkout_session_id
    THEN
        RAISE EXCEPTION 'LIVE billing order mismatch';
    END IF;

    -- 4. Validate configured plan and exact price.

    SELECT *
    INTO v_plan
    FROM public.jb_billing_plans
    WHERE code = v_order.plan_code
      AND is_active = true;

    IF NOT FOUND
       OR v_plan.currency IS DISTINCT FROM 'PHP'
       OR v_plan.interval_unit IS DISTINCT FROM 'month'
       OR v_plan.interval_count IS DISTINCT FROM 1
       OR v_plan.price_centavos
          IS DISTINCT FROM v_order.amount_centavos
       OR (
          v_order.plan_code = 'standard'
          AND v_order.amount_centavos <> 5000
       )
       OR (
          v_order.plan_code = 'vip'
          AND v_order.amount_centavos <> 15000
       )
    THEN
        RAISE EXCEPTION 'LIVE subscription plan mismatch';
    END IF;

    -- 5. Idempotency for an already-settled order.

    IF v_order.status = 'paid' THEN

        IF v_order.paymongo_payment_id
              IS DISTINCT FROM v_audit.provider_payment_id
           OR v_order.subscription_id IS NULL
        THEN
            RAISE EXCEPTION
                'Paid order does not match verified payment';
        END IF;

        SELECT *
        INTO v_sub
        FROM public.jb_billing_subscriptions
        WHERE id = v_order.subscription_id;

        SELECT *
        INTO v_grant
        FROM public.jb_billing_entitlement_grants
        WHERE order_id = v_order.id;

        IF v_sub.id IS NULL
           OR v_grant.id IS NULL
           OR v_sub.provider_environment IS DISTINCT FROM 'live'
           OR v_grant.provider_environment IS DISTINCT FROM 'live'
           OR v_sub.user_id IS DISTINCT FROM v_order.user_id
           OR v_grant.user_id IS DISTINCT FROM v_order.user_id
           OR v_sub.plan_code IS DISTINCT FROM v_order.plan_code
           OR v_grant.plan_code IS DISTINCT FROM v_order.plan_code
           OR v_grant.subscription_id
              IS DISTINCT FROM v_order.subscription_id
        THEN
            RAISE EXCEPTION
                'Existing LIVE settlement integrity mismatch';
        END IF;

        RETURN pg_catalog.jsonb_build_object(
            'status', 'already_settled',
            'environment', 'live',
            'order_id', v_order.id,
            'subscription_id', v_order.subscription_id
        );
    END IF;

    IF v_order.status IS DISTINCT FROM 'pending'
       OR v_order.subscription_id IS NOT NULL
       OR v_order.paymongo_payment_id IS NOT NULL
    THEN
        RAISE EXCEPTION
            'Order is not eligible for LIVE settlement';
    END IF;

    -- 6. Check for payment reuse.
    -- Existing unique indexes also enforce this.

    IF EXISTS (
        SELECT 1
        FROM public.jb_billing_orders
        WHERE provider_environment = 'live'
          AND paymongo_payment_id =
              v_audit.provider_payment_id
          AND id <> v_order.id
    ) THEN
        RAISE EXCEPTION 'LIVE payment already used';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.jb_billing_entitlement_grants
        WHERE order_id = v_order.id
    ) THEN
        RAISE EXCEPTION 'Order already has an entitlement';
    END IF;

    -- 7. Create subscription and LIVE entitlement.
    -- All operations run in one database transaction.

    v_period_start := now();
    v_period_end := v_period_start + interval '1 month';

    INSERT INTO public.jb_billing_subscriptions (
        user_id,
        plan_code,
        billing_mode,
        status,
        provider_environment,
        period_start,
        period_end
    )
    VALUES (
        v_order.user_id,
        v_order.plan_code,
        'manual_checkout',
        'active',
        'live',
        v_period_start,
        v_period_end
    )
    RETURNING id INTO v_subscription_id;

    INSERT INTO public.jb_billing_entitlement_grants (
        user_id,
        subscription_id,
        order_id,
        provider_environment,
        plan_code,
        effective_from,
        effective_until
    )
    VALUES (
        v_order.user_id,
        v_subscription_id,
        v_order.id,
        'live',
        v_order.plan_code,
        v_period_start,
        v_period_end
    );

    -- 8. Finalize the LIVE billing order.

    UPDATE public.jb_billing_orders
    SET
        status = 'paid',
        subscription_id = v_subscription_id,
        paymongo_payment_id =
            v_audit.provider_payment_id,
        paid_at = v_period_start,
        updated_at = now()
    WHERE id = v_order.id
      AND provider_environment = 'live'
      AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'LIVE order finalization failed';
    END IF;

    -- No legacy profile fields are modified.

    RETURN pg_catalog.jsonb_build_object(
        'status', 'settled',
        'environment', 'live',
        'order_id', v_order.id,
        'subscription_id', v_subscription_id,
        'plan_code', v_order.plan_code,
        'period_start', v_period_start,
        'period_end', v_period_end
    );

END;
$function$;


-- PostgreSQL grants: test model enforces service-only operations.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.jb_billing_my_access() TO authenticated, anon;
