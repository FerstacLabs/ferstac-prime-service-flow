begin;

-- Only business fields are eligible. Unknown columns and credentials never enter audit.
create function prime_private.business_diff(before_row jsonb, after_row jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select coalesce(jsonb_object_agg(key,jsonb_build_object('before',before_row->key,'after',after_row->key)),'{}'::jsonb)
  from unnest(array[
    'plate','make','model','color','vehicle_type','body_type','manufacturer','production_year',
    'first_registration_date','engine_power_hp','engine_power_kw','registration_valid_until',
    'max_permitted_mass_kg','unladen_mass_kg','funding_source','insurance_company',
    'insurance_approved_amount','received_at','status','archived_at','assigned_worker_id',
    'labor_cost','labor_cost_known','quoted_price','agreed_budget','target_delivery_date',
    'quantity','unit_price','customer_unit_price','unit_id','supplier_id','role_id','active',
    'voided_at','void_reason','paid_amount','payment_status','customer_name','customer_phone',
    'registered_owner_full_name','registered_owner_address','notes','phone','address','cost_note',
    'name','first_name','last_name','father_name','company_name','shop_name','custom_title',
    'custom_item_name','started_at','completed_at','planned_at','document_no','part_code_oem'
  ]) key
  where after_row ? key and after_row->key is distinct from before_row->key
$$;

create or replace function prime_private.audit_business_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new); o jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}' end;
  delta jsonb:=prime_private.business_diff(o,n); event text; events text[];
  meta jsonb:='{}'; jid uuid; vid uuid;
begin
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
      select meta||jsonb_build_object('work',coalesce(w.custom_title,c.name),'worker',concat_ws(' ',u.snapshot->>'first_name',u.snapshot->>'last_name')) into meta
      from public.job_work_items w left join public.work_catalog c on c.id=w.work_catalog_id
      left join public.master_identities u on u.id=w.assigned_worker_id and u.organization_id=new.organization_id where w.id=new.work_item_id;
    end if;
    events:=array[case when tg_op='UPDATE' then 'PAYMENT_VOIDED' when new.allocation_type like 'CUSTOMER_%' then 'CUSTOMER_PAYMENT_CREATED' when new.allocation_type='SUPPLIER_PURCHASE' then 'SUPPLIER_PAYMENT_CREATED' else 'WORKER_PAYMENT_CREATED' end];
  end if;
  foreach event in array events loop
    perform prime_private.write_audit(new.organization_id,auth.uid(),event,tg_table_name,new.id,jid,vid,replace(event,'_',' '),delta,meta);
  end loop;
  return new;
end $$;

-- Domain validation precedes the unique constraint and remains idempotent on retry.
alter function public.save_workshop_purchase(jsonb,uuid) rename to save_workshop_purchase_0009;
revoke all on function public.save_workshop_purchase_0009(jsonb,uuid) from public,anon,authenticated;
create function public.save_workshop_purchase(p_data jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); jid uuid:=(p_data->>'service_job_id')::uuid;
begin
  perform 1 from public.service_jobs where id=jid and organization_id=org for update;
  if not found then raise exception 'Servis kartı tapılmadı'; end if;
  if nullif(p_data->>'id','') is null and nullif(p_data->>'required_part_id','') is null
    and p_data->>'additional'='true'
    and not exists(select 1 from public.purchases where id=p_key and service_job_id=jid and organization_id=org)
    and exists(select 1 from public.job_required_parts where service_job_id=jid and organization_id=org and part_catalog_id=(p_data->>'part_catalog_id')::uuid) then
    raise exception 'Bu detal bu servis kartında artıq mövcuddur. Mövcud detalın alış/maya məlumatını yeniləyin və ya başqa detal seçin.';
  end if;
  return public.save_workshop_purchase_0009(p_data,p_key);
end $$;

-- Preserve the existing validation transaction; completion rolls back with any close failure.
alter function public.set_vehicle_financial_state(uuid,boolean,text) rename to set_vehicle_financial_state_0009;
revoke all on function public.set_vehicle_financial_state_0009(uuid,boolean,text) from public,anon,authenticated;
create function public.set_vehicle_financial_state(p_job uuid,p_close boolean,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]); j public.service_jobs; completed_count integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  select * into j from public.service_jobs where id=p_job and organization_id=org and archived_at is null and deleted_at is null for update;
  if not found then raise exception 'Servis kartı tapılmadı'; end if;
  if p_close then
    if j.financially_closed_at is not null then return; end if;
    update public.job_work_items set status='DONE',started_at=coalesce(started_at,now()),completed_at=coalesce(completed_at,now())
      where service_job_id=j.id and organization_id=org and status in ('TODO','IN_PROGRESS');
    get diagnostics completed_count=row_count;
  end if;
  perform public.set_vehicle_financial_state_0009(p_job,p_close,p_reason);
  if p_close then
    perform prime_private.write_audit(org,auth.uid(),'VEHICLE_WORK_COMPLETED','service_jobs',j.id,j.id,j.vehicle_id,
      'Maliyyə bağlanarkən işlər tamamlandı','{}',jsonb_build_object('completed_count',completed_count));
  end if;
end $$;

