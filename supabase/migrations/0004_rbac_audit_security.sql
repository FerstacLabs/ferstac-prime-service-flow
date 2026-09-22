begin;

-- No authenticated role may create objects that shadow definer-function dependencies.
revoke create on schema public from public, anon, authenticated;
create schema if not exists prime_private;
revoke all on schema prime_private from public, anon, authenticated;
grant usage on schema prime_private to authenticated;

create type public.app_role as enum ('ADMIN', 'CASHIER', 'INTAKE');
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);
create table public.user_profiles (
  auth_user_id uuid primary key references auth.users(id),
  organization_id uuid not null references public.organizations(id),
  username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,31}$'),
  display_name text not null,
  role public.app_role not null,
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  session_not_before timestamptz not null default '1970-01-01',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, username)
);
insert into public.organizations(name,slug) values ('PRIME Tuning & Detailing','prime');

-- Fail closed on ambiguous legacy ownership. Never merge unrelated tenants implicitly.
do $$
declare owners uuid[]; chosen uuid; org uuid; t text;
begin
  select id into org from public.organizations where slug='prime';
  select array_agg(distinct owner_user_id) into owners from (
    select owner_user_id from public.vehicles union select owner_user_id from public.service_jobs
    union select owner_user_id from public.workers union select owner_user_id from public.suppliers
    union select owner_user_id from public.purchases union select owner_user_id from public.cash_transactions
    union select owner_user_id from public.work_catalog where owner_user_id is not null
    union select owner_user_id from public.part_catalog where owner_user_id is not null
    union select owner_user_id from public.worker_roles where owner_user_id is not null
  ) legacy;
  if cardinality(owners)>1 then
    raise exception 'Multiple legacy owners: review tenant mapping before applying 0004. No data was changed.';
  end if;
  chosen := owners[1];
  if chosen is null then
    chosen := nullif(current_setting('prime.bootstrap_admin_id',true),'')::uuid;
    if chosen is null and (select count(*) from auth.users)=1 then select id into chosen from auth.users; end if;
  end if;
  if chosen is not null then
    insert into public.user_profiles(auth_user_id,organization_id,username,display_name,role)
    values(chosen,org,'admin','Administrator','ADMIN');
  end if;
  foreach t in array array['vehicles','service_jobs','workers','suppliers','job_work_items','purchases','job_required_parts','cash_transactions','work_catalog','part_catalog','worker_roles'] loop
    execute format('alter table public.%I add column organization_id uuid references public.organizations(id)',t);
    execute format('alter table public.%I disable trigger user',t);
    execute format('update public.%I set organization_id=$1',t) using org;
    execute format('alter table public.%I enable trigger user',t);
    execute format('alter table public.%I alter column organization_id set not null',t);
    execute format('create index %I on public.%I(organization_id,id)',t||'_organization_idx',t);
  end loop;
end $$;

create function prime_private.profile() returns public.user_profiles
language sql stable security definer set search_path = '' as $$
  select p from public.user_profiles p where p.auth_user_id=auth.uid()
$$;
create function prime_private.session_valid(p public.user_profiles) returns boolean
language sql stable set search_path = '' as $$
  select p.is_active and coalesce(to_timestamp((auth.jwt()->>'iat')::double precision)>=p.session_not_before,false)
$$;
create function prime_private.organization_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.organization_id from public.user_profiles p
  where p.auth_user_id=auth.uid() and prime_private.session_valid(p) and not p.must_change_password
$$;
create function prime_private.has_role(roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role=any(roles) and prime_private.session_valid(p) and not p.must_change_password
    from public.user_profiles p where p.auth_user_id=auth.uid()),false)
