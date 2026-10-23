-- Forward-only, additive customer pricing. Apply only after explicit production approval.
begin;
alter table public.service_jobs
  add column discount_type text not null default 'NONE'
    check(discount_type in ('NONE','PERCENT','AMOUNT')),
  add column discount_value numeric not null default 0
    check(discount_value>=0 and discount_value<=9999999999.99 and discount_value=round(discount_value,2)),
  add constraint valid_job_discount check(
    (discount_type='NONE' and discount_value=0) or
    (discount_type='PERCENT' and discount_value<=100) or discount_type='AMOUNT'
  );

create function prime_private.vehicle_quote_before_discount(p_job uuid) returns numeric
language sql stable set search_path='' as $$
  select case when j.has_line_quotes then
    coalesce((select sum(quoted_price) from public.job_work_items where service_job_id=j.id),0)
    +coalesce((select sum(quoted_price) from public.job_required_parts where service_job_id=j.id),0)
  else j.agreed_budget
    +coalesce((select sum(quoted_price) from public.job_work_items where service_job_id=j.id and is_additional),0)
    +coalesce((select sum(quoted_price) from public.job_required_parts where service_job_id=j.id and is_additional),0) end
  from public.service_jobs j where j.id=p_job
$$;
create function prime_private.discount_amount(p_base numeric,p_type text,p_value numeric) returns numeric
language plpgsql immutable set search_path='' as $$
declare amount numeric;
begin
  if p_base is null or p_base<0 or p_base='NaN'::numeric or p_base='Infinity'::numeric
    or p_type is null or p_type not in ('NONE','PERCENT','AMOUNT')
    or p_value is null or p_value<0 or p_value>9999999999.99 or p_value<>round(p_value,2)
    or (p_type='NONE' and p_value<>0) or (p_type='PERCENT' and p_value>100) then
    raise exception 'Endirim dəyəri düzgün deyil.';
  end if;
  amount:=case p_type when 'PERCENT' then round(p_base*p_value/100,2) when 'AMOUNT' then p_value else 0 end;
  if amount>p_base then raise exception 'Endirim ümumi məbləğdən çox ola bilməz.'; end if;
  return amount;
end $$;
create or replace function prime_private.vehicle_net_quote(p_job uuid) returns numeric
language sql stable set search_path='' as $$
  select base-prime_private.discount_amount(base,j.discount_type,j.discount_value)
  from public.service_jobs j cross join lateral prime_private.vehicle_quote_before_discount(j.id) base
  where j.id=p_job
$$;

create function prime_private.guard_customer_discount() returns trigger
language plpgsql security definer set search_path='' as $$
declare j public.service_jobs; jid uuid; changed boolean; org uuid; base numeric; amount numeric;
begin
  if tg_table_name='service_jobs' then
    jid:=new.id;
    changed:=tg_op='INSERT';
    if tg_op='UPDATE' then
      changed:=new.discount_type is distinct from old.discount_type or new.discount_value is distinct from old.discount_value
        or new.agreed_budget is distinct from old.agreed_budget or new.has_line_quotes is distinct from old.has_line_quotes;
      if not changed or (new.discount_type='NONE' and old.discount_type='NONE') then return new; end if;
    elsif new.discount_type='NONE' then return new; end if;
  else
    jid:=case when tg_op='DELETE' then old.service_job_id else new.service_job_id end;
    changed:=tg_op in ('INSERT','DELETE');
    if tg_op='UPDATE' then
      changed:=new.quoted_price is distinct from old.quoted_price or new.is_additional is distinct from old.is_additional;
    end if;
    if not changed then return null; end if;
  end if;
  select * into j from public.service_jobs where id=jid;
  if not found then return null; end if;
  if tg_table_name<>'service_jobs' and j.discount_type='NONE' then return null; end if;
  org:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
  if j.organization_id<>org then raise exception 'Bu müəssisəyə giriş yoxdur' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  if j.financially_closed_at is not null or j.archived_at is not null or j.deleted_at is not null then
    raise exception 'Endirimi dəyişmək üçün əvvəlcə servis kartının maliyyəsini və redaktəsini açın.';
  end if;
  if exists(select 1 from public.cash_transactions where service_job_id=jid and allocation_type like 'CUSTOMER_%' and voided_at is null) then
    raise exception 'Endirimli təklifi dəyişmək üçün əvvəlcə müştəri ödənişlərini ləğv edin.';
  end if;
  base:=prime_private.vehicle_quote_before_discount(jid);
  amount:=prime_private.discount_amount(base,j.discount_type,j.discount_value);
  if tg_table_name='service_jobs' then
    perform prime_private.write_audit(org,auth.uid(),'CUSTOMER_DISCOUNT_CHANGED','service_jobs',j.id,j.id,j.vehicle_id,
      'Müştəri endirimi yeniləndi',
      case when tg_op='UPDATE' then jsonb_build_object('discount_type',old.discount_type,'discount_value',old.discount_value) else '{}'::jsonb end,
      jsonb_build_object('discount_type',j.discount_type,'discount_value',j.discount_value,
        'before_discount',base,'discount_amount',amount,'net_amount',base-amount,
        'gross_amount',prime_private.vehicle_receivable(jid)));
  end if;
  return null;
