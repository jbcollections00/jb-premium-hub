-- Phase 343 — Atomic, admin-authorized media deletion.
-- This migration installs functionality only; it does NOT delete any media.
-- Browser users cannot invoke the RPC. Existing paid/private media RLS unchanged.

create table if not exists public.jb_admin_media_delete_audit (
  media_id uuid primary key,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now(),
  media_url text,
  video_key text,
  thumbnail_key text,
  cleanup_status text not null default 'pending'
    check (cleanup_status in ('pending', 'complete', 'not_applicable')),
  cleanup_updated_at timestamptz,
  cleanup_error text
);

alter table public.jb_admin_media_delete_audit enable row level security;
revoke all on table public.jb_admin_media_delete_audit from public, anon, authenticated;
grant select, insert, update on public.jb_admin_media_delete_audit to service_role;

create or replace function public.jb_admin_delete_published_media_v1(
  p_media_ids uuid[],
  p_admin_id uuid
)
returns table (
  deleted_media_id uuid,
  private_video_key text,
  private_thumbnail_key text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_media public.media%rowtype;
  v_link public.jb_media_publication_links%rowtype;
  v_stage public.jb_media_upload_staging%rowtype;
  v_video_key text;
  v_thumbnail_key text;
  v_count integer;
begin
  -- The RPC is service-role-only. It additionally requires an authenticated
  -- admin ID validated by the trusted backend; no browser-supplied user ID.
  if p_admin_id is null or not exists (
    select 1 from public.profiles p
    where p.id = p_admin_id
      and (
        pg_catalog.lower(coalesce(p.role, '')) = 'admin'
        or pg_catalog.lower(coalesce(p.account_type, '')) = 'admin'
      )
  ) then
    raise exception 'Admin authorization required' using errcode = '42501';
  end if;

  v_count := pg_catalog.cardinality(p_media_ids);
  if p_media_ids is null or v_count < 1 or v_count > 20
     or exists (select 1 from pg_catalog.unnest(p_media_ids) as s(id) where s.id is null)
     or (select count(distinct s.id) from pg_catalog.unnest(p_media_ids) as s(id)) <> v_count
  then
    raise exception 'Select 1 to 20 unique media IDs' using errcode = '22023';
  end if;

  -- Deterministic locking protects the selected media from concurrent deletes.
  -- A failed precondition rolls back the entire batch, including link cleanup.
  for v_id in
    select s.id from pg_catalog.unnest(p_media_ids) as s(id) order by s.id
  loop
    select * into v_media from public.media m
      where m.id = v_id for update;
    if not found then
      raise exception 'Selected media no longer exists' using errcode = 'P0002';
    end if;

    v_video_key := null;
    v_thumbnail_key := null;
    v_link := null;
    v_stage := null;

    select * into v_link from public.jb_media_publication_links l
      where l.media_id = v_id for update;
    if found then
      select * into v_stage from public.jb_media_upload_staging s
        where s.id = v_link.staging_id for update;
      if not found then
        raise exception 'Publication has missing staging metadata' using errcode = '23503';
      end if;
      -- Absolutely no object deletion from arbitrary bucket paths or shared URLs.
      v_video_key := 'staging/' || v_stage.created_by::text || '/' || v_stage.id::text || '.mp4';
      if v_media.media_url is distinct from ('r2://jb-premium-private-videos/' || v_video_key)
         or v_stage.storage_key is distinct from v_video_key then
        raise exception 'Unsafe published video reference' using errcode = '22023';
      end if;
      if v_stage.preview_key is not null then
        v_thumbnail_key :=
          'staging-thumbnails/' || v_stage.created_by::text || '/' || v_stage.id::text || '.jpg';
        if v_stage.preview_key is distinct from v_thumbnail_key then
          raise exception 'Unsafe published thumbnail reference' using errcode = '22023';
        end if;
      end if;
    end if;

    -- Permanent audit is saved in the same DB transaction as the deletes.
    insert into public.jb_admin_media_delete_audit
      (media_id, deleted_by, media_url, video_key, thumbnail_key, cleanup_status)
    values
      (v_media.id, p_admin_id, v_media.media_url, v_video_key, v_thumbnail_key,
       case when v_video_key is null then 'not_applicable' else 'pending' end);

    delete from public.jb_media_publication_links
      where media_id = v_id;

    -- This also cascades to reaction/view/comment tables per their FKs.
    delete from public.media where id = v_id;

    -- Remove the now-unpublished staging row so it cannot reappear in the
    -- admin review queue after its publication link is gone.
    if v_link.staging_id is not null then
      delete from public.jb_media_upload_staging where id = v_link.staging_id;
    end if;

    deleted_media_id := v_id;
    private_video_key := v_video_key;
    private_thumbnail_key := v_thumbnail_key;
    return next;
  end loop;
end
$function$;

revoke all on function public.jb_admin_delete_published_media_v1(uuid[], uuid)
  from public, anon, authenticated;
grant execute on function public.jb_admin_delete_published_media_v1(uuid[], uuid)
  to service_role;

comment on function public.jb_admin_delete_published_media_v1(uuid[], uuid)
is 'Phase 343 service-role only: atomic admin-authorized removal of selected published media, publication links, and staging metadata, with permanent R2 cleanup audit; no automatic deletions.';
