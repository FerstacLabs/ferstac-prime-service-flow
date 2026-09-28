begin;

-- Keep every existing UPDATE guard; DELETE is RPC-only and checked independently.
drop trigger b_work_guard on public.job_work_items;
create trigger b_work_guard before update on public.job_work_items for each row execute function public.guard_financial_edits();
drop trigger b_requirement_guard on public.job_required_parts;
create trigger b_requirement_guard before update on public.job_required_parts for each row execute function public.guard_financial_edits();
revoke delete on public.job_work_items, public.job_required_parts from authenticated, anon;

create function prime_private.guard_service_row_removal() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]); j public.service_jobs;
begin
  select * into j from public.service_jobs where id=old.service_job_id and organization_id=org for update;
  if not found or old.organization_id<>org then raise exception 'Servis kartı tapılmadı'; end if;
  if j.archived_at is not null or j.deleted_at is not null or j.financially_closed_at is not null or j.status='DELIVERED' then
    raise exception 'Yalnız aktiv və maliyyəsi açıq servis kartı dəyişdirilə bilər';
  end if;
  if tg_table_name='job_work_items' then
    if old.status<>'TODO' or old.started_at is not null or old.completed_at is not null or old.earning_finalized_at is not null
      or exists(select 1 from public.cash_transactions where work_item_id=old.id)
      or exists(select 1 from public.worker_advance_allocations where work_item_id=old.id) then
      raise exception 'Bu iş üzrə maliyyə əməliyyatı və ya icra tarixçəsi mövcuddur. İş sətrini silmək mümkün deyil.';
    end if;
  else
    if exists(select 1 from public.purchases where required_part_id=old.id)
      or exists(select 1 from public.cash_transactions where required_part_id=old.id) then
      raise exception 'Bu detal üzrə alış və ya ödəniş mövcuddur. Servis kartından silmək mümkün deyil.';
    end if;
  end if;
  return old;
end $$;
create trigger b_remove_guard before delete on public.job_work_items for each row execute function prime_private.guard_service_row_removal();
create trigger b_remove_guard before delete on public.job_required_parts for each row execute function prime_private.guard_service_row_removal();
revoke all on function prime_private.guard_service_row_removal() from public,anon,authenticated;

create function public.remove_service_row(p_job uuid,p_kind text,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]); j public.service_jobs;
  label text; event text; entity text; next_status public.service_job_status;
begin
  if p_kind is null or p_kind not in ('work','part') then raise exception 'Sətir növü düzgün deyil'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  select * into j from public.service_jobs where id=p_job and organization_id=org for update;
  if not found then raise exception 'Servis kartı tapılmadı'; end if;
  if p_kind='work' then
    select coalesce(w.custom_title,c.name,'İş') into label from public.job_work_items w left join public.work_catalog c on c.id=w.work_catalog_id where w.id=p_id and w.service_job_id=j.id and w.organization_id=org for update of w;
    if not found then raise exception 'İş sətri tapılmadı'; end if;
    delete from public.job_work_items where id=p_id and organization_id=org;
    event:='SERVICE_WORK_REMOVED'; entity:='job_work_items';
    select case when bool_and(status in ('DONE','CANCELLED')) then 'READY'::public.service_job_status when bool_or(status='IN_PROGRESS') then 'IN_PROGRESS'::public.service_job_status else 'WAITING'::public.service_job_status end
      into next_status from public.job_work_items where service_job_id=j.id;
    update public.service_jobs set status=next_status where id=j.id and status not in ('DELIVERED','PAUSED');
  else
    select coalesce(c.name,'Detal') into label from public.job_required_parts r left join public.part_catalog c on c.id=r.part_catalog_id where r.id=p_id and r.service_job_id=j.id and r.organization_id=org for update of r;
    if not found then raise exception 'Detal sətri tapılmadı'; end if;
    delete from public.job_required_parts where id=p_id and organization_id=org;
    event:='SERVICE_PART_REMOVED'; entity:='job_required_parts';
  end if;
  if prime_private.vehicle_receivable(j.id)<(select coalesce(sum(amount),0) from public.cash_transactions where service_job_id=j.id and allocation_type like 'CUSTOMER_%' and voided_at is null) then
    raise exception 'Sətir silindikdə müştəri ödənişi yekun məbləği aşır. Əvvəlcə hesablaşmanı uzlaşdırın.';
  end if;
  perform prime_private.write_audit(org,auth.uid(),event,entity,p_id,j.id,j.vehicle_id,'Servis kartından sətir silindi','{}',jsonb_build_object('name',label));
end $$;
revoke all on function public.remove_service_row(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.remove_service_row(uuid,text,uuid) to authenticated;
commit;