$$;
create function prime_private.require_role(roles public.app_role[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not prime_private.has_role(roles) then raise exception 'Giriş icazəsi yoxdur' using errcode='42501'; end if;
  return prime_private.organization_id();
end $$;
create function public.get_access_profile() returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(p)||jsonb_build_object('session_valid',prime_private.session_valid(p))
  from public.user_profiles p where auth_user_id=auth.uid()
$$;

alter table public.organizations enable row level security;
alter table public.user_profiles enable row level security;
revoke all on public.organizations,public.user_profiles from anon,authenticated;
grant select on public.organizations,public.user_profiles to authenticated;
grant all on public.organizations,public.user_profiles to service_role;
create policy member_organization on public.organizations for select to authenticated using(id=prime_private.organization_id());
create policy profiles_read on public.user_profiles for select to authenticated using (
  auth_user_id=auth.uid() or (organization_id=prime_private.organization_id() and prime_private.has_role(array['ADMIN']::public.app_role[]))
);

-- Replace every legacy owner policy. Creator IDs remain historical metadata.
do $$ declare t text; p record; roles text;
begin
  foreach t in array array['vehicles','service_jobs','workers','suppliers','job_work_items','purchases','job_required_parts','cash_transactions','work_catalog','part_catalog','worker_roles'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',p.policyname,t);
    end loop;
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select,insert,update on public.%I to authenticated',t);
    execute format('alter table public.%I alter column organization_id set default prime_private.organization_id()',t);
    roles := case when t in ('workers','suppliers','job_work_items','purchases','cash_transactions','worker_roles')
      then '''ADMIN'',''CASHIER''' else '''ADMIN'',''CASHIER'',''INTAKE''' end;
    execute format('create policy org_read on public.%I for select to authenticated using (organization_id=prime_private.organization_id() and prime_private.has_role(array[%s]::public.app_role[]))',t,roles);
    if t<>'cash_transactions' then
      execute format('create policy admin_insert on public.%I for insert to authenticated with check(organization_id=prime_private.organization_id() and prime_private.has_role(array[''ADMIN'']::public.app_role[]) and owner_user_id=auth.uid())',t);
      execute format('create policy admin_update on public.%I for update to authenticated using(organization_id=prime_private.organization_id() and prime_private.has_role(array[''ADMIN'']::public.app_role[])) with check(organization_id=prime_private.organization_id())',t);
    end if;
  end loop;
end $$;
alter table public.vehicles drop constraint vehicles_owner_user_id_plate_key;
create unique index vehicles_organization_plate on public.vehicles(organization_id,plate);
create index jobs_organization_received on public.service_jobs(organization_id,received_at desc);
create index cash_organization_date on public.cash_transactions(organization_id,transaction_date desc);

-- Validate every cross-table reference even inside SECURITY DEFINER RPCs.
create or replace function public.enforce_workshop_relations() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare ref record; linked uuid; new_json jsonb := to_jsonb(new);
begin
  if tg_op='UPDATE' and (new.owner_user_id is distinct from old.owner_user_id or new.organization_id<>old.organization_id) then
    raise exception 'Creator and organization are immutable';
  end if;
  if new_json ? 'notes' and length(new_json->>'notes')>250 and (tg_op='INSERT' or new_json->>'notes' is distinct from to_jsonb(old)->>'notes') then
    raise exception 'Qeyd maksimum 250 simvol ola bilər';
  end if;
  for ref in select * from (values
    ('vehicle_id','vehicles'),('service_job_id','service_jobs'),('role_id','worker_roles'),
    ('work_catalog_id','work_catalog'),('part_catalog_id','part_catalog'),('assigned_worker_id','workers'),
    ('supplier_id','suppliers'),('purchased_by_worker_id','workers'),('required_part_id','job_required_parts'),
    ('work_item_id','job_work_items'),('purchase_id','purchases')
  ) refs(field_name,table_name) loop
    if new_json->>ref.field_name is not null then
      execute format('select organization_id from public.%I where id=$1',ref.table_name) into linked using (new_json->>ref.field_name)::uuid;
      if linked is distinct from new.organization_id then raise exception 'Related record not found' using errcode='42501'; end if;
    end if;
  end loop;
  if tg_op='UPDATE' and new_json ? 'service_job_id' and new_json->>'service_job_id'<>to_jsonb(old)->>'service_job_id' then raise exception 'Servis kartı dəyişdirilə bilməz'; end if;
  if tg_table_name='job_work_items' and tg_op='INSERT' then
    perform 1 from service_jobs where id=new.service_job_id for update;
    if new.work_catalog_id is not null and exists(select 1 from job_work_items where service_job_id=new.service_job_id and work_catalog_id=new.work_catalog_id) then raise exception 'Təkrar iş seçilib'; end if;
    if new.quoted_price is null and exists(select 1 from service_jobs where id=new.service_job_id and has_line_quotes) then raise exception 'Müştəri qiyməti tələb olunur'; end if;
  end if;
  if tg_table_name='purchases' then
    if new.required_part_id is not null and not exists(select 1 from job_required_parts where id=new.required_part_id and service_job_id=new.service_job_id and part_catalog_id=new.part_catalog_id) then raise exception 'Detal bu servis kartına aid deyil'; end if;
    if new.source_type='CUSTOMER_PROVIDED' and (new.unit_price<>0 or new.paid_amount<>0) then raise exception 'Müştərinin detalı alış borcu yaratmır'; end if;
  end if;
  return new;
end $$;
do $$ declare t text; c record;
begin
  foreach t in array array['work_catalog','part_catalog','worker_roles'] loop
    execute format('create trigger a_workshop_relations before insert or update on public.%I for each row execute function public.enforce_workshop_relations()',t);
  end loop;
  -- Auth user removal must not cascade-delete workshop history.
  for c in select conrelid::regclass as tbl,conname from pg_constraint
    where contype='f' and confrelid='auth.users'::regclass and confdeltype='c' and connamespace='public'::regnamespace loop
    execute format('alter table %s drop constraint %I',c.tbl,c.conname);
    execute format('alter table %s add constraint %I foreign key(owner_user_id) references auth.users(id)',c.tbl,c.conname);
  end loop;
end $$;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_user_id uuid references auth.users(id),
  actor_username_snapshot text not null,
  actor_role_snapshot text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  service_job_id uuid,
  vehicle_id uuid,
  plate text,
  summary text not null,
  changes jsonb not null default '{}',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_org_time on public.audit_logs(organization_id,created_at desc,id);
create index audit_org_actor on public.audit_logs(organization_id,actor_user_id,created_at desc);
create index audit_org_action on public.audit_logs(organization_id,action,created_at desc);
create index audit_org_entity on public.audit_logs(organization_id,entity_type,entity_id);
create index audit_org_job on public.audit_logs(organization_id,service_job_id,created_at desc);
create index audit_org_vehicle on public.audit_logs(organization_id,vehicle_id,created_at desc);
create index audit_org_plate on public.audit_logs(organization_id,plate,created_at desc);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from public,anon,authenticated;
grant select on public.audit_logs to authenticated,service_role;
create policy audit_admin_read on public.audit_logs for select to authenticated using (
  organization_id=prime_private.organization_id() and prime_private.has_role(array['ADMIN']::public.app_role[])
);
create function prime_private.immutable_history() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'History is append-only' using errcode='42501'; end $$;
create trigger immutable_audit before update or delete on public.audit_logs for each row execute function prime_private.immutable_history();
create trigger immutable_cash_delete before delete on public.cash_transactions for each row execute function prime_private.immutable_history();

create table public.cash_reversals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  transaction_id uuid not null unique references public.cash_transactions(id),
  service_job_id uuid not null references public.service_jobs(id),
  actor_user_id uuid references auth.users(id),
  amount numeric(12,2) not null check(amount>0),
  direction text not null check(direction in ('IN','OUT')),
  reason text not null check(length(trim(reason)) between 1 and 250),
  created_at timestamptz not null default now()
);
alter table public.cash_reversals enable row level security;
revoke all on public.cash_reversals from public,anon,authenticated;
grant select on public.cash_reversals to authenticated,service_role;
create policy reversal_read on public.cash_reversals for select to authenticated using(organization_id=prime_private.organization_id() and prime_private.has_role(array['ADMIN','CASHIER']::public.app_role[]));
create trigger immutable_reversal before update or delete on public.cash_reversals for each row execute function prime_private.immutable_history();
create index reversal_org_time on public.cash_reversals(organization_id,created_at desc);

create function prime_private.write_audit(org uuid, actor uuid, event text, entity text, entity_id uuid, job_id uuid, vehicle_id uuid, summary text, changes jsonb default '{}', metadata jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare p public.user_profiles; plate text;
begin
  select * into p from public.user_profiles where auth_user_id=actor and organization_id=org;
  if vehicle_id is null and job_id is not null then select j.vehicle_id into vehicle_id from public.service_jobs j where j.id=job_id and j.organization_id=org; end if;
  select v.plate into plate from public.vehicles v where v.id=vehicle_id and v.organization_id=org;
  insert into public.audit_logs(organization_id,actor_user_id,actor_username_snapshot,actor_role_snapshot,action,entity_type,entity_id,service_job_id,vehicle_id,plate,summary,changes,metadata)
  values(org,actor,coalesce(p.username,'system'),coalesce(p.role::text,'SYSTEM'),event,entity,entity_id,job_id,vehicle_id,plate,summary,changes,metadata);
end $$;

create function prime_private.audit_business_change() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare n jsonb:=to_jsonb(new); o jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}' end;
  delta jsonb:='{}'; field text; event text; events text[]; meta jsonb:='{}'; jid uuid; vid uuid; description text;
begin
  -- Allowlisted diffs never copy tokens, full rows or customer contact details.
  foreach field in array array['plate','make','model','color','vehicle_type','body_type','manufacturer','production_year','first_registration_date','engine_power_hp','engine_power_kw','registration_valid_until','max_permitted_mass_kg','unladen_mass_kg','funding_source','insurance_company','insurance_approved_amount','received_at','status','archived_at','assigned_worker_id','labor_cost','labor_cost_known','quoted_price','agreed_budget','target_delivery_date','quantity','unit_price','supplier_id','role_id','active','voided_at','void_reason','paid_amount','payment_status'] loop
    if n ? field and n->field is distinct from o->field then delta:=delta||jsonb_build_object(field,jsonb_build_object('before',o->field,'after',n->field)); end if;
  end loop;
  if tg_op='UPDATE' then
    foreach field in array array['customer_name','customer_phone','registered_owner_full_name','registered_owner_address','notes','phone','address'] loop
      if n->field is distinct from o->field then delta:=delta||jsonb_build_object(field,jsonb_build_object('changed',true)); end if;
    end loop;
  end if;
  jid:=case when tg_table_name='service_jobs' then new.id else (n->>'service_job_id')::uuid end;
  vid:=case when tg_table_name='vehicles' then new.id else (n->>'vehicle_id')::uuid end;
  event:=case tg_table_name when 'vehicles' then 'VEHICLE' when 'service_jobs' then 'SERVICE_JOB'
    when 'workers' then 'WORKER' when 'suppliers' then 'SUPPLIER' when 'purchases' then 'PURCHASE'
    when 'job_work_items' then 'WORK_QUOTE' when 'job_required_parts' then 'PART_QUOTE'
    when 'worker_roles' then 'WORKER_ROLE' when 'work_catalog' then 'WORK_CATALOG' when 'part_catalog' then 'PART_CATALOG' end;
  events:=array[event||case when tg_op='INSERT' then case when tg_table_name in ('job_work_items','job_required_parts') then '_ADDED' else '_CREATED' end else '_UPDATED' end];
  if tg_table_name='service_jobs' and tg_op='UPDATE' then
    if new.archived_at is distinct from old.archived_at then events:=array[case when new.archived_at is null then 'SERVICE_JOB_RESTORED' else 'SERVICE_JOB_ARCHIVED' end]; end if;
  end if;
  if tg_table_name='job_work_items' and tg_op='UPDATE' then
    if new.assigned_worker_id is distinct from old.assigned_worker_id then events:=array_append(events,'WORKER_ASSIGNED'); end if;
    if new.status is distinct from old.status then events:=array_append(events,'WORK_STATUS_CHANGED'); end if;
    if new.labor_cost is distinct from old.labor_cost or new.labor_cost_known is distinct from old.labor_cost_known then events:=array_append(events,'WORKER_COST_SET'); end if;
  end if;
  if tg_table_name='cash_transactions' then
    meta:=jsonb_build_object('amount',new.amount,'allocation_type',new.allocation_type,'transaction_date',new.transaction_date,
      'work_item_id',new.work_item_id,'purchase_id',new.purchase_id,'required_part_id',new.required_part_id,'direction',new.direction);
    if new.work_item_id is not null then
      select meta||jsonb_build_object('work',coalesce(w.custom_title,c.name),'worker',concat_ws(' ',u.first_name,u.last_name)) into meta
      from job_work_items w left join work_catalog c on c.id=w.work_catalog_id left join workers u on u.id=w.assigned_worker_id where w.id=new.work_item_id;
    end if;
    events:=array[case when tg_op='UPDATE' then 'PAYMENT_VOIDED' when new.allocation_type like 'CUSTOMER_%' then 'CUSTOMER_PAYMENT_CREATED' when new.allocation_type='SUPPLIER_PURCHASE' then 'SUPPLIER_PAYMENT_CREATED' else 'WORKER_PAYMENT_CREATED' end];
  end if;
  foreach event in array events loop
    description:=case event
      when 'VEHICLE_CREATED' then 'Avtomobil yaradıldı' when 'VEHICLE_UPDATED' then 'Avtomobil yeniləndi'
      when 'SERVICE_JOB_CREATED' then 'Servis kartı yaradıldı' when 'SERVICE_JOB_UPDATED' then 'Servis kartı yeniləndi'
      when 'SERVICE_JOB_ARCHIVED' then 'Servis kartı arxivləndi' when 'SERVICE_JOB_RESTORED' then 'Servis kartı bərpa edildi'
      when 'WORKER_ASSIGNED' then 'İşə usta təyin edildi' when 'WORK_STATUS_CHANGED' then 'İşin statusu dəyişdi'
      when 'WORKER_COST_SET' then 'Usta mayası daxil edildi'
      when 'CUSTOMER_PAYMENT_CREATED' then 'Müştəri ödənişi' when 'SUPPLIER_PAYMENT_CREATED' then 'Təchizatçı ödənişi'
      when 'WORKER_PAYMENT_CREATED' then 'Usta ödənişi' when 'PAYMENT_VOIDED' then 'Ödəniş ləğv edildi'
      when 'WORK_QUOTE_ADDED' then 'İş təklifi əlavə edildi' when 'WORK_QUOTE_UPDATED' then 'İş təklifi yeniləndi'
      when 'PART_QUOTE_ADDED' then 'Detal təklifi əlavə edildi' when 'PART_QUOTE_UPDATED' then 'Detal təklifi yeniləndi'
      when 'PURCHASE_CREATED' then 'Alış yaradıldı' when 'PURCHASE_UPDATED' then 'Alış yeniləndi'
      when 'SUPPLIER_CREATED' then 'Təchizatçı yaradıldı' when 'SUPPLIER_UPDATED' then 'Təchizatçı yeniləndi'
      when 'WORKER_CREATED' then 'İşçi yaradıldı' when 'WORKER_UPDATED' then 'İşçi yeniləndi'
      else replace(event,'_',' ') end;
    if meta ? 'amount' then description:=description||': '||(meta->>'amount')||' AZN'; end if;
    perform prime_private.write_audit(new.organization_id,auth.uid(),event,tg_table_name,new.id,jid,vid,description,delta,meta);
  end loop;
  return new;
end $$;
do $$ declare t text;
begin
  foreach t in array array['vehicles','service_jobs','workers','suppliers','job_work_items','purchases','job_required_parts','cash_transactions','work_catalog','part_catalog','worker_roles'] loop
    execute format('create trigger z_audit after insert or update on public.%I for each row execute function prime_private.audit_business_change()',t);
  end loop;
end $$;

-- Historical voids receive reversal references without inventing a historical actor.
insert into public.cash_reversals(organization_id,transaction_id,service_job_id,amount,direction,reason,created_at)
select organization_id,id,service_job_id,amount,case when direction='IN' then 'OUT' else 'IN' end,coalesce(nullif(trim(void_reason),''),'Legacy void'),voided_at
from public.cash_transactions where voided_at is not null;

create or replace function create_catalog_entry(p_kind text,p_name text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare org uuid; t text; result jsonb; cleaned text;
begin
  org:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
  if auth.uid() is null then raise exception 'Sessiya tapılmadı'; end if;
  if p_kind='role' and not prime_private.has_role(array['ADMIN']::public.app_role[]) then raise exception 'Giriş icazəsi yoxdur' using errcode='42501'; end if;
  t := case p_kind when 'work' then 'work_catalog' when 'part' then 'part_catalog' when 'role' then 'worker_roles' end;
  cleaned := regexp_replace(trim(p_name),'\s+',' ','g');
  if t is null or length(cleaned) not between 1 and 120 then raise exception 'Ad 1-120 simvol olmalıdır'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text || t || catalog_key(cleaned),0));
  execute format('select to_jsonb(c) from %I c where catalog_key(name)=catalog_key($1) and organization_id=$2 order by created_at limit 1',t) into result using cleaned,org;
  if result is not null then
    execute format('update %I set active=true where id=$1 and organization_id=$2',t) using (result->>'id')::uuid,org;
    return result;
  end if;
  if p_kind='work' then
    insert into work_catalog(owner_user_id,code,category,name) values(auth.uid(),gen_random_uuid()::text,'Servis',cleaned) returning to_jsonb(work_catalog) into result;
  elsif p_kind='part' then
    insert into part_catalog(owner_user_id,category,name) values(auth.uid(),'Servis',cleaned) returning to_jsonb(part_catalog) into result;
  else
    insert into worker_roles(owner_user_id,name) values(auth.uid(),cleaned) returning to_jsonb(worker_roles) into result;
  end if;
  return result;
end $$;

create or replace function record_cash_payment(p_job uuid,p_type text,p_target uuid,p_amount numeric,p_date date,p_note text,p_key uuid) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare org uuid; existing_id uuid; result uuid;
begin
  org:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
  perform 1 from service_jobs where id=p_job and organization_id=org for update;
  if not found then raise exception 'Servis kartı tapılmadı'; end if;
  select id into existing_id from cash_transactions where idempotency_key=p_key and organization_id=org;
  if found then return existing_id; end if;
  if p_amount <> round(p_amount,2) then raise exception 'Məbləğ ən çox iki onluq rəqəm ola bilər'; end if;
  insert into cash_transactions(owner_user_id,service_job_id,allocation_type,work_item_id,required_part_id,purchase_id,amount,transaction_date,notes,idempotency_key)
  values(auth.uid(),p_job,p_type,case when p_type in ('CUSTOMER_WORK','WORKER_WORK_ITEM') then p_target end,
    case when p_type='CUSTOMER_PART' then p_target end,case when p_type='SUPPLIER_PURCHASE' then p_target end,p_amount,p_date,p_note,p_key) returning id into result;
  return result;
end $$;

create or replace function save_workshop_purchase(p_data jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare org uuid; r job_required_parts; p purchases; result uuid; initial_paid numeric; old_purchase purchases;
begin
  org:=prime_private.require_role(array['ADMIN']::public.app_role[]);
  select * into p from jsonb_populate_record(null::purchases,p_data);
  perform 1 from service_jobs where id=p.service_job_id and organization_id=org for update;
  if not found then raise exception 'Servis kartı tapılmadı'; end if;
  if p.id is null then
    select id into result from purchases where id=p_key and organization_id=org;
    if found then return result; end if;
  end if;
  if p.required_part_id is not null then
    select * into r from job_required_parts where id=p.required_part_id and service_job_id=p.service_job_id;
    if not found then raise exception 'Tələb olunan detal tapılmadı'; end if;
    p.part_catalog_id := r.part_catalog_id;
    p.custom_item_name := null;
  end if;
  if p.source_type='CUSTOMER_PROVIDED' then p.unit_price:=0; end if;
  initial_paid := case when p.source_type<>'SUPPLIER' then 0 when p.payment_status='PAID' then p.quantity*p.unit_price when p.payment_status='PARTIAL' then p.paid_amount else 0 end;
  if p.id is null and p.source_type='SUPPLIER' and p.payment_status='PARTIAL' and (initial_paid is null or initial_paid<=0 or initial_paid>=p.quantity*p.unit_price) then raise exception 'Qismən ödəniş düzgün deyil'; end if;
  if p.id is null then
    insert into purchases(id,owner_user_id,service_job_id,required_part_id,part_catalog_id,custom_item_name,quantity,unit_price,source_type,supplier_id,purchased_by_worker_id,purchased_by_admin,payment_status,paid_amount,part_code_oem,brand_model,serial_no,document_no,purchase_date,notes)
    values(p_key,auth.uid(),p.service_job_id,p.required_part_id,p.part_catalog_id,p.custom_item_name,p.quantity,p.unit_price,p.source_type,p.supplier_id,p.purchased_by_worker_id,p.purchased_by_admin,'UNPAID',0,p.part_code_oem,p.brand_model,p.serial_no,p.document_no,p.purchase_date,p.notes) returning id into result;
    if initial_paid>0 then perform record_cash_payment(p.service_job_id,'SUPPLIER_PURCHASE',result,initial_paid,p.purchase_date,p.notes,p_key); end if;
  else
    select * into old_purchase from purchases where id=p.id and service_job_id=p.service_job_id and voided_at is null;
    if not found then raise exception 'Alış tapılmadı'; end if;
    -- Editing metadata/cost never silently edits a settlement; use Kassa for payment changes.
    update purchases set unit_price=p.unit_price,quantity=p.quantity,source_type=p.source_type,supplier_id=p.supplier_id,
      purchased_by_worker_id=p.purchased_by_worker_id,purchased_by_admin=p.purchased_by_admin,part_code_oem=p.part_code_oem,
      brand_model=p.brand_model,serial_no=p.serial_no,document_no=p.document_no,purchase_date=p.purchase_date,notes=p.notes
      where id=p.id returning id into result;
  end if;
  return result;
end $$;

create or replace function create_workshop_job(p_vehicle jsonb,p_job jsonb,p_works jsonb,p_parts jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare org uuid; v vehicles; j service_jobs; vid uuid; jid uuid; line jsonb; pos int:=0;
begin
  org:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
  if auth.uid() is null then raise exception 'Sessiya tapılmadı'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  if exists(select 1 from service_jobs where id=p_key and organization_id=org) then return p_key; end if;
  select * into v from jsonb_populate_record(null::vehicles,p_vehicle);
  select * into j from jsonb_populate_record(null::service_jobs,p_job);
  if nullif(trim(v.make),'') is null or nullif(trim(v.model),'') is null then raise exception 'Marka və model tələb olunur'; end if;
  if jsonb_array_length(p_works)+jsonb_array_length(p_parts)=0 then raise exception 'Ən azı bir iş və ya detal tələb olunur'; end if;
  if exists(select 1 from jsonb_array_elements(p_works) x group by x->>'catalogId' having count(*)>1) then raise exception 'Təkrar iş seçilib'; end if;
  insert into vehicles(owner_user_id,plate,make,model,vehicle_type,body_type,manufacturer,production_year,first_registration_date,vin_body_number,chassis_number,engine_number,engine_power_hp,engine_power_kw,color,registration_certificate_series_no,registration_valid_until,max_permitted_mass_kg,unladen_mass_kg,registered_owner_full_name,registered_owner_address)
  values(auth.uid(),v.plate,v.make,v.model,v.vehicle_type,v.body_type,v.manufacturer,v.production_year,v.first_registration_date,v.vin_body_number,v.chassis_number,v.engine_number,v.engine_power_hp,v.engine_power_kw,v.color,v.registration_certificate_series_no,v.registration_valid_until,v.max_permitted_mass_kg,v.unladen_mass_kg,v.registered_owner_full_name,v.registered_owner_address)
  on conflict(organization_id,plate) do update set make=excluded.make,model=excluded.model,
    vehicle_type=coalesce(excluded.vehicle_type,vehicles.vehicle_type),body_type=coalesce(excluded.body_type,vehicles.body_type),
    manufacturer=coalesce(excluded.manufacturer,vehicles.manufacturer),production_year=coalesce(excluded.production_year,vehicles.production_year),
    first_registration_date=coalesce(excluded.first_registration_date,vehicles.first_registration_date),vin_body_number=coalesce(excluded.vin_body_number,vehicles.vin_body_number),
    chassis_number=coalesce(excluded.chassis_number,vehicles.chassis_number),engine_number=coalesce(excluded.engine_number,vehicles.engine_number),
    engine_power_hp=coalesce(excluded.engine_power_hp,vehicles.engine_power_hp),engine_power_kw=coalesce(excluded.engine_power_kw,vehicles.engine_power_kw),
    color=coalesce(excluded.color,vehicles.color),registration_certificate_series_no=coalesce(excluded.registration_certificate_series_no,vehicles.registration_certificate_series_no),
    registration_valid_until=coalesce(excluded.registration_valid_until,vehicles.registration_valid_until),max_permitted_mass_kg=coalesce(excluded.max_permitted_mass_kg,vehicles.max_permitted_mass_kg),
    unladen_mass_kg=coalesce(excluded.unladen_mass_kg,vehicles.unladen_mass_kg),registered_owner_full_name=coalesce(excluded.registered_owner_full_name,vehicles.registered_owner_full_name),
    registered_owner_address=coalesce(excluded.registered_owner_address,vehicles.registered_owner_address)
  returning id into vid;
  jid:=p_key;
  insert into service_jobs(id,owner_user_id,vehicle_id,job_no,customer_name,customer_phone,funding_source,insurance_company,insurance_claim_no,insurance_approved_amount,agreed_budget,received_at,target_delivery_date,notes,has_line_quotes)
  values(jid,auth.uid(),vid,'PR-'||to_char(now() at time zone 'Asia/Baku','YYYY')||'-'||upper(left(replace(jid::text,'-',''),12)),j.customer_name,j.customer_phone,j.funding_source,j.insurance_company,j.insurance_claim_no,j.insurance_approved_amount,coalesce(j.agreed_budget,0),coalesce(j.received_at,now()),j.target_delivery_date,j.notes,true);
  for line in select * from jsonb_array_elements(p_works) loop
    if line->>'quotedPrice' is null or (line->>'quotedPrice')::numeric <> round((line->>'quotedPrice')::numeric,2) then raise exception 'Müştəri qiyməti iki onluq rəqəmli məbləğ olmalıdır'; end if;
    insert into job_work_items(owner_user_id,service_job_id,work_catalog_id,quoted_price,notes,display_order)
    values(auth.uid(),jid,(line->>'catalogId')::uuid,(line->>'quotedPrice')::numeric,line->>'note',pos);
    pos:=pos+1;
  end loop;
  pos:=0;
  for line in select * from jsonb_array_elements(p_parts) loop
    if line->>'quotedPrice' is null or (line->>'quotedPrice')::numeric <> round((line->>'quotedPrice')::numeric,2) then raise exception 'Müştəri qiyməti iki onluq rəqəmli məbləğ olmalıdır'; end if;
    insert into job_required_parts(owner_user_id,service_job_id,part_catalog_id,quoted_price,notes,display_order)
    values(auth.uid(),jid,(line->>'catalogId')::uuid,(line->>'quotedPrice')::numeric,line->>'note',pos);
    pos:=pos+1;
  end loop;
  return jid;
end $$;

create function public.intake_work_items(p_job uuid default null) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
begin
  return query select jsonb_build_object('id',w.id,'service_job_id',w.service_job_id,'work_catalog_id',w.work_catalog_id,
    'custom_title',w.custom_title,'status',w.status,'quoted_price',w.quoted_price,'notes',w.notes,'display_order',w.display_order,
    'planned_at',w.planned_at,'started_at',w.started_at,'completed_at',w.completed_at,
    'work_catalog',jsonb_build_object('id',c.id,'name',c.name,'category',c.category))
  from public.job_work_items w left join public.work_catalog c on c.id=w.work_catalog_id
  where w.organization_id=org and (p_job is null or w.service_job_id=p_job) order by w.id;
end $$;

create function public.update_vehicle_intake(p_job uuid,p_vehicle jsonb,p_details jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]); v vehicles; j service_jobs;
begin
  select * into j from service_jobs where id=p_job and organization_id=org and archived_at is null for update;
  if not found then raise exception 'Servis kartı tapılmadı' using errcode='42501'; end if;
  if exists(select 1 from jsonb_object_keys(p_vehicle) k where k not in ('plate','make','model','vehicle_type','body_type','manufacturer','production_year','first_registration_date','vin_body_number','chassis_number','engine_number','engine_power_hp','engine_power_kw','color','registration_certificate_series_no','registration_valid_until','max_permitted_mass_kg','unladen_mass_kg','registered_owner_full_name','registered_owner_address'))
    or exists(select 1 from jsonb_object_keys(p_details) k where k not in ('customer_name','customer_phone','funding_source','insurance_company','insurance_claim_no','insurance_approved_amount','agreed_budget','received_at','target_delivery_date','notes')) then raise exception 'Unsupported intake field' using errcode='42501'; end if;
  select * into v from vehicles where id=j.vehicle_id and organization_id=org for update;
  v:=jsonb_populate_record(v,p_vehicle); j:=jsonb_populate_record(j,p_details);
  if nullif(trim(v.make),'') is null or nullif(trim(v.model),'') is null then raise exception 'Marka və model tələb olunur'; end if;
  update vehicles set plate=v.plate,make=v.make,model=v.model,vehicle_type=v.vehicle_type,body_type=v.body_type,manufacturer=v.manufacturer,
    production_year=v.production_year,first_registration_date=v.first_registration_date,vin_body_number=v.vin_body_number,chassis_number=v.chassis_number,
    engine_number=v.engine_number,engine_power_hp=v.engine_power_hp,engine_power_kw=v.engine_power_kw,color=v.color,
    registration_certificate_series_no=v.registration_certificate_series_no,registration_valid_until=v.registration_valid_until,
    max_permitted_mass_kg=v.max_permitted_mass_kg,unladen_mass_kg=v.unladen_mass_kg,registered_owner_full_name=v.registered_owner_full_name,
    registered_owner_address=v.registered_owner_address,updated_at=now() where id=v.id and organization_id=org;
  update service_jobs set customer_name=j.customer_name,customer_phone=j.customer_phone,funding_source=j.funding_source,insurance_company=j.insurance_company,
    insurance_claim_no=j.insurance_claim_no,insurance_approved_amount=j.insurance_approved_amount,agreed_budget=j.agreed_budget,received_at=j.received_at,
    target_delivery_date=j.target_delivery_date,notes=j.notes,updated_at=now() where id=j.id and organization_id=org;
end $$;

create function public.save_quote_line(p_job uuid,p_kind text,p_catalog uuid,p_price numeric,p_note text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]); target uuid;
begin
  perform 1 from service_jobs where id=p_job and organization_id=org and archived_at is null and has_line_quotes for update;
  if not found then raise exception 'Servis kartı tapılmadı' using errcode='42501'; end if;
  if p_price is null or p_price<0 or p_price>9999999999.99 or p_price<>round(p_price,2) then raise exception 'Qiymət düzgün deyil'; end if;
  if p_kind='work' then
    select id into target from job_work_items where service_job_id=p_job and work_catalog_id=p_catalog;
    if target is null then
      insert into job_work_items(owner_user_id,service_job_id,work_catalog_id,quoted_price,notes) values(auth.uid(),p_job,p_catalog,p_price,p_note);
    else update job_work_items set quoted_price=p_price,notes=p_note where id=target; end if;
  elsif p_kind='part' then
    insert into job_required_parts(owner_user_id,service_job_id,part_catalog_id,quoted_price,notes) values(auth.uid(),p_job,p_catalog,p_price,p_note)
    on conflict(service_job_id,part_catalog_id) do update set quoted_price=excluded.quoted_price,notes=excluded.notes;
  else raise exception 'Unsupported quote type'; end if;
end $$;

create function public.set_worker_cost(p_id uuid,p_cost numeric) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]); jid uuid;
begin
  select service_job_id into jid from public.job_work_items where id=p_id and organization_id=org;
  if jid is null then raise exception 'İş tapılmadı' using errcode='42501'; end if;
  perform 1 from public.service_jobs where id=jid and organization_id=org for update;
  if p_cost is null or p_cost<0 or p_cost<>round(p_cost,2) or p_cost>9999999999.99 then raise exception 'Məbləğ düzgün deyil'; end if;
  update public.job_work_items set labor_cost=p_cost,labor_cost_known=true where id=p_id and organization_id=org;
