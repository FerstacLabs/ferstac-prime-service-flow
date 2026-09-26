begin;

-- Operational projection: no sale prices, costs, balances or payment payloads.
create function public.work_queue_data(p_kind text) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid := prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
begin
  if p_kind='jobs' then
    return query select jsonb_build_object(
      'id',j.id,'job_no',j.job_no,'customer_name',j.customer_name,
      'received_at',j.received_at,'target_delivery_date',j.target_delivery_date,
      'status',j.status,'funding_source',j.funding_source,'archived_at',j.archived_at,
      'deleted_at',j.deleted_at,
      'vehicles',jsonb_build_object('plate',v.plate,'make',v.make,'model',v.model))
      from public.service_jobs j join public.vehicles v on v.id=j.vehicle_id and v.organization_id=org
      where j.organization_id=org order by j.id;
  elsif p_kind='work' then
    return query select jsonb_build_object(
      'id',w.id,'service_job_id',w.service_job_id,'work_catalog_id',w.work_catalog_id,
      'custom_title',w.custom_title,'assigned_worker_id',w.assigned_worker_id,
      'status',w.status,'notes',w.notes,'planned_at',w.planned_at,
      'started_at',w.started_at,'completed_at',w.completed_at,
      'work_catalog',case when c.id is null then null else jsonb_build_object('id',c.id,'name',c.name,'category',c.category) end)
      from public.job_work_items w
      join public.service_jobs j on j.id=w.service_job_id and j.organization_id=org
      left join public.work_catalog c on c.id=w.work_catalog_id and c.organization_id=org
      where w.organization_id=org order by w.id;
  elsif p_kind='workers' then
    return query select jsonb_build_object('id',w.id,'first_name',w.first_name,'last_name',w.last_name,'active',w.active)
      from public.workers w where w.organization_id=org order by w.id;
  else raise exception 'Məlumat növü yanlışdır'; end if;
end $$;

create function public.update_work_assignment(p_id uuid,p_worker uuid,p_status text,p_notes text)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid := prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
  item public.job_work_items; job public.service_jobs;
begin
  if p_status is null or p_status not in ('TODO','IN_PROGRESS','DONE','CANCELLED') then raise exception 'Status yanlışdır'; end if;
  if length(coalesce(p_notes,''))>250 then raise exception 'Qeyd ən çox 250 simvol ola bilər'; end if;
  -- Match the financial mutation lock order: parent first, then work row.
  select j.* into job from public.service_jobs j join public.job_work_items w on w.service_job_id=j.id
    where w.id=p_id and w.organization_id=org and j.organization_id=org for update of j;
  if not found then raise exception 'İş tapılmadı' using errcode='42501'; end if;
  if job.deleted_at is not null or job.archived_at is not null then raise exception 'Servis kartı aktiv deyil'; end if;
  if job.financially_closed_at is not null then raise exception 'Əvvəlcə avtomobil maliyyəsini yenidən açın'; end if;
  select * into strict item from public.job_work_items where id=p_id and organization_id=org for update;
  if p_worker is not null and not exists(select 1 from public.workers where id=p_worker and organization_id=org and (active or id=item.assigned_worker_id)) then
    raise exception 'Aktiv usta seçin' using errcode='42501';
  end if;
  update public.job_work_items set assigned_worker_id=p_worker,
    status=p_status::public.work_item_status,
    notes=nullif(btrim(p_notes),''),
    started_at=coalesce(item.started_at,case when p_status in ('IN_PROGRESS','DONE') then now() end),
    completed_at=case when p_status='DONE' then coalesce(item.completed_at,now()) else null end
    where id=p_id and organization_id=org;
end $$;

-- Preserve costing guards; allow only operational edits to existing additional work.
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
      if not (tg_op='UPDATE' and tg_table_name='job_work_items' and prime_private.has_role(array['INTAKE']::public.app_role[])
        and (to_jsonb(new)-array['assigned_worker_id','status','notes','started_at','completed_at','updated_at'])
          = (to_jsonb(old)-array['assigned_worker_id','status','notes','started_at','completed_at','updated_at'])) then
        raise exception 'Administrator tələb olunur' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.work_queue_data(text),public.update_work_assignment(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.work_queue_data(text),public.update_work_assignment(uuid,uuid,text,text) to authenticated;

commit;
