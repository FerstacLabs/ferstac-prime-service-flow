begin;

alter table public.job_work_items add column is_additional boolean not null default false;
alter table public.job_required_parts add column is_additional boolean not null default false;

-- Retain existing cost/payment guards, but remove the old CASHIER cost capability.
alter function public.set_worker_cost(uuid,numeric) set schema prime_private;
revoke all on function prime_private.set_worker_cost(uuid,numeric) from public,anon,authenticated;
create function public.set_worker_cost(p_id uuid,p_cost numeric) returns void language plpgsql security definer set search_path='' as $$
begin
  perform prime_private.require_role(array['ADMIN']::public.app_role[]);
  perform prime_private.set_worker_cost(p_id,p_cost);
end $$;

create function public.set_work_costing(p_id uuid,p_worker uuid,p_cost numeric) returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); jid uuid;
begin
  select service_job_id into jid from public.job_work_items where id=p_id and organization_id=org;
  perform 1 from public.service_jobs where id=jid and organization_id=org and archived_at is null for update;
  if not found then raise exception 'Aktiv servis kartı tapılmadı' using errcode='42501'; end if;
  if p_worker is not null and not exists(select 1 from public.workers where id=p_worker and organization_id=org and active) then
    if not exists(select 1 from public.job_work_items where id=p_id and assigned_worker_id=p_worker) then raise exception 'Aktiv işçi seçin'; end if;
  end if;
  update public.job_work_items set assigned_worker_id=p_worker where id=p_id and organization_id=org;
  perform public.set_worker_cost(p_id,p_cost);
end $$;

create function public.create_additional_work(p_data jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); w public.job_work_items; jid uuid:=(p_data->>'service_job_id')::uuid;
begin
  perform 1 from public.service_jobs where id=jid and organization_id=org and archived_at is null for update;
  if not found then raise exception 'Aktiv servis kartı tapılmadı' using errcode='42501'; end if;
  select * into w from public.job_work_items where id=p_key and organization_id=org and service_job_id=jid and is_additional;
  if found then return w.id; end if;
  insert into public.job_work_items(id,owner_user_id,service_job_id,work_catalog_id,quoted_price,quantity,unit_id,customer_unit_price,notes,cost_note,is_additional)
    values(p_key,auth.uid(),jid,(p_data->>'catalog_id')::uuid,round((p_data->>'quantity')::numeric*(p_data->>'customer_unit_price')::numeric,2),
    (p_data->>'quantity')::numeric,(p_data->>'unit_id')::uuid,(p_data->>'customer_unit_price')::numeric,p_data->>'notes',p_data->>'cost_note',true);
  perform public.set_work_costing(p_key,(p_data->>'worker_id')::uuid,(p_data->>'labor_cost')::numeric);
  return p_key;
end $$;

-- Wrap the existing transactional purchase RPC; quantity in purchases keeps its
-- historical unit-cost meaning. New actual-total entries always use quantity 1.
alter function public.save_workshop_purchase(jsonb,uuid) set schema prime_private;
revoke all on function prime_private.save_workshop_purchase(jsonb,uuid) from public,anon,authenticated;
create function public.save_workshop_purchase(p_data jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); jid uuid:=(p_data->>'service_job_id')::uuid; rid uuid; result uuid;
begin
  perform 1 from public.service_jobs where id=jid and organization_id=org and archived_at is null for update;
  if not found then raise exception 'Aktiv servis kartı tapılmadı' using errcode='42501'; end if;
  if nullif(p_data->>'id','') is null then
    select id into result from public.purchases where id=p_key and organization_id=org and service_job_id=jid;
    if found then return result; end if;
  end if;
  if coalesce((p_data->>'purchased_by_admin')::boolean,true) then
    p_data:=p_data||jsonb_build_object('purchased_by_admin',true,'purchased_by_worker_id',null);
  elsif nullif(p_data->>'purchased_by_worker_id','') is null then raise exception 'Alan işçini seçin'; end if;
  if nullif(p_data->>'id','') is null and nullif(p_data->>'required_part_id','') is null and p_data->>'additional'='true' then
    insert into public.job_required_parts(owner_user_id,service_job_id,part_catalog_id,quoted_price,quantity,unit_id,customer_unit_price,cost_note,notes,is_additional)
    values(auth.uid(),jid,(p_data->>'part_catalog_id')::uuid,0,(p_data->>'quoted_quantity')::numeric,(p_data->>'unit_id')::uuid,
      (p_data->>'customer_unit_price')::numeric,p_data->>'cost_note',p_data->>'notes',true) returning id into rid;
    p_data:=p_data||jsonb_build_object('required_part_id',rid,'quantity',1);
  end if;
  result:=prime_private.save_workshop_purchase(p_data,p_key);
  return result;
