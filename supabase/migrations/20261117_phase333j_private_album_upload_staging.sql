-- Phase 333J: private admin upload staging metadata only.
-- Does NOT change public.media, media RLS, or playback entitlements.
-- Never exposes an R2 object URL in a database record accessible to members.
BEGIN;

CREATE TABLE IF NOT EXISTS public.jb_media_upload_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.jb_media_albums(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  storage_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'awaiting_upload',
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_at timestamptz,
  CONSTRAINT jb_staging_filename_valid CHECK (
    length(original_filename) BETWEEN 1 AND 200
  ),
  CONSTRAINT jb_staging_mime_valid CHECK (
    mime_type IN (
      'video/mp4', 'video/quicktime', 'video/webm',
      'video/x-matroska', 'video/x-msvideo'
    )
  ),
  CONSTRAINT jb_staging_size_valid CHECK (
    size_bytes BETWEEN 1 AND 2147483648
  ),
  CONSTRAINT jb_staging_key_valid CHECK (
    storage_key ~ '^staging/[a-f0-9-]{36}/[a-f0-9-]{36}\.(mp4|mov|webm|mkv|avi)$'
  ),
  CONSTRAINT jb_staging_status_valid CHECK (
    status IN ('awaiting_upload', 'pending_review')
  )
);

CREATE INDEX IF NOT EXISTS jb_media_upload_staging_owner_date_idx
  ON public.jb_media_upload_staging(created_by, created_at DESC);

ALTER TABLE public.jb_media_upload_staging ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.jb_media_upload_staging
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.jb_media_upload_staging TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.jb_media_upload_staging TO service_role;

DROP POLICY IF EXISTS jb_staging_admin_read
  ON public.jb_media_upload_staging;
CREATE POLICY jb_staging_admin_read ON public.jb_media_upload_staging
  FOR SELECT TO authenticated
  USING ((SELECT public.is_current_user_admin()));

COMMENT ON TABLE public.jb_media_upload_staging IS
  'Admin-only staging metadata for private video intake. No approved/public media rows; no member playback. Pending review is not publication approval.';

COMMIT;