create or replace function prime_private.guard_costing_extensions() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='purchases' then
    if tg_op='INSERT' or new.purchased_by_admin is distinct from old.purchased_by_admin or new.purchased_by_worker_id is distinct from old.purchased_by_worker_id then
      if new.purchased_by_admin then new.purchased_by_worker_id:=null;
      elsif new.purchased_by_worker_id is null then raise exception 'Alan işçini seçin'; end if;
    end if;
    if new.supplier_id is not null and (tg_op='INSERT' or new.supplier_id is distinct from old.supplier_id) and not exists(select 1 from public.suppliers where id=new.supplier_id and organization_id=new.organization_id and active) then raise exception 'Təchizatçı arxivdədir'; end if;
  else
    if tg_op='UPDATE' and new.is_additional is distinct from old.is_additional then raise exception 'Sətrin mənbəyi dəyişdirilə bilməz'; end if;
    if new.is_additional and not prime_private.has_role(array['ADMIN']::public.app_role[]) then
      if not (tg_op='UPDATE' and tg_table_name='job_work_items' and (
        (prime_private.has_role(array['INTAKE']::public.app_role[]) and
          (to_jsonb(new)-array['assigned_worker_id','status','notes','started_at','completed_at','updated_at','compensation_mode']) =
          (to_jsonb(old)-array['assigned_worker_id','status','notes','started_at','completed_at','updated_at','compensation_mode']))
        or (prime_private.has_role(array['CASHIER']::public.app_role[]) and new.status='DONE' and old.status in ('TODO','IN_PROGRESS') and
          (to_jsonb(new)-array['status','started_at','completed_at','updated_at']) =
          (to_jsonb(old)-array['status','started_at','completed_at','updated_at']))
      )) then raise exception 'Administrator tələb olunur' using errcode='42501'; end if;
    end if;
  end if;
  return new;
end $$;

-- Catalog revisions keep the original identity/name for every historical line.
alter function public.record_financial_transaction(jsonb,uuid) rename to record_financial_transaction_0009;
revoke all on function public.record_financial_transaction_0009(jsonb,uuid) from public,anon,authenticated;
create function public.record_financial_transaction(p_data jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]); kind text:=p_data->>'allocation_type';
  item_name text; plate text; job_no text; reference text; explanation text:=btrim(coalesce(p_data->>'purpose','')); existing_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  select id into existing_id from public.cash_transactions where organization_id=org and idempotency_key=p_key;
  if found then return existing_id; end if;
  if length(explanation)>500 then raise exception 'Əlavə izah ən çox 500 simvol ola bilər'; end if;
  if kind='SUPPLIER_PURCHASE' then
    select coalesce(p.custom_item_name,c.name,'Detal'),v.plate,j.job_no,
      coalesce(nullif(p.document_no,''),nullif(p.part_code_oem,''),j.job_no||'-AL-'||left(p.id::text,8))
      into item_name,plate,job_no,reference from public.purchases p
      join public.service_jobs j on j.id=p.service_job_id and j.organization_id=org
      join public.vehicles v on v.id=j.vehicle_id and v.organization_id=org
      left join public.part_catalog c on c.id=p.part_catalog_id
      where p.id=(p_data->>'target_id')::uuid and p.organization_id=org;
  elsif kind='WORKER_WORK_ITEM' then
    select coalesce(w.custom_title,c.name,'İş'),v.plate,j.job_no,j.job_no||'-IS-'||left(w.id::text,8)
      into item_name,plate,job_no,reference from public.job_work_items w
      join public.service_jobs j on j.id=w.service_job_id and j.organization_id=org
      join public.vehicles v on v.id=j.vehicle_id and v.organization_id=org
      left join public.work_catalog c on c.id=w.work_catalog_id
      where w.id=(p_data->>'target_id')::uuid and w.organization_id=org;
  end if;
  if kind in ('SUPPLIER_PURCHASE','WORKER_WORK_ITEM') then
    if item_name is null then raise exception 'Ödəniş üçün əlaqəli qeyd tapılmadı'; end if;
    p_data:=p_data||jsonb_build_object('purpose',left(concat_ws(' · ',plate,item_name,nullif(explanation,'')),500),
      'reference_number',coalesce(nullif(p_data->>'reference_number',''),reference),
      'supporting_reference',coalesce(nullif(p_data->>'supporting_reference',''),reference),
      'counterparty_details',coalesce(p_data->'counterparty_details','{}')||jsonb_build_object('item_name',item_name,'plate',plate,'job_no',job_no));
  elsif explanation='' then
    if kind in ('GENERAL_IN','GENERAL_OUT','VEHICLE_EXPENSE') then
      select name into explanation from public.transaction_categories where id=nullif(p_data->>'category_id','')::uuid and organization_id=org;
      if explanation is null then raise exception 'Təyinat seçin'; end if;
    else explanation:=case when kind='CUSTOMER_VEHICLE' then 'Müştəri ödənişi' else 'Başlanğıc qalıq' end;
    end if;
    p_data:=p_data||jsonb_build_object('purpose',explanation);
  end if;
  return public.record_financial_transaction_0009(p_data,p_key);
