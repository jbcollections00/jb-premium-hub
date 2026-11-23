-- Phase 356: persistent private R2 multipart upload state (no access policy changes).
-- Existing uploads retain their previous single-PUT behavior and metadata.
alter table public.jb_media_upload_staging
  add column if not exists multipart_upload_id text,
  add column if not exists multipart_fingerprint text,
  add column if not exists multipart_part_size integer;

alter table public.jb_media_upload_staging
  drop constraint if exists jb_staging_multipart_shape_v1;
alter table public.jb_media_upload_staging
  add constraint jb_staging_multipart_shape_v1 check (
    (multipart_upload_id is null and multipart_fingerprint is null and multipart_part_size is null)
    or (
      multipart_upload_id is not null
      and length(multipart_upload_id) between 4 and 2048
      and multipart_fingerprint ~ '^[0-9a-f]{64}$'
      and multipart_part_size between 5242880 and 67108864
    )
  );

create index if not exists jb_staging_resume_by_admin_v1
  on public.jb_media_upload_staging
  (created_by, album_id, status, created_at desc)
  where multipart_upload_id is not null;
