begin;

create table public.unit_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check(length(name) between 1 and 120),
  short_name text not null default '' check(length(short_name)<=20),
  normalized_name text generated always as (lower(translate(regexp_replace(trim(name),'\s+',' ','g'),'İI','iı'))) stored,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,normalized_name)
);
alter table public.unit_catalog enable row level security;
revoke all on public.unit_catalog from public,anon,authenticated;
grant select on public.unit_catalog to authenticated;
grant all on public.unit_catalog to service_role;
create policy unit_read on public.unit_catalog for select to authenticated
  using(organization_id=prime_private.organization_id());

create function prime_private.seed_units(org uuid) returns void language sql security definer set search_path='' as $$
  insert into public.unit_catalog(organization_id,name,short_name)
  select org,name,short_name from (values ('Ədəd','əd'),('Dəst','dəst'),('Xidmət','xidmət'),('Saat','saat'),('Gün','gün'),
    ('Metr','m'),('Santimetr','sm'),('Kvadrat metr','m²'),('Litr','l'),('Millilitr','ml'),('Kiloqram','kq'),('Qram','q')) u(name,short_name)
  on conflict(organization_id,normalized_name) do nothing
$$;
select prime_private.seed_units(id) from public.organizations;
create function prime_private.seed_organization_units() returns trigger language plpgsql security definer set search_path='' as $$
begin perform prime_private.seed_units(new.id); return new; end $$;
create trigger seed_organization_units after insert on public.organizations for each row execute function prime_private.seed_organization_units();

create function public.create_unit(p_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]); u public.unit_catalog; cleaned text:=regexp_replace(trim(p_name),'\s+',' ','g');
begin
  if cleaned is null or length(cleaned) not between 1 and 120 then raise exception 'Ölçü vahidinin adı düzgün deyil'; end if;
  insert into public.unit_catalog(organization_id,name,created_by) values(org,cleaned,auth.uid())
    on conflict(organization_id,normalized_name) do nothing returning * into u;
  if not found then
    select * into u from public.unit_catalog where organization_id=org and normalized_name=lower(translate(cleaned,'İI','iı'));
    if not u.is_active then raise exception 'Ölçü vahidi deaktiv edilib. Administratorla əlaqə saxlayın.'; end if;
  else
    perform prime_private.write_audit(org,auth.uid(),'UNIT_CREATED','unit_catalog',u.id,null,null,'Ölçü vahidi yaradıldı','{}',jsonb_build_object('name',u.name));
  end if;
  return jsonb_build_object('id',u.id,'name',u.name);
end $$;
create function public.manage_unit(p_id uuid,p_name text,p_short_name text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]);
begin
  update public.unit_catalog set name=regexp_replace(trim(p_name),'\s+',' ','g'),short_name=trim(p_short_name),is_active=p_active,updated_at=now()
    where id=p_id and organization_id=org;
  if not found then raise exception 'Ölçü vahidi tapılmadı' using errcode='42501'; end if;
  perform prime_private.write_audit(org,auth.uid(),'UNIT_UPDATED','unit_catalog',p_id,null,null,'Ölçü vahidi yeniləndi','{}',jsonb_build_object('name',p_name,'active',p_active));
end $$;

alter table public.job_work_items add column quantity numeric not null default 1,
  add column unit_id uuid references public.unit_catalog(id), add column customer_unit_price numeric,
  add column cost_note text check(length(cost_note)<=250);
alter table public.job_required_parts add column quantity numeric not null default 1,
  add column unit_id uuid references public.unit_catalog(id), add column customer_unit_price numeric,
  add column cost_note text check(length(cost_note)<=250);

-- Transaction-local backfill preserves every legacy quote, payment and creator.
alter table public.job_work_items disable trigger user;
alter table public.job_required_parts disable trigger user;
update public.job_work_items w set customer_unit_price=quoted_price,unit_id=u.id
  from public.unit_catalog u where u.organization_id=w.organization_id and u.name='Xidmət';