end $$;

create function public.void_cash_payment(p_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); t public.cash_transactions; result uuid;
begin
  if length(trim(p_reason)) not between 1 and 250 or p_reason is null then raise exception 'Ləğv səbəbi tələb olunur'; end if;
  select * into t from public.cash_transactions where id=p_id and organization_id=org;
  if not found then raise exception 'Ödəniş tapılmadı' using errcode='42501'; end if;
  perform 1 from public.service_jobs where id=t.service_job_id for update;
  select id into result from public.cash_reversals where transaction_id=p_id;
  if found then return result; end if;
  update public.cash_transactions set voided_at=now(),void_reason=trim(p_reason) where id=p_id and voided_at is null;
  insert into public.cash_reversals(organization_id,transaction_id,service_job_id,actor_user_id,amount,direction,reason)
  values(org,t.id,t.service_job_id,auth.uid(),t.amount,case when t.direction='IN' then 'OUT' else 'IN' end,trim(p_reason)) returning id into result;
  perform prime_private.write_audit(org,auth.uid(),'PAYMENT_REVERSED','cash_reversals',result,t.service_job_id,null,'PAYMENT_REVERSED','{}',
    jsonb_build_object('original_transaction_id',t.id,'amount',t.amount,'reason',trim(p_reason)));
  return result;