end $$;
revoke all on function public.record_financial_transaction(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.record_financial_transaction(jsonb,uuid) to authenticated;

-- Catalog revisions keep the original identity/name for every historical line.
-- Renaming creates an active revision and archives the old one; no job is rewritten.
create function public.manage_catalog(p_kind text,p_id uuid,p_action text,p_name text default null,p_short_name text default '',p_confirmation text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); t text; old_row jsonb; result uuid;
  cleaned text:=regexp_replace(btrim(p_name),'\s+',' ','g'); active_field text;
begin
  t:=case p_kind when 'work' then 'work_catalog' when 'part' then 'part_catalog' when 'unit' then 'unit_catalog' end;
  if t is null or p_action is null or p_action not in ('rename','archive','restore','delete') then raise exception 'Kataloq əməliyyatı düzgün deyil'; end if;
  active_field:=case when p_kind='unit' then 'is_active' else 'active' end;
  perform pg_advisory_xact_lock(hashtextextended(org::text||t||'catalog-management',0));
  execute format('select to_jsonb(c) from public.%I c where id=$1 and organization_id=$2 for update',t) into old_row using p_id,org;
  if old_row is null then raise exception 'Kataloq qeydi tapılmadı'; end if;
  if p_action='delete' then
    if p_confirmation is distinct from 'SİL' then raise exception 'Təsdiq üçün SİL yazın'; end if;
    begin
      execute format('delete from public.%I where id=$1 and organization_id=$2',t) using p_id,org;
    exception when foreign_key_violation then raise exception 'Bu qeyd tarixçədə istifadə olunur. Silmək əvəzinə arxivləyin.';
    end;
  elsif p_action in ('archive','restore') then
    execute format('update public.%I set %I=$1 where id=$2 and organization_id=$3',t,active_field) using p_action='restore',p_id,org;
  else
    if cleaned is null or length(cleaned) not between 1 and 120 or length(coalesce(p_short_name,''))>20 then raise exception 'Kataloq adı düzgün deyil'; end if;
    if cleaned=old_row->>'name' and (p_kind<>'unit' or coalesce(p_short_name,'')=old_row->>'short_name') then return p_id; end if;
    if p_kind='unit' then
      insert into public.unit_catalog(organization_id,name,short_name,created_by)
        values(org,cleaned,coalesce(p_short_name,''),auth.uid()) returning id into result;
    elsif p_kind='work' then
      insert into public.work_catalog(owner_user_id,code,category,name,sort_order)
        values(auth.uid(),gen_random_uuid()::text,old_row->>'category',cleaned,(old_row->>'sort_order')::integer) returning id into result;
    else
      insert into public.part_catalog(owner_user_id,category,name,sort_order)
        values(auth.uid(),old_row->>'category',cleaned,(old_row->>'sort_order')::integer) returning id into result;
    end if;
    execute format('update public.%I set %I=false where id=$1 and organization_id=$2',t,active_field) using p_id,org;
  end if;
  perform prime_private.write_audit(org,auth.uid(),'CATALOG_MANAGED',t,p_id,null,null,'Kataloq yeniləndi',
    case when p_action='rename' then jsonb_build_object('name',jsonb_build_object('before',old_row->>'name','after',cleaned)) else '{}'::jsonb end,
    jsonb_build_object('catalog_action',p_action,'name',coalesce(cleaned,old_row->>'name')));
  return coalesce(result,p_id);
end $$;

create function prime_private.guard_catalog_revision() returns trigger language plpgsql set search_path='' as $$
begin
  if new.name is distinct from old.name or (to_jsonb(new)->>'short_name') is distinct from (to_jsonb(old)->>'short_name') then
    raise exception 'Adı məlumat kataloqları vasitəsilə dəyişdirin';
  end if;
  return new;
end $$;
create trigger aa_catalog_revision before update on public.work_catalog for each row execute function prime_private.guard_catalog_revision();
create trigger aa_catalog_revision before update on public.part_catalog for each row execute function prime_private.guard_catalog_revision();
create trigger aa_catalog_revision before update on public.unit_catalog for each row execute function prime_private.guard_catalog_revision();

create or replace function public.manage_unit(p_id uuid,p_name text,p_short_name text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  target:=public.manage_catalog('unit',p_id,'rename',p_name,p_short_name);
  perform public.manage_catalog('unit',target,case when p_active then 'restore' else 'archive' end);
end $$;

-- Inline creation must not silently restore an archived historical revision.
alter function public.create_catalog_entry(text,text) rename to create_catalog_entry_0009;
revoke all on function public.create_catalog_entry_0009(text,text) from public,anon,authenticated;
create function public.create_catalog_entry(p_kind text,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]); t text; active_value boolean;
begin
  t:=case p_kind when 'work' then 'work_catalog' when 'part' then 'part_catalog' when 'role' then 'worker_roles' end;
  if t is null then raise exception 'Kataloq növü düzgün deyil'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text||t||'catalog-management',0));
  execute format('select active from public.%I where organization_id=$1 and public.catalog_key(name)=public.catalog_key($2) for update',t)
    into active_value using org,p_name;
  if active_value=false then raise exception 'Bu qeyd arxivdədir. Bərpa üçün administratora müraciət edin.'; end if;
  return public.create_catalog_entry_0009(p_kind,p_name);
end $$;

