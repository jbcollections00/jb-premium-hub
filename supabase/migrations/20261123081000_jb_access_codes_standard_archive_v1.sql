-- Phase 352: secure STANDARD/VIP complimentary access codes.
-- Existing redeemed access_codes are preserved. No destructive data migration.
-- Staff-only code generation and unused-only deletion.
alter table public.access_codes
  add column if not exists issued_by uuid references auth.users(id) on delete set null;

-- Backward-compatible with the currently deployed VIP generator until the new UI deploys.
create or replace function public.jb_stamp_access_code_issuer_v1()
returns trigger language plpgsql security definer set search_path = ''
as $
begin
  if new.issued_by is null and (select auth.uid()) is not null
     and (select public.is_current_user_admin()) is true then
    new.issued_by := (select auth.uid());
  end if;
  return new;
end;
$;
drop trigger if exists jb_stamp_access_code_issuer_v1 on public.access_codes;
create trigger jb_stamp_access_code_issuer_v1
before insert on public.access_codes for each row
execute function public.jb_stamp_access_code_issuer_v1();

create or replace function public.jb_admin_create_access_code_v1(
  p_type text, p_duration_days integer default 30, p_custom_code text default null
)
returns table (id uuid, code text, type text, duration_days integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_type text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_type, '')));
  v_code text;
  v_row public.access_codes%rowtype;
begin
  if v_actor is null or (select public.is_current_user_admin()) is distinct from true then
    raise exception 'Admin permission required' using errcode='42501';
  end if;
  if v_type not in ('VIP', 'STANDARD') then
    raise exception 'Invalid plan' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.jb_billing_plans p
    where p.code = pg_catalog.lower(v_type) and p.is_active is true
  ) then
    raise exception 'Plan is not available' using errcode='22023';
  end if;
  if p_duration_days is null or p_duration_days not between 1 and 365 then
    raise exception 'Duration must be 1–365 days' using errcode='22023';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_custom_code, '')), '') is not null then
    v_code := pg_catalog.upper(pg_catalog.btrim(p_custom_code));
    if pg_catalog.length(v_code) not between 4 and 64
       or v_code !~ '^[A-Z0-9_-]+$' then
      raise exception 'Code must use 4-64 letters, numbers, dashes or underscores'
        using errcode='22023';
    end if;
  else
    v_code := v_type || '-' || pg_catalog.upper(
      pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8)
    );
  end if;
  insert into public.access_codes as c (code, type, duration_days, is_used, issued_by)
  values (v_code, v_type, p_duration_days, false, v_actor)
  returning c.* into v_row;
  return query select v_row.id, v_row.code, v_row.type, v_row.duration_days;
end;
$$;