update public.job_required_parts p set customer_unit_price=quoted_price,unit_id=u.id
  from public.unit_catalog u where u.organization_id=p.organization_id and u.name='Ədəd';
alter table public.job_work_items enable trigger user;
alter table public.job_required_parts enable trigger user;
alter table public.job_work_items alter column unit_id set not null,
  add constraint work_quantity_decimal check(quantity>0 and quantity<=100000 and quantity=round(quantity,3)),
  add constraint work_unit_price_decimal check(customer_unit_price>=0 and customer_unit_price<=9999999999.99 and customer_unit_price=round(customer_unit_price,2));
alter table public.job_required_parts alter column unit_id set not null, alter column customer_unit_price set not null,
  add constraint part_quantity_decimal check(quantity>0 and quantity<=100000 and quantity=round(quantity,3)),
  add constraint part_unit_price_decimal check(customer_unit_price>=0 and customer_unit_price<=9999999999.99 and customer_unit_price=round(customer_unit_price,2));
create index work_unit_idx on public.job_work_items(unit_id);
create index part_unit_idx on public.job_required_parts(unit_id);

create function prime_private.quote_units() returns trigger language plpgsql security definer set search_path='' as $$
declare u public.unit_catalog;
begin
  if new.unit_id is null then
    select id into new.unit_id from public.unit_catalog where organization_id=new.organization_id and is_active
      order by (name=case when tg_table_name='job_work_items' then 'Xidmət' else 'Ədəd' end) desc,created_at,id limit 1;
  end if;
  select * into u from public.unit_catalog where id=new.unit_id and organization_id=new.organization_id;
  if not found then raise exception 'Ölçü vahidi tapılmadı' using errcode='42501'; end if;
  if not u.is_active and (tg_op='INSERT' or new.unit_id is distinct from old.unit_id) then raise exception 'Ölçü vahidi deaktiv edilib'; end if;
  if tg_op='INSERT' and new.customer_unit_price is null then new.customer_unit_price:=new.quoted_price; end if;
  if tg_op='UPDATE' and new.quoted_price is distinct from old.quoted_price and new.customer_unit_price is not distinct from old.customer_unit_price and new.quantity=old.quantity then
    if new.quantity<>1 then raise exception 'Vahid qiyməti dəyişdirilməlidir'; end if;
    new.customer_unit_price:=new.quoted_price;
  end if;
  new.quoted_price:=round(new.quantity*new.customer_unit_price,2);
  if new.quoted_price>9999999999.99 then raise exception 'Sətrin məbləği çox böyükdür'; end if;
  return new;
end $$;
create trigger aa_quote_units before insert or update on public.job_work_items for each row execute function prime_private.quote_units();
create trigger aa_quote_units before insert or update on public.job_required_parts for each row execute function prime_private.quote_units();

-- Keep the 0004 creator/tenant/idempotency checks. Old entry points become private.
alter function public.create_workshop_job(jsonb,jsonb,jsonb,jsonb,uuid) set schema prime_private;
revoke all on function prime_private.create_workshop_job(jsonb,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
create function public.create_workshop_job(p_vehicle jsonb,p_job jsonb,p_works jsonb,p_parts jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]); jid uuid; line jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  if exists(select 1 from public.service_jobs where id=p_key and organization_id=org) then return p_key; end if;
  if jsonb_array_length(p_works)>100 or jsonb_array_length(p_parts)>100 then raise exception 'Ən çox 100 sətir daxil edin'; end if;
  jid:=prime_private.create_workshop_job(p_vehicle,p_job,p_works,p_parts,p_key);
  for line in select * from jsonb_array_elements(p_works) loop
    update public.job_work_items set quantity=coalesce((line->>'quantity')::numeric,1),customer_unit_price=(line->>'quotedPrice')::numeric,
      unit_id=coalesce((line->>'unitId')::uuid,unit_id),cost_note=nullif(trim(line->>'costNote'),'') where service_job_id=jid and work_catalog_id=(line->>'catalogId')::uuid;
  end loop;
  for line in select * from jsonb_array_elements(p_parts) loop
    update public.job_required_parts set quantity=coalesce((line->>'quantity')::numeric,1),customer_unit_price=(line->>'quotedPrice')::numeric,
      unit_id=coalesce((line->>'unitId')::uuid,unit_id),cost_note=nullif(trim(line->>'costNote'),'') where service_job_id=jid and part_catalog_id=(line->>'catalogId')::uuid;
  end loop;
  return jid;
