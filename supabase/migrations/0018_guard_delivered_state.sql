-- Keep the installed delivery trigger; protect completed delivery from ordinary edits.
begin;
create or replace function prime_private.guard_vehicle_delivery() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
  if tg_op='INSERT' then
    if new.status='DELIVERED' or new.delivered_at is not null then
      raise exception 'Yeni avtomobil əvvəlcə servisə qəbul edilməlidir.';
    end if;
    return new;
  end if;
  if new.status is not distinct from old.status and new.delivered_at is not distinct from old.delivered_at then return new; end if;
  -- Unrelated edits returned above; any delivery-state change is now forbidden.
  if old.status='DELIVERED' then
    raise exception 'Təhvil verilmiş avtomobilin statusu və təhvil tarixi dəyişdirilə bilməz.';
  end if;
  if new.status='DELIVERED' or new.delivered_at is distinct from old.delivered_at then
    org:=prime_private.require_role(array['ADMIN']::public.app_role[]);
    if new.organization_id<>org then raise exception 'Bu müəssisəyə giriş yoxdur' using errcode='42501'; end if;
    if new.status<>'DELIVERED' or old.status not in ('READY','DELIVERED')
      or new.archived_at is not null or new.deleted_at is not null
      or exists(select 1 from public.job_work_items where service_job_id=new.id and status not in ('DONE','CANCELLED')) then
      raise exception 'Yekun təhvil üçün avtomobil hazır olmalı və bütün işlər tamamlanmalıdır.';
    end if;
    new.delivered_at:=coalesce(new.delivered_at,now());
  end if;
  return new;
end $$;
revoke all on function prime_private.guard_vehicle_delivery() from public,anon,authenticated;
commit;