end $$;
-- AFTER checks see the final quote, including added/deleted lines. Errors roll back the whole RPC.
create trigger zz_customer_discount after insert or update on public.service_jobs
  for each row execute function prime_private.guard_customer_discount();
create trigger zz_customer_discount after insert or update or delete on public.job_work_items
  for each row execute function prime_private.guard_customer_discount();
create trigger zz_customer_discount after insert or update or delete on public.job_required_parts
  for each row execute function prime_private.guard_customer_discount();

alter function public.create_workshop_job(jsonb,jsonb,jsonb,jsonb,uuid) rename to create_workshop_job_0014;
create function public.create_workshop_job(p_vehicle jsonb,p_job jsonb,p_works jsonb,p_parts jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]); result uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  if p_key is null then raise exception 'Əməliyyat açarı tələb olunur'; end if;
  if exists(select 1 from public.service_jobs where id=p_key and organization_id=org) then return p_key; end if;
  result:=public.create_workshop_job_0014(p_vehicle,p_job-'discount_type'-'discount_value',p_works,p_parts,p_key);
  update public.service_jobs set discount_type=coalesce(p_job->>'discount_type','NONE'),
    discount_value=coalesce((p_job->>'discount_value')::numeric,0) where id=result and organization_id=org;
  return result;
end $$;
alter function public.update_vehicle_intake(uuid,jsonb,jsonb) rename to update_vehicle_intake_0014;
create function public.update_vehicle_intake(p_job uuid,p_vehicle jsonb,p_details jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  perform public.update_vehicle_intake_0014(p_job,p_vehicle,p_details-'discount_type'-'discount_value');
  if p_details ? 'discount_type' or p_details ? 'discount_value' then
    update public.service_jobs set discount_type=coalesce(p_details->>'discount_type',discount_type),
      discount_value=coalesce((p_details->>'discount_value')::numeric,discount_value) where id=p_job and organization_id=org;
  end if;
end $$;

alter function public.finance_data(text,uuid) rename to finance_data_0014;
create function public.finance_data(p_kind text,p_job uuid default null) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
begin
  if p_kind='jobs' then
    return query select r||jsonb_build_object('discount_type',j.discount_type,'discount_value',j.discount_value,
      'before_discount',prime_private.vehicle_quote_before_discount(j.id),
      'discount_amount',prime_private.discount_amount(prime_private.vehicle_quote_before_discount(j.id),j.discount_type,j.discount_value))
      from public.finance_data_0014(p_kind,p_job) r join public.service_jobs j on j.id=(r->>'id')::uuid and j.organization_id=org;
  else return query select * from public.finance_data_0014(p_kind,p_job); end if;
end $$;
revoke all on function prime_private.vehicle_quote_before_discount(uuid),prime_private.discount_amount(numeric,text,numeric),
  prime_private.guard_customer_discount(),public.create_workshop_job_0014(jsonb,jsonb,jsonb,jsonb,uuid),
  public.update_vehicle_intake_0014(uuid,jsonb,jsonb),public.finance_data_0014(text,uuid),
  public.create_workshop_job(jsonb,jsonb,jsonb,jsonb,uuid),public.update_vehicle_intake(uuid,jsonb,jsonb),
  public.finance_data(text,uuid) from public,anon,authenticated;
grant execute on function public.create_workshop_job(jsonb,jsonb,jsonb,jsonb,uuid),
  public.update_vehicle_intake(uuid,jsonb,jsonb),public.finance_data(text,uuid) to authenticated;
commit;