end $$;

drop function public.save_quote_line(uuid,text,uuid,numeric,text);
create function public.save_quote_line(p_job uuid,p_kind text,p_catalog uuid,p_price numeric,p_note text,p_quantity numeric default 1,p_unit uuid default null,p_cost_note text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]); target uuid;
begin
  perform 1 from service_jobs where id=p_job and organization_id=org and archived_at is null and has_line_quotes for update;
  if not found then raise exception 'Servis kartı tapılmadı' using errcode='42501'; end if;
  if p_price is null or p_price<0 or p_price>9999999999.99 or p_price<>round(p_price,2) then raise exception 'Qiymət düzgün deyil'; end if;
  if p_kind='work' then
    select id into target from job_work_items where service_job_id=p_job and work_catalog_id=p_catalog;
    if target is null then
      insert into job_work_items(owner_user_id,service_job_id,work_catalog_id,quoted_price,customer_unit_price,quantity,unit_id,notes,cost_note)
      values(auth.uid(),p_job,p_catalog,round(p_price*p_quantity,2),p_price,p_quantity,p_unit,p_note,p_cost_note);
    else
      update job_work_items set customer_unit_price=p_price,quantity=p_quantity,unit_id=coalesce(p_unit,unit_id),notes=p_note,cost_note=p_cost_note where id=target;
    end if;
  elsif p_kind='part' then
    select id into target from job_required_parts where service_job_id=p_job and part_catalog_id=p_catalog;
    if target is null then
      insert into job_required_parts(owner_user_id,service_job_id,part_catalog_id,customer_unit_price,quantity,unit_id,notes,cost_note)
        values(auth.uid(),p_job,p_catalog,p_price,p_quantity,p_unit,p_note,p_cost_note);
    else
      update job_required_parts set customer_unit_price=p_price,quantity=p_quantity,unit_id=coalesce(p_unit,unit_id),notes=p_note,cost_note=p_cost_note where id=target;
    end if;
  else raise exception 'Unsupported quote type'; end if;
end $$;

create or replace function public.intake_work_items(p_job uuid default null) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
begin
  return query select jsonb_build_object('id',w.id,'service_job_id',w.service_job_id,'work_catalog_id',w.work_catalog_id,
    'custom_title',w.custom_title,'status',w.status,'quoted_price',w.quoted_price,'notes',w.notes,'display_order',w.display_order,
    'quantity',w.quantity,'unit_id',w.unit_id,'customer_unit_price',w.customer_unit_price,'cost_note',w.cost_note,
    'unit_catalog',jsonb_build_object('id',u.id,'name',u.name,'short_name',u.short_name),
    'planned_at',w.planned_at,'started_at',w.started_at,'completed_at',w.completed_at,
    'work_catalog',jsonb_build_object('id',c.id,'name',c.name,'category',c.category))
  from public.job_work_items w left join public.work_catalog c on c.id=w.work_catalog_id left join public.unit_catalog u on u.id=w.unit_id
  where w.organization_id=org and (p_job is null or w.service_job_id=p_job) order by w.id;
end $$;

alter table public.service_jobs add column deleted_at timestamptz;
alter table public.service_jobs add constraint soft_delete_archived check(deleted_at is null or archived_at is not null);
create index jobs_deleted_org on public.service_jobs(organization_id,deleted_at);
create function public.soft_delete_service_job(p_job uuid) returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]);
begin
  update public.service_jobs set deleted_at=now(),archived_at=coalesce(archived_at,now()) where id=p_job and organization_id=org and deleted_at is null;
  if not found then raise exception 'Servis kartı tapılmadı' using errcode='42501'; end if;