revoke all on function prime_private.guard_catalog_revision(),public.manage_catalog(text,uuid,text,text,text,text),public.create_catalog_entry(text,text) from public,anon,authenticated;
grant execute on function public.manage_catalog(text,uuid,text,text,text,text),public.create_catalog_entry(text,text) to authenticated;
revoke all on function public.set_vehicle_financial_state(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.set_vehicle_financial_state(uuid,boolean,text) to authenticated;
revoke all on function prime_private.business_diff(jsonb,jsonb),prime_private.audit_business_change(),public.save_workshop_purchase(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_workshop_purchase(jsonb,uuid) to authenticated;

-- Percentage compensation: policy is private; each assignment retains its own agreement.
create table public.worker_compensation_policies (
  worker_id uuid primary key references public.master_identities(id),
  organization_id uuid not null references public.organizations(id),
  eligible boolean not null default false,
  worker_percentage numeric(5,2) not null check(worker_percentage>0 and worker_percentage<100),
  updated_at timestamptz not null default now()
);
alter table public.worker_compensation_policies enable row level security;
revoke all on public.worker_compensation_policies from public,anon,authenticated;
grant select on public.worker_compensation_policies to authenticated;
create policy policy_admin_read on public.worker_compensation_policies for select to authenticated
  using(organization_id=prime_private.organization_id() and prime_private.has_role(array['ADMIN']::public.app_role[]));

alter table public.job_work_items
  add column compensation_mode text not null default 'FIXED' check(compensation_mode in ('FIXED','PERCENTAGE')),
  add column worker_percentage_snapshot numeric(5,2),
  add column earning_basis_snapshot numeric(12,2),
  add column earning_snapshot numeric(12,2),
  add column earning_finalized_at timestamptz,
  add constraint percentage_agreement check(compensation_mode<>'PERCENTAGE' or (worker_percentage_snapshot>0 and worker_percentage_snapshot<100));

create function public.save_worker_compensation_policy(p_worker uuid,p_eligible boolean,p_percentage numeric)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); prior jsonb;
begin
  if p_eligible is null or p_percentage is null or p_percentage<=0 or p_percentage>=100 or p_percentage<>round(p_percentage,2) then raise exception 'Usta payı 0-dan böyük, 100-dən kiçik olmalıdır'; end if;
  perform 1 from public.workers where id=p_worker and organization_id=org for update;
  if not found then raise exception 'İşçi tapılmadı'; end if;
  select to_jsonb(p) into prior from public.worker_compensation_policies p where worker_id=p_worker;
  insert into public.worker_compensation_policies(worker_id,organization_id,eligible,worker_percentage)
    values(p_worker,org,p_eligible,p_percentage)
    on conflict(worker_id) do update set eligible=excluded.eligible,worker_percentage=excluded.worker_percentage,updated_at=now();
  perform prime_private.write_audit(org,auth.uid(),'WORKER_COMPENSATION_POLICY_UPDATED','workers',p_worker,null,null,'Ustanın faiz qaydası yeniləndi',
    jsonb_build_object('eligible',jsonb_build_object('before',prior->'eligible','after',p_eligible),'worker_percentage',jsonb_build_object('before',prior->'worker_percentage','after',p_percentage)));
end $$;

create function prime_private.calculate_worker_compensation() returns trigger
language plpgsql security definer set search_path='' as $$
declare percentage numeric;
begin
  if tg_op='UPDATE' and old.earning_finalized_at is not null then
    if new.compensation_mode<>old.compensation_mode or new.assigned_worker_id is distinct from old.assigned_worker_id or new.status<>'DONE' then
      raise exception 'Faizli qazanc sabitlənib. Usta, rejim və tamamlanmış status dəyişdirilə bilməz';
    end if;
    if new.labor_cost is distinct from old.labor_cost then raise exception 'Sabitlənmiş faizli qazanc dəyişdirilə bilməz'; end if;
    new.worker_percentage_snapshot:=old.worker_percentage_snapshot;
    new.earning_basis_snapshot:=old.earning_basis_snapshot;
    new.earning_snapshot:=old.earning_snapshot;
    new.earning_finalized_at:=old.earning_finalized_at;
    new.labor_cost:=old.earning_snapshot; new.labor_cost_known:=true;
    return new;
  end if;
  new.earning_basis_snapshot:=null; new.earning_snapshot:=null; new.earning_finalized_at:=null;
  if new.compensation_mode='PERCENTAGE' then
    if tg_op='INSERT' or old.compensation_mode<>'PERCENTAGE' or new.assigned_worker_id is distinct from old.assigned_worker_id then
      select p.worker_percentage into percentage from public.worker_compensation_policies p
        join public.workers w on w.id=p.worker_id and w.organization_id=new.organization_id and w.active
        where p.worker_id=new.assigned_worker_id and p.organization_id=new.organization_id and p.eligible for share of p;
      if percentage is null then raise exception 'Faizlə işləməyə uyğun aktiv usta seçin'; end if;
      new.worker_percentage_snapshot:=percentage;
    else new.worker_percentage_snapshot:=old.worker_percentage_snapshot;
    end if;
    if new.customer_unit_price is null then raise exception 'Faizli hesab üçün müştəri qiyməti tələb olunur'; end if;
    new.labor_cost:=round(round(new.quantity*new.customer_unit_price,2)*new.worker_percentage_snapshot/100,2);
    new.labor_cost_known:=true;
    if new.status='DONE' then
      new.earning_basis_snapshot:=round(new.quantity*new.customer_unit_price,2);
      new.earning_snapshot:=new.labor_cost;
      new.earning_finalized_at:=now();
    end if;
  else
    new.worker_percentage_snapshot:=null;
    if tg_op='UPDATE' and old.compensation_mode='PERCENTAGE' then new.labor_cost:=0; new.labor_cost_known:=false; end if;
  end if;
  return new;
end $$;
create trigger az_worker_compensation before insert or update on public.job_work_items for each row execute function prime_private.calculate_worker_compensation();

create function prime_private.audit_worker_compensation() returns trigger language plpgsql security definer set search_path='' as $$
declare delta jsonb;
begin
  select coalesce(jsonb_object_agg(k,jsonb_build_object('before',to_jsonb(old)->k,'after',to_jsonb(new)->k)),'{}'::jsonb)
    into delta from unnest(array['compensation_mode','worker_percentage_snapshot','earning_basis_snapshot','earning_snapshot','earning_finalized_at']) k
    where to_jsonb(old)->k is distinct from to_jsonb(new)->k;
  if delta<>'{}' then
    perform prime_private.write_audit(new.organization_id,auth.uid(),'WORK_COMPENSATION_UPDATED','job_work_items',new.id,new.service_job_id,null,'İşin usta hesablaması yeniləndi',delta);
  end if;
  return new;
end $$;
create trigger z_compensation_audit after insert or update on public.job_work_items for each row execute function prime_private.audit_worker_compensation();

-- Operational callers pass a boolean, never a percentage or a price.
alter function public.update_work_assignment(uuid,uuid,text,text) rename to update_work_assignment_0009;
revoke all on function public.update_work_assignment_0009(uuid,uuid,text,text) from public,anon,authenticated;
create function public.update_work_assignment(p_id uuid,p_worker uuid,p_status text,p_notes text,p_percentage boolean default null)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]); item public.job_work_items; job public.service_jobs;
begin
  if p_status is null or p_status not in ('TODO','IN_PROGRESS','DONE','CANCELLED') then raise exception 'Status yanlışdır'; end if;
  if length(coalesce(p_notes,''))>250 then raise exception 'Qeyd ən çox 250 simvol ola bilər'; end if;
  select j.* into job from public.service_jobs j join public.job_work_items w on w.service_job_id=j.id where w.id=p_id and w.organization_id=org and j.organization_id=org for update of j;
  if not found then raise exception 'İş tapılmadı'; end if;
  if job.deleted_at is not null or job.archived_at is not null then raise exception 'Servis kartı aktiv deyil'; end if;
  if job.financially_closed_at is not null then raise exception 'Əvvəlcə avtomobil maliyyəsini yenidən açın'; end if;
  select * into strict item from public.job_work_items where id=p_id and organization_id=org for update;
  update public.job_work_items set assigned_worker_id=p_worker,status=p_status::public.work_item_status,notes=nullif(btrim(p_notes),''),
    compensation_mode=case when p_percentage is null then item.compensation_mode when p_percentage then 'PERCENTAGE' else 'FIXED' end,
    started_at=coalesce(item.started_at,case when p_status in ('IN_PROGRESS','DONE') then now() end),
    completed_at=case when p_status='DONE' then coalesce(item.completed_at,now()) else null end
    where id=p_id and organization_id=org;