create or replace function public.jb_admin_delete_unused_access_code_v1(p_code_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_deleted uuid;
begin
  if (select auth.uid()) is null or
     (select public.is_current_user_admin()) is distinct from true then
    raise exception 'Admin permission required' using errcode='42501';
  end if;
  if p_code_id is null then
    raise exception 'Code ID required' using errcode='22023';
  end if;
  delete from public.access_codes c
  where c.id=p_code_id and c.is_used is false
    and c.used_at is null and c.used_by is null
  returning c.id into v_deleted;
  if v_deleted is null then
    raise exception 'Only unused codes may be deleted. Redeemed codes remain in history.'
      using errcode='22023';
  end if;
  return true;
end;
$$;

-- Never allow bypassing the redeemed-code history protection through
-- the public Data API, even where legacy DELETE policies exist.
create or replace function public.jb_protect_redeemed_access_codes_v1()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.is_used is true or old.used_at is not null or old.used_by is not null then
    raise exception 'Redeemed codes must remain in history' using errcode='42501';
  end if;
  return old;
end;
$$;
drop trigger if exists jb_protect_redeemed_access_codes_v1 on public.access_codes;
create trigger jb_protect_redeemed_access_codes_v1
before delete on public.access_codes for each row
execute function public.jb_protect_redeemed_access_codes_v1();

-- Keep the exact original RPC called by Profile/Home for compatibility.
-- Issue a real complimentary grant that jb_billing_my_access understands.
create or replace function public.redeem_access_code(p_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_code public.access_codes%rowtype;
  v_plan text;
  v_now timestamptz := pg_catalog.now();
  v_current public.jb_admin_membership_grants%rowtype;
  v_grant_id uuid;
  v_until timestamptz;
  v_days integer;
  v_reason text;
begin
  if v_user is null then
    return pg_catalog.jsonb_build_object('success',false,'message','Not authenticated');
  end if;
  if p_code is null or pg_catalog.length(pg_catalog.btrim(p_code)) not between 4 and 64 then
    return pg_catalog.jsonb_build_object('success',false,'message','Invalid access code');
  end if;
  select * into v_code from public.access_codes c
  where pg_catalog.upper(c.code) = pg_catalog.upper(pg_catalog.btrim(p_code))
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('success',false,'message','Invalid access code');
  end if;
  if v_code.is_used is true then
    return pg_catalog.jsonb_build_object('success',false,'message','This access code has already been used');
  end if;
  if v_code.expires_at is not null and v_code.expires_at <= v_now then
    return pg_catalog.jsonb_build_object('success',false,'message','This access code has expired');
  end if;
  v_plan := pg_catalog.lower(v_code.type);
  if v_plan not in ('standard','vip') or not exists (
    select 1 from public.jb_billing_plans p where p.code=v_plan and p.is_active is true
  ) then
    return pg_catalog.jsonb_build_object('success',false,'message','Unsupported membership code');
  end if;
  if not exists (select 1 from public.profiles p where p.id=v_user
                 and pg_catalog.lower(coalesce(p.role,''))<>'admin'
                 and pg_catalog.lower(coalesce(p.account_type,''))<>'admin') then
    return pg_catalog.jsonb_build_object('success',false,'message','Invalid member account');
  end if;
  if v_code.issued_by is null or not exists (
    select 1 from public.profiles p where p.id=v_code.issued_by
  ) then
    return pg_catalog.jsonb_build_object('success',false,'message','Legacy code requires administrator review');
  end if;
  v_days := greatest(coalesce(v_code.duration_days,30),1);
  if v_days>365 then
    return pg_catalog.jsonb_build_object('success',false,'message','Invalid membership duration');
  end if;
  v_reason := 'Redeemed ' || v_plan || ' access code ' || v_code.code;
  -- Serialize membership extensions for a user and plan.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || ':' || v_plan, 0)
  );
  select * into v_current from public.jb_admin_membership_grants g
  where g.user_id=v_user and g.plan_code=v_plan
    and g.revoked_at is null and g.effective_from<=v_now
    and g.effective_until>v_now
  order by g.effective_until desc, g.id desc limit 1 for update;
  if found then
    v_grant_id := v_current.id;
    v_until := v_current.effective_until + pg_catalog.make_interval(days=>v_days);
    update public.jb_admin_membership_grants g
    set effective_until=v_until, updated_at=v_now where g.id=v_grant_id;
    insert into public.jb_admin_membership_audit
      (grant_id,target_user_id,actor_user_id,plan_code,event_type,
       previous_until,new_until,reason)
    values (v_grant_id,v_user,v_code.issued_by,v_plan,'extend',
            v_current.effective_until,v_until,v_reason);
  else
    v_until := v_now + pg_catalog.make_interval(days=>v_days);
    insert into public.jb_admin_membership_grants
      (user_id,plan_code,effective_from,effective_until,created_by,reason)
    values (v_user,v_plan,v_now,v_until,v_code.issued_by,v_reason)
    returning id into v_grant_id;
    insert into public.jb_admin_membership_audit
      (grant_id,target_user_id,actor_user_id,plan_code,event_type,
       previous_until,new_until,reason)
    values (v_grant_id,v_user,v_code.issued_by,v_plan,'grant',null,v_until,v_reason);
  end if;
  update public.access_codes c
  set is_used=true,used_by=v_user,used_at=v_now,expires_at=v_until
  where c.id=v_code.id;
  -- Do not use profiles.account_type as an entitlement source.
  return pg_catalog.jsonb_build_object(
    'success',true,'message',pg_catalog.upper(v_plan)||' access activated successfully',
    'account_type',pg_catalog.upper(v_plan),'tier',v_plan,
    'expires_at',v_until,'duration_days',v_days);
end;
$$;

revoke all on function public.jb_admin_create_access_code_v1(text,integer,text) from public,anon;
revoke all on function public.jb_admin_delete_unused_access_code_v1(uuid) from public,anon;
revoke all on function public.redeem_access_code(text) from public,anon;
revoke all on function public.jb_protect_redeemed_access_codes_v1() from public,anon,authenticated;\nrevoke all on function public.jb_stamp_access_code_issuer_v1() from public,anon,authenticated;
grant execute on function public.jb_admin_create_access_code_v1(text,integer,text) to authenticated,service_role;
grant execute on function public.jb_admin_delete_unused_access_code_v1(uuid) to authenticated,service_role;
grant execute on function public.redeem_access_code(text) to authenticated,service_role;
notify pgrst, 'reload schema';
