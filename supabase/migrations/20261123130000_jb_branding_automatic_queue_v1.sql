-- Phase 353: durable automatic branding queue, private originals preserved.
-- Prepared for integration; no production changes until explicitly applied.
create table if not exists public.jb_video_branding_jobs (
  media_id uuid primary key references public.media(id) on delete cascade,
  source_key text not null,
  status text not null default 'pending'
    check (status in ('pending','processing','ready','failed','unsupported')),
  asset_version integer,
  output_key text,
  output_bytes bigint,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (source_key ~ '^staging/[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$'),
  check (output_key is null or output_key ~ '^branding/processed/[0-9a-f-]{36}/v[0-9]+\.mp4$'),
  check (status <> 'ready' or (asset_version is not null and output_key is not null and output_bytes > 0))
);
alter table public.jb_video_branding_jobs enable row level security;
revoke all on public.jb_video_branding_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.jb_video_branding_jobs to service_role;
create index if not exists jb_branding_queue_due_idx
  on public.jb_video_branding_jobs(status,next_attempt_at,lease_until);

create or replace function public.jb_branding_enqueue_media_v1()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_key text;
begin
  if new.type = 'video' and
      new.media_url ~ '^r2://jb-premium-private-videos/staging/[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$' then
    v_key := pg_catalog.substr(new.media_url, pg_catalog.length('r2://jb-premium-private-videos/')+1);
    if pg_catalog.split_part(v_key,'/',3) = new.id::text || '.mp4' then
      insert into public.jb_video_branding_jobs(media_id,source_key)
        values(new.id,v_key)
        on conflict (media_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists jb_branding_auto_enqueue_v1 on public.media;
create trigger jb_branding_auto_enqueue_v1
after insert or update of media_url on public.media
for each row execute function public.jb_branding_enqueue_media_v1();

-- Existing *private* published videos are queued without modifying the media rows.
insert into public.jb_video_branding_jobs(media_id,source_key)
select m.id, pg_catalog.substr(m.media_url,pg_catalog.length('r2://jb-premium-private-videos/')+1)
from public.media m
where m.type='video'
  and m.media_url ~ '^r2://jb-premium-private-videos/staging/[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$'
  and pg_catalog.split_part(m.media_url,'/',6) = m.id::text || '.mp4'
on conflict (media_id) do nothing;

-- Worker calls only after validating that a complete set of branding assets is configured.
-- Changing assets triggers regeneration; old output remains stored until cleanup.
create or replace function public.jb_branding_prepare_v1(p_version integer)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if coalesce((select auth.jwt() ->> 'role'),'') <> 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_version is null or p_version < 1 then
    raise exception 'Invalid asset version' using errcode='22023';
  end if;
  update public.jb_video_branding_jobs j
  set status='pending', output_key=null, output_bytes=null, asset_version=null,
      lease_token=null, lease_until=null, attempts=0, next_attempt_at=now(),
      last_error=null, updated_at=now()
  where (j.status in ('ready','failed') and j.asset_version is distinct from p_version);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.jb_branding_claim_v1(p_version integer)
returns table(media_id uuid,source_key text,lease_token uuid,asset_version integer)
language plpgsql security definer set search_path = ''
as $$
declare v_claim uuid;
begin
  if coalesce((select auth.jwt() ->> 'role'),'') <> 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_version is null or p_version < 1 then
    raise exception 'Invalid asset version' using errcode='22023';
  end if;
  v_claim := gen_random_uuid();
  return query
  with picked as (
    select j.media_id from public.jb_video_branding_jobs j
    join public.media m on m.id=j.media_id
    where m.media_url='r2://jb-premium-private-videos/' || j.source_key
      and ((j.status in ('pending','failed') and j.next_attempt_at <= now() and j.attempts < 5)
        or (j.status='processing' and j.lease_until < now() and j.attempts < 5))
    order by j.next_attempt_at,j.media_id
    limit 1 for update of j skip locked
  ), updated as (
    update public.jb_video_branding_jobs j
       set status='processing', lease_token=v_claim,
           lease_until=now()+interval '90 minutes',
           attempts=j.attempts+1, asset_version=p_version,
           last_error=null, updated_at=now()
    from picked where j.media_id=picked.media_id
    returning j.media_id,j.source_key,j.lease_token,j.asset_version
  )
  select u.media_id,u.source_key,u.lease_token,u.asset_version from updated u;
end;
$$;

create or replace function public.jb_branding_finish_v1(
 p_media_id uuid,p_token uuid,p_version integer,p_size bigint,p_error text default null
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_status text;
begin
  if coalesce((select auth.jwt() ->> 'role'),'') <> 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_error is null and (p_size is null or p_size <= 0) then
    raise exception 'Invalid processed file size' using errcode='22023';
  end if;
  update public.jb_video_branding_jobs j
  set status=case when p_error is null then 'ready' else 'failed' end,
      output_key=case when p_error is null
        then 'branding/processed/' || p_media_id::text || '/v' || p_version::text || '.mp4'
        else null end,
      output_bytes=case when p_error is null then p_size else null end,
      last_error=case when p_error is null then null else pg_catalog.left(p_error,500) end,
      next_attempt_at=case when p_error is null then now() else now()+interval '30 minutes' end,
      processed_at=case when p_error is null then now() else null end,
      lease_token=null,lease_until=null,updated_at=now()
  where j.media_id=p_media_id and j.lease_token=p_token and j.status='processing'
    and j.asset_version=p_version
    and exists(select 1 from public.media m
      where m.id=j.media_id
      and m.media_url='r2://jb-premium-private-videos/' || j.source_key)
  returning status into v_status;
  return v_status is not null;
end;
$$;

revoke all on function public.jb_branding_prepare_v1(integer) from public,anon,authenticated;
revoke all on function public.jb_branding_claim_v1(integer) from public,anon,authenticated;
revoke all on function public.jb_branding_finish_v1(uuid,uuid,integer,bigint,text) from public,anon,authenticated;
grant execute on function public.jb_branding_prepare_v1(integer) to service_role;
grant execute on function public.jb_branding_claim_v1(integer) to service_role;
grant execute on function public.jb_branding_finish_v1(uuid,uuid,integer,bigint,text) to service_role;
revoke all on function public.jb_branding_enqueue_media_v1() from public,anon,authenticated;
notify pgrst,'reload schema';
