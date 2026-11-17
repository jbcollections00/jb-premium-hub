-- Phase 333M: admin-only video thumbnail previews for PRIVATE staging.
-- No public.thumbnail_url, public.media, or public asset changes.
BEGIN;

ALTER TABLE public.jb_media_upload_staging
  ADD COLUMN IF NOT EXISTS preview_key text,
  ADD COLUMN IF NOT EXISTS preview_uploaded_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.jb_media_upload_staging'::regclass
      AND conname = 'jb_staging_private_preview_key_valid'
  ) THEN
    ALTER TABLE public.jb_media_upload_staging
      ADD CONSTRAINT jb_staging_private_preview_key_valid
      CHECK (
        preview_key IS NULL OR
        preview_key ~ '^staging-thumbnails/[a-f0-9-]{36}/[a-f0-9-]{36}\.jpg$'
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.jb_media_upload_staging.preview_key IS
  'Private R2 staging object key for admin-only video-derived preview. Never a public thumbnail URL.';
COMMENT ON COLUMN public.jb_media_upload_staging.preview_uploaded_at IS
  'When private preview JPEG upload was verified by trusted server.';

-- Existing table RLS remains unchanged; only Admin SELECT is allowed.
-- Only service_role can write private preview references.
COMMIT;
