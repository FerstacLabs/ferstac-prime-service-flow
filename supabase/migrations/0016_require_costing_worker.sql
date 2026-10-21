-- Validation only: preserve the existing assignment, costing and earning workflow.
begin;
create or replace function public.set_work_compensation(p_id uuid,p_worker uuid,p_percentage boolean,p_cost numeric default null)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); item public.job_work_items;
begin
  if p_worker is null or not exists(select 1 from public.workers where id=p_worker and organization_id=org) then
    raise exception 'Usta seçilməyib. Maya dəyərini yadda saxlamaq üçün əvvəlcə işi görəcək ustanı seçin.';
  end if;
  perform 1 from public.service_jobs j join public.job_work_items w on w.service_job_id=j.id where w.id=p_id and w.organization_id=org and j.organization_id=org for update of j;
  select * into item from public.job_work_items where id=p_id and organization_id=org for update;
  if not found then raise exception 'İş tapılmadı'; end if;
  perform public.update_work_assignment(p_id,p_worker,item.status::text,item.notes,p_percentage);
  if not p_percentage then perform public.set_worker_cost(p_id,p_cost); end if;
end $$;
commit;
