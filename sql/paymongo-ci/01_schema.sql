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


CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS ci;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE TABLE ci.fixtures(name text PRIMARY KEY, val text NOT NULL);
CREATE OR REPLACE FUNCTION ci.check_true(condition boolean, message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'CI ASSERT FAILED: %', message; END IF; END $$;

CREATE TABLE public."jb_billing_entitlement_grants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "subscription_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "provider_environment" text NOT NULL,
  "plan_code" text NOT NULL,
  "effective_from" timestamp with time zone NOT NULL,
  "effective_until" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jb_billing_entitlement_grants_check" CHECK (effective_until > effective_from),
  CONSTRAINT "jb_billing_entitlement_grants_order_id_key" UNIQUE (order_id),
  CONSTRAINT "jb_billing_entitlement_grants_pkey" PRIMARY KEY (id),
  CONSTRAINT "jb_billing_entitlement_grants_provider_environment_check" CHECK (provider_environment = ANY (ARRAY['test'::text, 'live'::text]))
);
ALTER TABLE public."jb_billing_entitlement_grants" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."jb_billing_live_checkout_attempts" (
  "order_id" uuid NOT NULL,
  "state" text DEFAULT 'ready'::text NOT NULL,
  "claim_token" uuid,
  "attempted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error_code" text,
  CONSTRAINT "jb_billing_live_checkout_attempts_pkey" PRIMARY KEY (order_id),
  CONSTRAINT "jb_billing_live_checkout_attempts_state_check" CHECK (state = ANY (ARRAY['ready'::text, 'creating'::text, 'linked'::text, 'review_required'::text]))
);
ALTER TABLE public."jb_billing_live_checkout_attempts" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."jb_billing_live_checkout_control" (
  "singleton" boolean DEFAULT true NOT NULL,
  "checkout_enabled" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jb_billing_live_checkout_control_pkey" PRIMARY KEY (singleton),
  CONSTRAINT "jb_billing_live_checkout_control_singleton_check" CHECK (singleton = true)
);
ALTER TABLE public."jb_billing_live_checkout_control" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."jb_billing_live_checkout_requests" (
  "request_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "plan_code" text NOT NULL,
  "order_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jb_billing_live_checkout_requests_order_id_key" UNIQUE (order_id),
  CONSTRAINT "jb_billing_live_checkout_requests_pkey" PRIMARY KEY (request_id)
);
ALTER TABLE public."jb_billing_live_checkout_requests" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."jb_billing_live_payment_verification_audit" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "request_key" text NOT NULL,
  "order_id" uuid NOT NULL,
  "provider_environment" text DEFAULT 'live'::text NOT NULL,
  "provider_event_id" text,
  "provider_checkout_session_id" text,
  "provider_payment_id" text,
  "expected_amount_centavos" integer NOT NULL,
  "verified_amount_centavos" integer,
  "currency" text DEFAULT 'PHP'::text NOT NULL,
  "verification_status" text DEFAULT 'pending'::text NOT NULL,
  "verification_reason" text,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jb_billing_live_payment_verifica_expected_amount_centavos_check" CHECK (expected_amount_centavos > 0),
  CONSTRAINT "jb_billing_live_payment_verifica_verified_amount_centavos_check" CHECK (verified_amount_centavos > 0),
  CONSTRAINT "jb_billing_live_payment_verification__verification_status_check" CHECK (verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text, 'error'::text])),
  CONSTRAINT "jb_billing_live_payment_verification_audit_currency_check" CHECK (currency = 'PHP'::text),
  CONSTRAINT "jb_billing_live_payment_verification_audit_pkey" PRIMARY KEY (id),
  CONSTRAINT "jb_billing_live_payment_verification_audit_request_key_key" UNIQUE (request_key),
  CONSTRAINT "jb_billing_live_payment_verification_provider_environment_check" CHECK (provider_environment = 'live'::text),
  CONSTRAINT "jb_live_audit_verified_evidence_check" CHECK (verification_status <> 'verified'::text OR provider_checkout_session_id IS NOT NULL AND provider_payment_id IS NOT NULL AND verified_amount_centavos = expected_amount_centavos AND verified_at IS NOT NULL)
);
ALTER TABLE public."jb_billing_live_payment_verification_audit" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."jb_billing_live_settlement_control" (
  "singleton" boolean DEFAULT true NOT NULL,
  "settlement_enabled" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jb_billing_live_settlement_control_pkey" PRIMARY KEY (singleton),
  CONSTRAINT "jb_billing_live_settlement_control_singleton_check" CHECK (singleton = true)
);
ALTER TABLE public."jb_billing_live_settlement_control" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."jb_billing_live_webhook_queue" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "webhook_event_id" uuid NOT NULL,
  "processing_state" text DEFAULT 'pending'::text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "claim_token" uuid,
  "claimed_at" timestamp with time zone,
  "next_attempt_at" timestamp with time zone,
  "last_error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jb_billing_live_webhook_queue_attempt_count_check" CHECK (attempt_count >= 0),
  CONSTRAINT "jb_billing_live_webhook_queue_pkey" PRIMARY KEY (id),
  CONSTRAINT "jb_billing_live_webhook_queue_processing_state_check" CHECK (processing_state = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'review_required'::text])),
  CONSTRAINT "jb_billing_live_webhook_queue_webhook_event_id_key" UNIQUE (webhook_event_id)
);
ALTER TABLE public."jb_billing_live_webhook_queue" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."jb_billing_live_webhook_worker_control" (
  "singleton" boolean DEFAULT true NOT NULL,
  "processing_enabled" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jb_billing_live_webhook_worker_control_pkey" PRIMARY KEY (singleton),
  CONSTRAINT "jb_billing_live_webhook_worker_control_singleton_check" CHECK (singleton = true)
);
ALTER TABLE public."jb_billing_live_webhook_worker_control" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."jb_billing_orders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "subscription_id" uuid,
  "plan_code" text NOT NULL,
  "billing_mode" text NOT NULL,
  "provider_environment" text NOT NULL,
  "amount_centavos" integer NOT NULL,
  "currency" text DEFAULT 'PHP'::text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "paymongo_checkout_session_id" text,
  "paymongo_invoice_id" text,
  "paymongo_payment_id" text,
  "checkout_url" text,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jb_billing_orders_amount_centavos_check" CHECK (amount_centavos > 0),
  CONSTRAINT "jb_billing_orders_billing_mode_check" CHECK (billing_mode = ANY (ARRAY['manual_checkout'::text, 'paymongo_recurring'::text])),
  CONSTRAINT "jb_billing_orders_currency_check" CHECK (currency = 'PHP'::text),
  CONSTRAINT "jb_billing_orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "jb_billing_orders_provider_environment_check" CHECK (provider_environment = ANY (ARRAY['test'::text, 'live'::text])),
  CONSTRAINT "jb_billing_orders_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'cancelled'::text, 'expired'::text, 'refunded'::text]))
);
ALTER TABLE public."jb_billing_orders" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."jb_billing_plans" (
  "code" text NOT NULL,
  "display_name" text NOT NULL,
  "price_centavos" integer NOT NULL,
  "currency" text DEFAULT 'PHP'::text NOT NULL,
  "interval_unit" text DEFAULT 'month'::text NOT NULL,
  "interval_count" integer DEFAULT 1 NOT NULL,
  "grants_download" boolean DEFAULT false NOT NULL,
  "shows_ads" boolean DEFAULT true NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jb_billing_plans_code_check" CHECK (code = ANY (ARRAY['standard'::text, 'vip'::text])),
  CONSTRAINT "jb_billing_plans_currency_check" CHECK (currency = 'PHP'::text),
  CONSTRAINT "jb_billing_plans_interval_count_check" CHECK (interval_count = 1),
  CONSTRAINT "jb_billing_plans_interval_unit_check" CHECK (interval_unit = 'month'::text),
  CONSTRAINT "jb_billing_plans_pkey" PRIMARY KEY (code),
  CONSTRAINT "jb_billing_plans_price_centavos_check" CHECK (price_centavos > 0)
);
ALTER TABLE public."jb_billing_plans" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."jb_billing_subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "plan_code" text NOT NULL,
  "billing_mode" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "provider_environment" text NOT NULL,
  "provider_subscription_id" text,
  "provider_plan_id" text,
  "period_start" timestamp with time zone,
  "period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jb_billing_subscriptions_billing_mode_check" CHECK (billing_mode = ANY (ARRAY['manual_checkout'::text, 'paymongo_recurring'::text])),
  CONSTRAINT "jb_billing_subscriptions_check" CHECK (period_end IS NULL OR period_start IS NOT NULL),
  CONSTRAINT "jb_billing_subscriptions_check1" CHECK (period_end IS NULL OR period_end > period_start),
  CONSTRAINT "jb_billing_subscriptions_check2" CHECK (billing_mode = 'paymongo_recurring'::text OR provider_subscription_id IS NULL),
  CONSTRAINT "jb_billing_subscriptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "jb_billing_subscriptions_provider_environment_check" CHECK (provider_environment = ANY (ARRAY['test'::text, 'live'::text])),
  CONSTRAINT "jb_billing_subscriptions_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'past_due'::text, 'unpaid'::text, 'cancelled'::text, 'expired'::text]))
);
ALTER TABLE public."jb_billing_subscriptions" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."jb_billing_webhook_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "provider_environment" text NOT NULL,
  "provider_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "provider_object_id" text,
  "processing_status" text DEFAULT 'received'::text NOT NULL,
  "processing_error" text,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  CONSTRAINT "jb_billing_webhook_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "jb_billing_webhook_events_processing_status_check" CHECK (processing_status = ANY (ARRAY['received'::text, 'processed'::text, 'ignored'::text, 'failed'::text])),
  CONSTRAINT "jb_billing_webhook_events_provider_environment_check" CHECK (provider_environment = ANY (ARRAY['test'::text, 'live'::text])),
  CONSTRAINT "jb_billing_webhook_events_provider_environment_provider_eve_key" UNIQUE (provider_environment, provider_event_id)
);
ALTER TABLE public."jb_billing_webhook_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."jb_billing_entitlement_grants" ADD CONSTRAINT "jb_billing_entitlement_grants_order_id_fkey" FOREIGN KEY (order_id) REFERENCES jb_billing_orders(id);
ALTER TABLE public."jb_billing_entitlement_grants" ADD CONSTRAINT "jb_billing_entitlement_grants_plan_code_fkey" FOREIGN KEY (plan_code) REFERENCES jb_billing_plans(code);
ALTER TABLE public."jb_billing_entitlement_grants" ADD CONSTRAINT "jb_billing_entitlement_grants_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES jb_billing_subscriptions(id);
ALTER TABLE public."jb_billing_entitlement_grants" ADD CONSTRAINT "jb_billing_entitlement_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."jb_billing_live_checkout_attempts" ADD CONSTRAINT "jb_billing_live_checkout_attempts_order_id_fkey" FOREIGN KEY (order_id) REFERENCES jb_billing_orders(id);
ALTER TABLE public."jb_billing_live_checkout_requests" ADD CONSTRAINT "jb_billing_live_checkout_requests_order_id_fkey" FOREIGN KEY (order_id) REFERENCES jb_billing_orders(id);
ALTER TABLE public."jb_billing_live_checkout_requests" ADD CONSTRAINT "jb_billing_live_checkout_requests_plan_code_fkey" FOREIGN KEY (plan_code) REFERENCES jb_billing_plans(code);
ALTER TABLE public."jb_billing_live_checkout_requests" ADD CONSTRAINT "jb_billing_live_checkout_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."jb_billing_live_payment_verification_audit" ADD CONSTRAINT "jb_billing_live_payment_verification_audit_order_id_fkey" FOREIGN KEY (order_id) REFERENCES jb_billing_orders(id);
ALTER TABLE public."jb_billing_live_webhook_queue" ADD CONSTRAINT "jb_billing_live_webhook_queue_webhook_event_id_fkey" FOREIGN KEY (webhook_event_id) REFERENCES jb_billing_webhook_events(id);
ALTER TABLE public."jb_billing_orders" ADD CONSTRAINT "jb_billing_orders_plan_code_fkey" FOREIGN KEY (plan_code) REFERENCES jb_billing_plans(code);
ALTER TABLE public."jb_billing_orders" ADD CONSTRAINT "jb_billing_orders_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES jb_billing_subscriptions(id);
ALTER TABLE public."jb_billing_orders" ADD CONSTRAINT "jb_billing_orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."jb_billing_subscriptions" ADD CONSTRAINT "jb_billing_subscriptions_plan_code_fkey" FOREIGN KEY (plan_code) REFERENCES jb_billing_plans(code);
ALTER TABLE public."jb_billing_subscriptions" ADD CONSTRAINT "jb_billing_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX jb_billing_grants_user_period_idx ON public.jb_billing_entitlement_grants USING btree (user_id, effective_until DESC) WHERE (revoked_at IS NULL);
CREATE INDEX jb_billing_live_checkout_requests_user_idx ON public.jb_billing_live_checkout_requests USING btree (user_id, created_at DESC);
CREATE INDEX jb_billing_live_audit_order_idx ON public.jb_billing_live_payment_verification_audit USING btree (order_id, created_at DESC);
CREATE UNIQUE INDEX jb_billing_live_audit_payment_unique ON public.jb_billing_live_payment_verification_audit USING btree (provider_payment_id) WHERE ((verification_status = 'verified'::text) AND (provider_payment_id IS NOT NULL));
CREATE INDEX jb_live_webhook_queue_pending_idx ON public.jb_billing_live_webhook_queue USING btree (next_attempt_at, created_at) WHERE (processing_state = 'pending'::text);
CREATE UNIQUE INDEX jb_billing_order_checkout_unique ON public.jb_billing_orders USING btree (provider_environment, paymongo_checkout_session_id) WHERE (paymongo_checkout_session_id IS NOT NULL);
CREATE UNIQUE INDEX jb_billing_order_invoice_unique ON public.jb_billing_orders USING btree (provider_environment, paymongo_invoice_id) WHERE (paymongo_invoice_id IS NOT NULL);
CREATE UNIQUE INDEX jb_billing_order_payment_unique ON public.jb_billing_orders USING btree (provider_environment, paymongo_payment_id) WHERE (paymongo_payment_id IS NOT NULL);
CREATE INDEX jb_billing_order_user_idx ON public.jb_billing_orders USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX jb_billing_orders_unique_test_payment_v1 ON public.jb_billing_orders USING btree (paymongo_payment_id) WHERE ((provider_environment = 'test'::text) AND (paymongo_payment_id IS NOT NULL));
CREATE UNIQUE INDEX jb_billing_sub_provider_unique ON public.jb_billing_subscriptions USING btree (provider_environment, provider_subscription_id) WHERE (provider_subscription_id IS NOT NULL);
CREATE INDEX jb_billing_sub_user_idx ON public.jb_billing_subscriptions USING btree (user_id, period_end DESC);

CREATE POLICY "jb_billing_grants_self_read" ON public."jb_billing_entitlement_grants" FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "jb_billing_orders_self_read" ON public."jb_billing_orders" FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "jb_billing_plans_read" ON public."jb_billing_plans" FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "jb_billing_sub_self_read" ON public."jb_billing_subscriptions" FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

-- Test fixture permissions modeled after expected Supabase behavior.
-- The user-exported metadata omitted real production table GRANTs and
-- policy target roles, so these grants MUST NOT be treated as an access audit.
GRANT USAGE ON SCHEMA public, auth, ci TO service_role;
GRANT USAGE ON SCHEMA public, auth, ci TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ci TO service_role;
GRANT SELECT ON public.jb_billing_orders, public.jb_billing_subscriptions, public.jb_billing_entitlement_grants, public.jb_billing_plans TO authenticated;
GRANT SELECT ON public.jb_billing_plans TO anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION ci.check_true(boolean, text) TO authenticated, service_role;