end $$;

create function public.set_work_compensation(p_id uuid,p_worker uuid,p_percentage boolean,p_cost numeric default null)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); item public.job_work_items;
begin
  perform 1 from public.service_jobs j join public.job_work_items w on w.service_job_id=j.id where w.id=p_id and w.organization_id=org and j.organization_id=org for update of j;
  select * into item from public.job_work_items where id=p_id and organization_id=org for update;
  if not found then raise exception 'İş tapılmadı'; end if;
  perform public.update_work_assignment(p_id,p_worker,item.status::text,item.notes,p_percentage);
  if not p_percentage then perform public.set_worker_cost(p_id,p_cost); end if;
end $$;

alter function public.create_additional_work(jsonb,uuid) rename to create_additional_work_0009;
revoke all on function public.create_additional_work_0009(jsonb,uuid) from public,anon,authenticated;
create function public.create_additional_work(p_data jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); result uuid;
begin
  select id into result from public.job_work_items where id=p_key and organization_id=org and is_additional;
  if found then return result; end if;
  result:=public.create_additional_work_0009(p_data||case when p_data->>'percentage'='true' then jsonb_build_object('labor_cost',0) else '{}'::jsonb end,p_key);
  if p_data->>'percentage'='true' then perform public.set_work_compensation(result,(p_data->>'worker_id')::uuid,true); end if;
  return result;
end $$;

alter function public.work_queue_data(text) rename to work_queue_data_0009;
revoke all on function public.work_queue_data_0009(text) from public,anon,authenticated;
create function public.work_queue_data(p_kind text) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
begin
  if p_kind='workers' then
    return query select r||jsonb_build_object('percentage_eligible',coalesce(p.eligible,false)) from public.work_queue_data_0009(p_kind) r
      left join public.worker_compensation_policies p on p.worker_id=(r->>'id')::uuid and p.organization_id=org;
  elsif p_kind='work' then
    return query select r||jsonb_build_object('compensation_mode',w.compensation_mode) from public.work_queue_data_0009(p_kind) r
      join public.job_work_items w on w.id=(r->>'id')::uuid and w.organization_id=org;
  else return query select * from public.work_queue_data_0009(p_kind);
  end if;
end $$;

alter function public.finance_data(text,uuid) rename to finance_data_0009;
revoke all on function public.finance_data_0009(text,uuid) from public,anon,authenticated;
create function public.finance_data(p_kind text,p_job uuid default null) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
begin
  if p_kind='work' then
    return query select r||jsonb_build_object('compensation_mode',w.compensation_mode) from public.finance_data_0009(p_kind,p_job) r
      join public.job_work_items w on w.id=(r->>'id')::uuid and w.organization_id=org;
  else return query select * from public.finance_data_0009(p_kind,p_job);
  end if;
end $$;

revoke all on function prime_private.calculate_worker_compensation(),prime_private.audit_worker_compensation(),
  public.save_worker_compensation_policy(uuid,boolean,numeric),public.update_work_assignment(uuid,uuid,text,text,boolean),
  public.set_work_compensation(uuid,uuid,boolean,numeric),public.create_additional_work(jsonb,uuid),public.work_queue_data(text),public.finance_data(text,uuid) from public,anon,authenticated;
grant execute on function public.save_worker_compensation_policy(uuid,boolean,numeric),public.update_work_assignment(uuid,uuid,text,text,boolean),
  public.set_work_compensation(uuid,uuid,boolean,numeric),public.create_additional_work(jsonb,uuid),public.work_queue_data(text),public.finance_data(text,uuid) to authenticated;

