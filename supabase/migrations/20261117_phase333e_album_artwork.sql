-- JB Premium Hub / Phase 333E
-- Album artwork metadata only: no media reads, joins, publishing, or deletion.
-- Apply only after Phase 333 album-directory migration.
BEGIN;

ALTER TABLE public.jb_media_albums
  ADD COLUMN IF NOT EXISTS cover_style text NOT NULL DEFAULT 'indigo',
  ADD COLUMN IF NOT EXISTS cover_image_url text;

-- Keep this small whitelist synchronized with the frontend albumArtwork helper.
ALTER TABLE public.jb_media_albums
  DROP CONSTRAINT IF EXISTS jb_media_albums_cover_style_allowed;
ALTER TABLE public.jb_media_albums
  ADD CONSTRAINT jb_media_albums_cover_style_allowed
  CHECK (cover_style IN ('indigo', 'ocean', 'forest', 'sunset', 'violet', 'slate'));

-- Only the dedicated public-assets album-covers prefix may be used for
-- externally cleared static artwork. This checks location, not content safety.
ALTER TABLE public.jb_media_albums
  DROP CONSTRAINT IF EXISTS jb_media_albums_cover_url_allowed;
ALTER TABLE public.jb_media_albums
  ADD CONSTRAINT jb_media_albums_cover_url_allowed
  CHECK (
    cover_image_url IS NULL OR
    cover_image_url ~ '^https://assets\.jb-premium-hub\.vip/album-covers/[A-Za-z0-9_-]{1,100}\.(png|jpg|jpeg|webp)$'
  );

COMMENT ON COLUMN public.jb_media_albums.cover_style IS
  'Safe visual preset for album-directory cards; no media content is loaded.';
COMMENT ON COLUMN public.jb_media_albums.cover_image_url IS
  'Optional independently cleared static image URL from public-assets/album-covers only. Not video-derived.';

COMMIT;
