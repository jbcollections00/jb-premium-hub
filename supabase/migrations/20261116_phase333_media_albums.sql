-- JB Premium Hub / Phase 333
-- New album DIRECTORY only. No connection to media or R2 and no media publication.
-- Requires the pre-existing public.is_current_user_admin() helper.
-- Safe to run after reviewing the target Supabase schema.

BEGIN;

CREATE TABLE IF NOT EXISTS public.jb_media_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_visible boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jb_media_albums_name_valid
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT jb_media_albums_description_valid
    CHECK (char_length(description) <= 400)
);

-- Prevent duplicate album titles across letter case without deleting old entries.
CREATE UNIQUE INDEX IF NOT EXISTS jb_media_albums_name_lower_unique
  ON public.jb_media_albums (lower(name));

CREATE OR REPLACE FUNCTION public.jb_media_albums_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jb_media_albums_updated_at
  ON public.jb_media_albums;
CREATE TRIGGER trg_jb_media_albums_updated_at
BEFORE UPDATE ON public.jb_media_albums
FOR EACH ROW EXECUTE FUNCTION public.jb_media_albums_touch_updated_at();

ALTER TABLE public.jb_media_albums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jb_albums_public_read_visible
  ON public.jb_media_albums;
CREATE POLICY jb_albums_public_read_visible
  ON public.jb_media_albums
  FOR SELECT TO anon, authenticated
  USING (is_visible = true);

DROP POLICY IF EXISTS jb_albums_admin_read_all
  ON public.jb_media_albums;
CREATE POLICY jb_albums_admin_read_all
  ON public.jb_media_albums
  FOR SELECT TO authenticated
  USING ((SELECT public.is_current_user_admin()));

DROP POLICY IF EXISTS jb_albums_admin_insert
  ON public.jb_media_albums;
CREATE POLICY jb_albums_admin_insert
  ON public.jb_media_albums
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_current_user_admin()) AND
    created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS jb_albums_admin_update
  ON public.jb_media_albums;
CREATE POLICY jb_albums_admin_update
  ON public.jb_media_albums
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_current_user_admin()))
  WITH CHECK (
    (SELECT public.is_current_user_admin())
  );

DROP POLICY IF EXISTS jb_albums_admin_delete
  ON public.jb_media_albums;
CREATE POLICY jb_albums_admin_delete
  ON public.jb_media_albums
  FOR DELETE TO authenticated
  USING ((SELECT public.is_current_user_admin()));

REVOKE ALL ON public.jb_media_albums FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.jb_media_albums TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.jb_media_albums TO authenticated;

COMMENT ON TABLE public.jb_media_albums IS
  'Public-facing album metadata only. No media relations or safety clearance implied.';
COMMENT ON COLUMN public.jb_media_albums.is_visible IS
  'Visible album directory card, NOT an approval for any video content.';

COMMIT;