-- General advances are real payments. Allocations only apply that existing money.
create table public.worker_advances (
  transaction_id uuid primary key references public.cash_transactions(id),
  organization_id uuid not null references public.organizations(id),
  worker_id uuid not null references public.master_identities(id),
  created_at timestamptz not null default now()
);
create table public.worker_advance_allocations (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  advance_id uuid not null references public.worker_advances(transaction_id),
  work_item_id uuid not null references public.job_work_items(id),
  amount numeric(12,2) not null check(amount>0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index advance_allocations_work on public.worker_advance_allocations(work_item_id);
create index advance_allocations_payment on public.worker_advance_allocations(advance_id);
alter table public.worker_advances enable row level security;
alter table public.worker_advance_allocations enable row level security;
revoke all on public.worker_advances,public.worker_advance_allocations from public,anon,authenticated;
grant select on public.worker_advances,public.worker_advance_allocations to authenticated;
create policy advance_finance_read on public.worker_advances for select to authenticated
  using(organization_id=prime_private.organization_id() and prime_private.has_role(array['ADMIN','CASHIER']::public.app_role[]));
create policy allocation_finance_read on public.worker_advance_allocations for select to authenticated
  using(organization_id=prime_private.organization_id() and prime_private.has_role(array['ADMIN','CASHIER']::public.app_role[]));

create function prime_private.worker_applied_advance(p_work uuid) returns numeric language sql stable set search_path='' as $$
  select coalesce(sum(a.amount),0) from public.worker_advance_allocations a join public.cash_transactions t on t.id=a.advance_id and t.voided_at is null where a.work_item_id=p_work
$$;
create function prime_private.worker_paid(p_work uuid) returns numeric language sql stable set search_path='' as $$
  select coalesce(sum(amount),0)+prime_private.worker_applied_advance(p_work) from public.cash_transactions where work_item_id=p_work and allocation_type='WORKER_WORK_ITEM' and voided_at is null
$$;

create function public.record_worker_advance(p_worker uuid,p_data jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]); result uuid; cat uuid; worker_name text; w public.job_work_items;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  select t.id into result from public.cash_transactions t left join public.worker_advances a on a.transaction_id=t.id
    where t.organization_id=org and t.idempotency_key=p_key and (t.worker_identity_id=p_worker or a.worker_id=p_worker);
  if found then return result; end if;
  select concat_ws(' ',first_name,last_name) into worker_name from public.workers where id=p_worker and organization_id=org and active for share;
  if not found then raise exception 'Aktiv usta seçin'; end if;
  select id into cat from public.transaction_categories where organization_id=org and name='Usta avansı' and direction='OUT' and is_system;
  if cat is null then
    insert into public.transaction_categories(organization_id,name,direction,is_system) values(org,'Usta avansı','OUT',true)
      on conflict(organization_id,name,direction) do update set is_system=true,active=true returning id into cat;
  end if;
  if nullif(p_data->>'target_id','') is not null then
    select * into w from public.job_work_items where id=(p_data->>'target_id')::uuid and organization_id=org and assigned_worker_id=p_worker;
    if not found then raise exception 'Bu iş seçilmiş ustaya aid deyil'; end if;
    if nullif(p_data->>'service_job_id','') is not null and (p_data->>'service_job_id')::uuid<>w.service_job_id then raise exception 'İş bu avtomobilə aid deyil'; end if;
    p_data:=p_data||jsonb_build_object('allocation_type','WORKER_WORK_ITEM','service_job_id',w.service_job_id);
  else
    p_data:=p_data||jsonb_build_object('allocation_type','GENERAL_OUT');
  end if;
  result:=public.record_financial_transaction(p_data||jsonb_build_object('category_id',cat,'counterparty_name',worker_name,
    'purpose',coalesce(nullif(p_data->>'purpose',''),'Usta avansı'),'counterparty_details',coalesce(p_data->'counterparty_details','{}')||jsonb_build_object('payment_kind','WORKER_ADVANCE','worker_id',p_worker)),p_key);
  if w.id is not null then perform prime_private.write_audit(org,auth.uid(),'WORKER_ADVANCE_CREATED','cash_transactions',result,w.service_job_id,null,'Usta avansı verildi','{}',
    jsonb_build_object('worker_id',p_worker,'amount',(p_data->>'amount')::numeric,'work_item_id',w.id)); end if;
  return result;
end $$;

create function public.allocate_worker_advance(p_advance uuid,p_work uuid,p_amount numeric,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]); a public.worker_advances; t public.cash_transactions; w public.job_work_items; j public.service_jobs; prior public.worker_advance_allocations; available numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  if p_key is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount>9999999999.99 then raise exception 'Bölüşdürülən məbləğ düzgün deyil'; end if;
  select * into prior from public.worker_advance_allocations where id=p_key and organization_id=org;
  if found then
    if prior.advance_id<>p_advance or prior.work_item_id<>p_work or prior.amount<>p_amount then raise exception 'Təkrar əməliyyat məlumatları uyğun deyil'; end if;
    return prior.id;
  end if;
  select * into a from public.worker_advances where transaction_id=p_advance and organization_id=org for update;
  if not found then raise exception 'Usta avansı tapılmadı'; end if;
  select * into t from public.cash_transactions where id=a.transaction_id and organization_id=org and voided_at is null for update;
  if not found then raise exception 'Avans ləğv edilib'; end if;
  select x.* into j from public.service_jobs x join public.job_work_items y on y.service_job_id=x.id where y.id=p_work and x.organization_id=org and y.organization_id=org for update of x;
  if not found or j.financially_closed_at is not null or j.archived_at is not null or j.deleted_at is not null then raise exception 'Maliyyəsi açıq aktiv servis kartı tələb olunur'; end if;
  select * into w from public.job_work_items where id=p_work and organization_id=org for update;
  if w.assigned_worker_id is distinct from a.worker_id or w.status<>'DONE' or not w.labor_cost_known then raise exception 'Bu usta üçün tamamlanmış və qazancı məlum iş seçin'; end if;
  select t.amount-coalesce(sum(amount),0) into available from public.worker_advance_allocations where advance_id=p_advance;
  if p_amount>available then raise exception 'Məbləğ ümumi avans qalığından artıqdır'; end if;
  if p_amount+prime_private.worker_paid(p_work)>w.labor_cost then raise exception 'Məbləğ usta borcundan artıqdır'; end if;
  insert into public.worker_advance_allocations(id,organization_id,advance_id,work_item_id,amount,created_by) values(p_key,org,p_advance,p_work,p_amount,auth.uid());
  perform prime_private.write_audit(org,auth.uid(),'WORKER_ADVANCE_ALLOCATED','job_work_items',w.id,j.id,j.vehicle_id,'Ümumi avans işə tətbiq edildi','{}',jsonb_build_object('amount',p_amount,'worker_id',a.worker_id,'work_item_id',w.id,'advance_id',p_advance));
  return p_key;