end $$;

-- Server-only security events: caller identity is verified by Auth before using the service client.
create function public.record_security_event(p_actor uuid,p_event text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.user_profiles;
begin
  select * into p from public.user_profiles where auth_user_id=p_actor and is_active;
  if not found or p_event not in ('LOGIN_SUCCESS','LOGOUT','PASSWORD_CHANGED') then raise exception 'Invalid security event'; end if;
  if p_event='LOGIN_SUCCESS' then update public.user_profiles set last_login_at=now(),updated_at=now() where auth_user_id=p_actor; end if;
  if p_event='PASSWORD_CHANGED' then update public.user_profiles set must_change_password=false,session_not_before=now(),updated_at=now() where auth_user_id=p_actor; end if;
  perform prime_private.write_audit(p.organization_id,p_actor,p_event,'user_profiles',p_actor,null,null,p_event);
end $$;
create function public.manage_staff_account(p_actor uuid,p_target uuid,p_operation text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.user_profiles; t public.user_profiles; event text;
begin
  select * into a from public.user_profiles where auth_user_id=p_actor and is_active and not must_change_password and role='ADMIN';
  if not found then raise exception 'Giriş icazəsi yoxdur' using errcode='42501'; end if;
  select * into t from public.user_profiles where auth_user_id=p_target and organization_id=a.organization_id and username in ('admin','kassa','qeydiyyat') for update;
  if not found or t.role='ADMIN' then raise exception 'Administrator access is protected' using errcode='42501'; end if;
  if p_operation not in ('enable','disable','reset') then raise exception 'Invalid account operation'; end if;
  update public.user_profiles set is_active=case p_operation when 'enable' then true when 'disable' then false else is_active end,
    must_change_password=case when p_operation='reset' then true else must_change_password end,
    session_not_before=now(),updated_at=now() where auth_user_id=p_target;
  event:=case p_operation when 'enable' then 'USER_ENABLED' when 'disable' then 'USER_DISABLED' else 'PASSWORD_RESET_REQUESTED' end;
  perform prime_private.write_audit(a.organization_id,p_actor,event,'user_profiles',p_target,null,null,event,'{}',jsonb_build_object('username',t.username));
end $$;
create function prime_private.protect_admin() returns trigger language plpgsql set search_path='' as $$
begin
  if old.role='ADMIN' and (tg_op='DELETE' or not new.is_active or new.role<>'ADMIN' or new.organization_id<>old.organization_id) then raise exception 'Administrator access is protected'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger protect_admin before update or delete on public.user_profiles for each row execute function prime_private.protect_admin();

-- Explicit grants: Postgres grants PUBLIC execution on new functions by default.
revoke all on all functions in schema prime_private from public,anon,authenticated;
grant execute on function prime_private.organization_id(),prime_private.has_role(public.app_role[]) to authenticated;
do $$ declare f record;
begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in
    ('get_access_profile','create_catalog_entry','record_cash_payment','save_workshop_purchase','create_workshop_job','intake_work_items','update_vehicle_intake','save_quote_line','set_worker_cost','void_cash_payment','record_security_event','manage_staff_account',
     'enforce_workshop_relations','validate_cash_transaction','sync_purchase_payment','guard_financial_edits','guard_legacy_budget','derive_job_status') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
end $$;
grant execute on function public.get_access_profile(),public.create_catalog_entry(text,text),public.record_cash_payment(uuid,text,uuid,numeric,date,text,uuid),
  public.save_workshop_purchase(jsonb,uuid),public.create_workshop_job(jsonb,jsonb,jsonb,jsonb,uuid),public.intake_work_items(uuid),
  public.update_vehicle_intake(uuid,jsonb,jsonb),public.save_quote_line(uuid,text,uuid,numeric,text),public.set_worker_cost(uuid,numeric),public.void_cash_payment(uuid,text) to authenticated;
grant execute on function public.record_security_event(uuid,text),public.manage_staff_account(uuid,uuid,text) to service_role;

commit;
