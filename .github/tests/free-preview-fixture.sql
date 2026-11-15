-- Isolated PostgreSQL CI fixture — no access to the production database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.profiles p
   WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin'
 );
$$;

CREATE TABLE public.media (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL DEFAULT 'video',
  media_url text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
GRANT SELECT, UPDATE ON public.media TO authenticated;
GRANT SELECT ON public.media TO anon;
INSERT INTO public.profiles (id,role)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','user');

INSERT INTO public.media (title,type,media_url)
SELECT 'Video ' || g::text,'video',
  'https://cdn.jb-premium-hub.vip/videos/ci-test-' || g::text || '.mp4'
FROM pg_catalog.generate_series(1,23) g;