end $$;

create function prime_private.guard_advance_payments() returns trigger language plpgsql security definer set search_path='' as $$
declare cost numeric;
begin
  if tg_op='UPDATE' then
    if old.voided_at is null and new.voided_at is not null and exists(select 1 from public.worker_advance_allocations where advance_id=old.id) then
      raise exception 'İşə tətbiq edilmiş avans ləğv edilə bilməz';
    end if;
  elsif new.allocation_type='GENERAL_OUT' and exists(select 1 from public.transaction_categories where id=new.category_id and organization_id=new.organization_id and name='Usta avansı') then
    select id,concat_ws(' ',first_name,last_name) into new.worker_identity_id,new.counterparty_name_snapshot from public.workers
      where id=nullif(new.counterparty_details->>'worker_id','')::uuid and organization_id=new.organization_id and active;
    if not found then raise exception 'Usta avansı üçün aktiv usta seçin'; end if;
  elsif new.allocation_type='WORKER_WORK_ITEM' then
    select labor_cost into cost from public.job_work_items where id=new.work_item_id and organization_id=new.organization_id;
    if new.amount+prime_private.worker_paid(new.work_item_id)>cost then raise exception 'Ödəniş avans tətbiqindən sonra qalan borcdan artıqdır'; end if;
  end if;
  return new;
end $$;
create trigger c_advance_payment_guard before insert or update on public.cash_transactions for each row execute function prime_private.guard_advance_payments();
create function prime_private.register_general_advance() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.allocation_type='GENERAL_OUT' and exists(select 1 from public.transaction_categories where id=new.category_id and organization_id=new.organization_id and name='Usta avansı') then
    insert into public.worker_advances(transaction_id,organization_id,worker_id) values(new.id,new.organization_id,new.worker_identity_id);
    perform prime_private.write_audit(new.organization_id,auth.uid(),'WORKER_ADVANCE_CREATED','cash_transactions',new.id,new.service_job_id,null,'Ümumi usta avansı verildi','{}',jsonb_build_object('worker_id',new.worker_identity_id,'amount',new.amount));
  end if;
  return new;
end $$;
create trigger d_register_general_advance after insert on public.cash_transactions for each row execute function prime_private.register_general_advance();
revoke all on function prime_private.register_general_advance() from public,anon,authenticated;
create function prime_private.guard_advance_work() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.worker_advance_allocations where work_item_id=old.id) and
    (new.assigned_worker_id is distinct from old.assigned_worker_id or new.status<>'DONE' or not new.labor_cost_known) then raise exception 'Avans tətbiq edilmiş işin ustası və tamamlanmış statusu qorunmalıdır'; end if;
  return new;
end $$;
create trigger b_advance_work_guard before update on public.job_work_items for each row execute function prime_private.guard_advance_work();

revoke all on function prime_private.worker_applied_advance(uuid),prime_private.worker_paid(uuid),prime_private.guard_advance_payments(),prime_private.guard_advance_work(),
  public.record_worker_advance(uuid,jsonb,uuid),public.allocate_worker_advance(uuid,uuid,numeric,uuid) from public,anon,authenticated;
grant execute on function public.record_worker_advance(uuid,jsonb,uuid),public.allocate_worker_advance(uuid,uuid,numeric,uuid) to authenticated;

create function public.record_worker_payment(p_worker uuid,p_data jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]); w public.job_work_items;
begin
  if nullif(p_data->>'target_id','') is null then return public.record_worker_advance(p_worker,p_data,p_key); end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  select * into w from public.job_work_items where id=(p_data->>'target_id')::uuid and organization_id=org and assigned_worker_id=p_worker and status='DONE';
  if not found then raise exception 'Bu usta üçün tamamlanmış iş seçin'; end if;
  if nullif(p_data->>'service_job_id','') is not null and (p_data->>'service_job_id')::uuid<>w.service_job_id then raise exception 'İş bu avtomobilə aid deyil'; end if;
  return public.record_financial_transaction(p_data||jsonb_build_object('allocation_type','WORKER_WORK_ITEM','service_job_id',w.service_job_id),p_key);