end $$;

create function prime_private.guard_costing_extensions() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='purchases' then
    if tg_op='INSERT' or new.purchased_by_admin is distinct from old.purchased_by_admin or new.purchased_by_worker_id is distinct from old.purchased_by_worker_id then
      if new.purchased_by_admin then new.purchased_by_worker_id:=null;
      elsif new.purchased_by_worker_id is null then raise exception 'Alan işçini seçin'; end if;
    end if;
    if new.supplier_id is not null and (tg_op='INSERT' or new.supplier_id is distinct from old.supplier_id) and not exists(select 1 from public.suppliers where id=new.supplier_id and organization_id=new.organization_id and active) then raise exception 'Təchizatçı arxivdədir'; end if;
  else
    if tg_op='UPDATE' and new.is_additional is distinct from old.is_additional then raise exception 'Sətrin mənbəyi dəyişdirilə bilməz'; end if;
    if new.is_additional and not prime_private.has_role(array['ADMIN']::public.app_role[]) then raise exception 'Administrator tələb olunur' using errcode='42501'; end if;
  end if;
  return new;
end $$;
create trigger ab_costing_guard before insert or update on public.purchases for each row execute function prime_private.guard_costing_extensions();
create trigger ab_costing_guard before insert or update on public.job_work_items for each row execute function prime_private.guard_costing_extensions();
create trigger ab_costing_guard before insert or update on public.job_required_parts for each row execute function prime_private.guard_costing_extensions();

create function prime_private.audit_costing_extensions() returns trigger language plpgsql security definer set search_path='' as $$
declare event text; jid uuid;
begin
  if tg_table_name='suppliers' then
    if tg_op<>'UPDATE' or new.active is not distinct from old.active then return new; end if;
    event:=case when new.active then 'SUPPLIER_RESTORED' else 'SUPPLIER_ARCHIVED' end;
  elsif tg_table_name='job_work_items' then
    if not new.is_additional then return new; end if;
    event:='ADDITIONAL_WORK_CREATED'; jid:=new.service_job_id;
  else
    if new.required_part_id is not null and not exists(select 1 from public.job_required_parts where id=new.required_part_id and is_additional) then return new; end if;
    event:='ADDITIONAL_PURCHASE_CREATED'; jid:=new.service_job_id;
  end if;
  perform prime_private.write_audit(new.organization_id,auth.uid(),event,tg_table_name,new.id,jid,null,replace(event,'_',' '));
  return new;
end $$;
create trigger z_costing_audit after update on public.suppliers for each row execute function prime_private.audit_costing_extensions();
create trigger z_costing_audit after insert on public.job_work_items for each row execute function prime_private.audit_costing_extensions();
create trigger z_costing_audit after insert on public.purchases for each row execute function prime_private.audit_costing_extensions();

-- Keep INTAKE's existing safe projection, adding only the source discriminator.
alter function public.intake_work_items(uuid) set schema prime_private;
revoke all on function prime_private.intake_work_items(uuid) from public,anon,authenticated;
create function public.intake_work_items(p_job uuid default null) returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
  perform prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
  return query select item||jsonb_build_object('is_additional',w.is_additional)
    from prime_private.intake_work_items(p_job) item join public.job_work_items w on w.id=(item->>'id')::uuid;
end $$;
revoke all on function public.set_worker_cost(uuid,numeric),public.set_work_costing(uuid,uuid,numeric),public.create_additional_work(jsonb,uuid),public.save_workshop_purchase(jsonb,uuid),public.intake_work_items(uuid) from public,anon,authenticated;
grant execute on function public.set_worker_cost(uuid,numeric),public.set_work_costing(uuid,uuid,numeric),public.create_additional_work(jsonb,uuid),public.save_workshop_purchase(jsonb,uuid),public.intake_work_items(uuid) to authenticated;
revoke all on function prime_private.guard_costing_extensions(),prime_private.audit_costing_extensions() from public,anon,authenticated;
commit;
