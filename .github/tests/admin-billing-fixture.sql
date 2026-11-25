-- Temporary CI fixture only. Never run against JB Premium Hub production.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
  );
$$;

CREATE TABLE public.jb_billing_orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  plan_code text NOT NULL,
  amount_centavos integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  provider_environment text NOT NULL,
  subscription_id uuid,
  paymongo_checkout_session_id text,
  paymongo_payment_id text
);

CREATE TABLE public.jb_billing_entitlement_grants (
  id uuid PRIMARY KEY,
  order_id uuid,
  subscription_id uuid,
  expires_at timestamptz,
  revoked_at timestamptz
);

INSERT INTO public.profiles (id, role)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','user');

INSERT INTO public.jb_billing_orders
  (id,user_id,plan_code,amount_centavos,currency,status,created_at,provider_environment,subscription_id,paymongo_checkout_session_id,paymongo_payment_id)
VALUES
  ('11111111-1111-4111-8111-111111111111',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','vip',15000,'PHP','paid',
   '2026-11-12T07:45:00Z','live','cccccccc-cccc-4ccc-8ccc-cccccccccccc','cs_live_test','pay_live_verified'),
  ('22222222-2222-4222-8222-222222222222',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','standard',5000,'PHP','pending',
   '2026-11-14T07:45:00Z','live',NULL,'cs_live_pending',NULL),
  ('33333333-3333-4333-8333-333333333333',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','standard',5000,'PHP','paid',
   '2026-11-08T07:45:00Z','test',NULL,'cs_test', 'pay_test');

INSERT INTO public.jb_billing_entitlement_grants
  (id,order_id,subscription_id,expires_at,revoked_at)
VALUES
  ('44444444-4444-4444-8444-444444444444',
   '11111111-1111-4111-8111-111111111111',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   pg_catalog.now() + INTERVAL '30 days',NULL);