end $$;
revoke all on function public.record_worker_payment(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.record_worker_payment(uuid,jsonb,uuid) to authenticated;

create or replace function public.finance_data(p_kind text,p_job uuid default null) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
begin
  if p_kind='work' then
    return query select r||jsonb_build_object('compensation_mode',w.compensation_mode,'applied_advance',prime_private.worker_applied_advance(w.id)) from public.finance_data_0009(p_kind,p_job) r
      join public.job_work_items w on w.id=(r->>'id')::uuid and w.organization_id=org;
  elsif p_kind='workers' then
    return query select jsonb_build_object('id',i.id,'name',concat_ws(' ',i.snapshot->>'first_name',i.snapshot->>'last_name'),'active',i.deleted_at is null and coalesce((i.snapshot->>'active')::boolean,false))
      from public.master_identities i where i.organization_id=org and i.kind='worker' order by i.id;
  elsif p_kind='advances' then
    return query select jsonb_build_object('id',a.transaction_id,'worker_id',a.worker_id,'worker',t.counterparty_name_snapshot,'amount',t.amount,
      'remaining',case when t.voided_at is not null then 0 else t.amount-coalesce((select sum(amount) from public.worker_advance_allocations where advance_id=a.transaction_id),0) end,
      'occurred_at',t.occurred_at,'voided_at',t.voided_at,'channel',t.channel,'reference_number',t.reference_number)
      from public.worker_advances a join public.cash_transactions t on t.id=a.transaction_id where a.organization_id=org order by a.transaction_id;
  elsif p_kind='advance_allocations' then
    return query select to_jsonb(a)||jsonb_build_object('worker_id',v.worker_id,'service_job_id',w.service_job_id)
      from public.worker_advance_allocations a join public.worker_advances v on v.transaction_id=a.advance_id
      join public.job_work_items w on w.id=a.work_item_id
      where a.organization_id=org and (p_job is null or w.service_job_id=p_job) order by a.id;
  elsif p_kind='ledger' then
    return query select r||case when a.transaction_id is null then '{}'::jsonb else jsonb_build_object('worker_identity_id',a.worker_id) end
      from public.finance_data_0009(p_kind,p_job) r left join public.worker_advances a on a.transaction_id=(r->>'id')::uuid and a.organization_id=org;
  else return query select * from public.finance_data_0009(p_kind,p_job);
  end if;
end $$;

-- The same close transaction accounts for applied existing money as well as direct payments.
create or replace function public.set_vehicle_financial_state(p_job uuid,p_close boolean,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]); j public.service_jobs;
  completed_count integer:=0; paid numeric; due numeric; snapshot jsonb;
begin
  if p_close is null then raise exception 'Bağlanma əməliyyatı seçin'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  select * into j from public.service_jobs where id=p_job and organization_id=org and archived_at is null and deleted_at is null for update;
  if not found then raise exception 'Servis kartı tapılmadı'; end if;
  if not p_close then perform public.set_vehicle_financial_state_0009(p_job,false,p_reason); return; end if;
  if j.financially_closed_at is not null then return; end if;
  update public.job_work_items set status='DONE',started_at=coalesce(started_at,now()),completed_at=coalesce(completed_at,now())
    where service_job_id=j.id and organization_id=org and status in ('TODO','IN_PROGRESS');
  get diagnostics completed_count=row_count;
  if exists(select 1 from public.job_work_items where service_job_id=j.id and status<>'CANCELLED' and (not labor_cost_known or assigned_worker_id is null))
    or exists(select 1 from public.job_required_parts r where r.service_job_id=j.id and not exists(select 1 from public.purchases p where p.required_part_id=r.id and p.voided_at is null)) then raise exception 'Maya dəyəri daxil edilməyib'; end if;
  select coalesce(sum(amount),0) into paid from public.cash_transactions where service_job_id=j.id and allocation_type like 'CUSTOMER_%' and voided_at is null;
  due:=prime_private.vehicle_receivable(j.id)-paid;
  if due<>0 then raise exception 'Müştəri borcu bağlanmayıb'; end if;
  if exists(select 1 from public.purchases p where p.service_job_id=j.id and p.source_type='SUPPLIER' and p.voided_at is null and p.total_price>(select coalesce(sum(amount),0) from public.cash_transactions where purchase_id=p.id and voided_at is null))
    or exists(select 1 from public.job_work_items w where w.service_job_id=j.id and w.status<>'CANCELLED' and w.labor_cost>prime_private.worker_paid(w.id)) then raise exception 'Öhdəliklər tam ödənilməyib'; end if;
  if exists(select 1 from public.purchases p where p.service_job_id=j.id and p.source_type='SUPPLIER' and p.voided_at is null and p.total_price<(select coalesce(sum(amount),0) from public.cash_transactions where purchase_id=p.id and voided_at is null))
    or exists(select 1 from public.job_work_items w where w.service_job_id=j.id and w.labor_cost<prime_private.worker_paid(w.id)) then raise exception 'Artıq ödəniş var; əvvəlcə uzlaşdırın'; end if;
  select jsonb_build_object('part_cost',coalesce((select sum(total_price) from public.purchases where service_job_id=j.id and voided_at is null),0),
    'worker_cost',coalesce((select sum(labor_cost) from public.job_work_items where service_job_id=j.id and status<>'CANCELLED'),0),
    'other_expenses',coalesce(sum(amount) filter(where allocation_type='VEHICLE_EXPENSE'),0),
    'supplier_paid',coalesce(sum(amount) filter(where allocation_type='SUPPLIER_PURCHASE'),0),
    'worker_paid',coalesce(sum(amount) filter(where allocation_type='WORKER_WORK_ITEM'),0),
    'applied_advance',coalesce((select sum(prime_private.worker_applied_advance(w.id)) from public.job_work_items w where w.service_job_id=j.id),0),
    'other_expense_paid',coalesce(sum(amount) filter(where allocation_type='VEHICLE_EXPENSE'),0),
    'outgoing_paid',coalesce(sum(amount) filter(where direction='OUT'),0)) into snapshot from public.cash_transactions where service_job_id=j.id and voided_at is null;
  snapshot:=snapshot||jsonb_build_object('cost',(snapshot->>'part_cost')::numeric+(snapshot->>'worker_cost')::numeric+(snapshot->>'other_expenses')::numeric,'customer_received',paid,'customer_due',due,'completed_count',completed_count);
  update public.service_jobs set financially_closed_at=now(),financially_closed_by=auth.uid() where id=j.id;
  perform prime_private.write_audit(org,auth.uid(),'VEHICLE_FINANCE_CLOSED','service_jobs',j.id,j.id,j.vehicle_id,'Maliyyə bağlandı','{}',snapshot);
  perform prime_private.write_audit(org,auth.uid(),'VEHICLE_WORK_COMPLETED','service_jobs',j.id,j.id,j.vehicle_id,'Maliyyə bağlanarkən işlər tamamlandı','{}',jsonb_build_object('completed_count',completed_count));
end $$;
commit;