end $$;

create function prime_private.audit_intake_extensions() returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new); o jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}' end;
  delta jsonb:='{}'; field text; event text;
begin
  if tg_table_name='service_jobs' then
    if new.deleted_at is not distinct from old.deleted_at then return new; end if;
    event:=case when new.deleted_at is null then 'SERVICE_JOB_SOFT_RESTORED' else 'SERVICE_JOB_SOFT_DELETED' end;
    delta:=jsonb_build_object('deleted_at',jsonb_build_object('before',old.deleted_at,'after',new.deleted_at));
  else
    foreach field in array array['quantity','unit_id','customer_unit_price'] loop
      if n->field is distinct from o->field then delta:=delta||jsonb_build_object(field,jsonb_build_object('before',o->field,'after',n->field)); end if;
    end loop;
    if n->'cost_note' is distinct from o->'cost_note' then delta:=delta||jsonb_build_object('cost_note',jsonb_build_object('changed',true)); end if;
    if delta='{}' then return new; end if;
    event:=case when tg_table_name='job_work_items' then 'WORK_QUOTE_UPDATED' else 'PART_QUOTE_UPDATED' end;
  end if;
  perform prime_private.write_audit(new.organization_id,auth.uid(),event,tg_table_name,new.id,
    case when tg_table_name='service_jobs' then new.id else (n->>'service_job_id')::uuid end,null,'Qeydiyyat məlumatları yeniləndi',delta);
  return new;
end $$;
create trigger z_intake_audit after update on public.service_jobs for each row execute function prime_private.audit_intake_extensions();
create trigger z_intake_audit after insert or update on public.job_work_items for each row execute function prime_private.audit_intake_extensions();
create trigger z_intake_audit after insert or update on public.job_required_parts for each row execute function prime_private.audit_intake_extensions();

-- Reject malformed money before writing; existing unconstrained NUMERIC data is untouched.
create function prime_private.validate_intake_money() returns trigger language plpgsql set search_path='' as $$
declare n jsonb:=to_jsonb(new); o jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}' end; field text; amount numeric;
begin
  foreach field in array array['insurance_approved_amount','agreed_budget','labor_cost','unit_price','paid_amount'] loop
    if n ? field and n->field is distinct from o->field and n->>field is not null then
      amount:=(n->>field)::numeric;
      if amount<0 or amount>9999999999.99 or amount<>round(amount,2) then raise exception 'Məbləğ ən çox iki onluq rəqəm ola bilər'; end if;
    end if;
  end loop;
  return new;
end $$;
create trigger aa_money_precision before insert or update on public.service_jobs for each row execute function prime_private.validate_intake_money();
create trigger aa_money_precision before insert or update on public.job_work_items for each row execute function prime_private.validate_intake_money();
create trigger aa_money_precision before insert or update on public.purchases for each row execute function prime_private.validate_intake_money();

revoke all on all functions in schema prime_private from public,anon,authenticated;
grant execute on function prime_private.organization_id(),prime_private.has_role(public.app_role[]) to authenticated;
revoke all on function public.create_unit(text),public.manage_unit(uuid,text,text,boolean),public.create_workshop_job(jsonb,jsonb,jsonb,jsonb,uuid),
  public.save_quote_line(uuid,text,uuid,numeric,text,numeric,uuid,text),public.soft_delete_service_job(uuid) from public,anon,authenticated;
grant execute on function public.create_unit(text),public.manage_unit(uuid,text,text,boolean),public.create_workshop_job(jsonb,jsonb,jsonb,jsonb,uuid),
  public.save_quote_line(uuid,text,uuid,numeric,text,numeric,uuid,text),public.soft_delete_service_job(uuid) to authenticated;

commit;
