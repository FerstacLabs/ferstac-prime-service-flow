-- Forward-only VAT accounting. Apply to a local/test database before rollout.
begin;

alter table public.service_jobs
  add column vat_enabled boolean not null default false,
  add column vat_rate numeric(5,2) not null default 18 check (vat_rate=18);
alter table public.purchases
  add column vat_enabled boolean not null default false,
  add column vat_rate numeric(5,2) not null default 18 check (vat_rate=18),
  add column net_amount numeric generated always as (round(quantity*unit_price,2)) stored,
  add column vat_amount numeric generated always as (case when vat_enabled then round(round(quantity*unit_price,2)*0.18,2) else 0 end) stored,
  add column gross_amount numeric generated always as (round(quantity*unit_price,2)+case when vat_enabled then round(round(quantity*unit_price,2)*0.18,2) else 0 end) stored;
alter table public.purchases drop constraint partial_payment_bounds;
alter table public.purchases add constraint partial_payment_bounds check (
  (payment_status='UNPAID' and paid_amount=0) or
  (payment_status='PAID' and paid_amount>=gross_amount) or
  (payment_status='PARTIAL' and paid_amount>0 and paid_amount<gross_amount)
);

-- amount remains the party settlement amount. Only net_amount is operating money.
alter table public.cash_transactions
  add column vat_amount numeric not null default 0 check (vat_amount>=0 and vat_amount<=amount),
  add column net_amount numeric generated always as (amount-vat_amount) stored;

create table public.vat_ledger (
  id uuid primary key default gen_random_uuid(),
  posting_order bigint generated always as identity unique,
  organization_id uuid not null references public.organizations(id),
  kind text not null check (kind in ('OPENING','CUSTOMER_RECEIPT','SUPPLIER_PAYMENT','SUPPLIER_REFUND','FUNDING','BUDGET_PAYMENT','REVERSAL')),
  direction text not null check (direction in ('IN','OUT')),
  amount numeric not null check (amount>0 and amount=round(amount,2) and amount<=9999999999.99),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  created_by_name text not null,
  reference_number text not null check (length(btrim(reference_number)) between 1 and 200),
  note text not null check (length(btrim(note)) between 1 and 500),
  cash_transaction_id uuid references public.cash_transactions(id),
  service_job_id uuid references public.service_jobs(id),
  supplier_id uuid references public.master_identities(id),
  reversal_of uuid unique references public.vat_ledger(id),
  idempotency_key uuid not null,
  unique (organization_id,idempotency_key),
  check ((kind='REVERSAL')=(reversal_of is not null)),
  check (kind not in ('CUSTOMER_RECEIPT','SUPPLIER_PAYMENT','SUPPLIER_REFUND') or cash_transaction_id is not null),
  check (kind not in ('OPENING','CUSTOMER_RECEIPT','SUPPLIER_REFUND','FUNDING') or direction='IN'),
  check (kind not in ('SUPPLIER_PAYMENT','BUDGET_PAYMENT') or direction='OUT')
);
create unique index vat_source_movement on public.vat_ledger(cash_transaction_id) where kind<>'REVERSAL';
create index vat_organization_chronology on public.vat_ledger(organization_id,occurred_at,posting_order);
alter table public.vat_ledger enable row level security;
revoke all on public.vat_ledger from public,anon,authenticated;
grant select on public.vat_ledger to authenticated;
create policy vat_finance_read on public.vat_ledger for select to authenticated using (
  organization_id=prime_private.organization_id() and prime_private.has_role(array['ADMIN','CASHIER']::public.app_role[])
);
create trigger immutable_vat_history before update or delete on public.vat_ledger
  for each row execute function prime_private.immutable_history();

create function prime_private.vat_balance(p_org uuid) returns numeric
language sql stable security definer set search_path='' as $$
  select coalesce(sum(case direction when 'IN' then amount else -amount end),0)
  from public.vat_ledger where organization_id=p_org
$$;

-- This guard also checks historical prefixes: a backdated withdrawal cannot
-- temporarily spend a later receipt, even if today's final balance is positive.
create function prime_private.guard_vat_movement() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor_org uuid; prior public.vat_ledger;
begin
  actor_org:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
  if new.organization_id<>actor_org then raise exception 'ƏDV əməliyyatı bu müəssisəyə aid deyil' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_org::text||'finance',0));
  if new.kind in ('OPENING','FUNDING','BUDGET_PAYMENT') then perform prime_private.require_role(array['ADMIN']::public.app_role[]); end if;
  new.created_by:=auth.uid();
  select display_name into new.created_by_name from public.user_profiles where auth_user_id=auth.uid();
  if new.kind='REVERSAL' then
    select * into prior from public.vat_ledger where id=new.reversal_of and organization_id=actor_org for update;
    if not found or prior.kind='REVERSAL' or prior.amount<>new.amount or prior.direction=new.direction or new.occurred_at<prior.occurred_at
      or prior.cash_transaction_id is distinct from new.cash_transaction_id then raise exception 'ƏDV ləğvetmə məlumatları uyğun deyil'; end if;
  end if;
  if new.kind='OPENING' and exists(select 1 from public.vat_ledger where organization_id=actor_org and kind='OPENING') then
    raise exception 'ƏDV başlanğıc qalığı artıq daxil edilib; düzəliş üçün ləğvetmə istifadə edin';
  end if;
  if new.cash_transaction_id is not null and not exists(select 1 from public.cash_transactions where id=new.cash_transaction_id and organization_id=actor_org) then raise exception 'Bağlı ödəniş tapılmadı'; end if;
  if new.service_job_id is not null and not exists(select 1 from public.service_jobs where id=new.service_job_id and organization_id=actor_org) then raise exception 'Servis kartı tapılmadı'; end if;
  if new.supplier_id is not null and not exists(select 1 from public.master_identities where id=new.supplier_id and organization_id=actor_org and kind='supplier') then raise exception 'Təchizatçı tapılmadı'; end if;
  if exists (
    select 1 from (
      select sum(delta) over(order by occurred_at,posting_order rows unbounded preceding) balance
      from (
        select occurred_at,posting_order,case direction when 'IN' then amount else -amount end delta from public.vat_ledger where organization_id=actor_org
        union all select new.occurred_at,new.posting_order,case new.direction when 'IN' then new.amount else -new.amount end
      ) movements
    ) running where balance<0
  ) then raise exception 'ƏDV depozit qalığı kifayət deyil. Əvvəlcə ƏDV depozitini artırın.'; end if;
  return new;
end $$;
create trigger validate_vat_movement before insert on public.vat_ledger for each row execute function prime_private.guard_vat_movement();

create function prime_private.audit_vat_movement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform prime_private.write_audit(new.organization_id,auth.uid(),'VAT_'||new.kind,'vat_ledger',new.id,new.service_job_id,null,
    case new.kind when 'OPENING' then 'ƏDV başlanğıc qalığı' when 'REVERSAL' then 'ƏDV əməliyyatı ləğv edildi'
      when 'FUNDING' then 'ƏDV depoziti artırıldı' when 'BUDGET_PAYMENT' then 'ƏDV büdcəyə ödəniş'
      when 'SUPPLIER_PAYMENT' then 'Təchizatçıya ƏDV məxarici' when 'SUPPLIER_REFUND' then 'Təchizatçıdan ƏDV qaytarılması' else 'Müştəridən ƏDV mədaxili' end,
    '{}',jsonb_build_object('amount',new.amount,'reference',new.reference_number,'note',new.note,'direction',new.direction));
  return new;
end $$;
create trigger audit_vat_movement after insert on public.vat_ledger for each row execute function prime_private.audit_vat_movement();

create function public.record_vat_adjustment(p_data jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); result uuid; old public.vat_ledger;
  kind text:=p_data->>'kind'; amount numeric:=(p_data->>'amount')::numeric;
  at_time timestamptz:=(p_data->>'occurred_at')::timestamptz; prior public.vat_ledger;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  if p_key is null or kind is null or kind not in ('OPENING','FUNDING','BUDGET_PAYMENT','REVERSAL') then raise exception 'ƏDV əməliyyat növü düzgün deyil'; end if;
  select * into old from public.vat_ledger where organization_id=org and idempotency_key=p_key;
  if found then
    if old.kind<>kind or old.amount is distinct from amount or old.occurred_at is distinct from at_time
      or old.reversal_of is distinct from nullif(p_data->>'reversal_of','')::uuid then raise exception 'Təkrar əməliyyat məlumatları uyğun deyil'; end if;
    return old.id;
  end if;
  if kind='REVERSAL' then
    select * into prior from public.vat_ledger where id=(p_data->>'reversal_of')::uuid and organization_id=org and cash_transaction_id is null;
    if not found or prior.kind='REVERSAL' or amount is distinct from prior.amount then raise exception 'Bağlı ödənişi Kassa vasitəsilə ləğv edin'; end if;
  end if;
  if amount is null or amount<=0 or amount<>round(amount,2) or at_time is null or nullif(btrim(p_data->>'reference_number'),'') is null or nullif(btrim(p_data->>'note'),'') is null then raise exception 'ƏDV məbləği, tarix, istinad və qeyd tələb olunur'; end if;
  insert into public.vat_ledger(organization_id,kind,direction,amount,occurred_at,created_by,created_by_name,reference_number,note,reversal_of,idempotency_key)
    values(org,kind,case when kind='REVERSAL' then case prior.direction when 'IN' then 'OUT' else 'IN' end when kind='BUDGET_PAYMENT' then 'OUT' else 'IN' end,
      amount,at_time,auth.uid(),'',p_data->>'reference_number',p_data->>'note',prior.id,p_key) returning id into result;
  return result;
end $$;

create function prime_private.guard_vat_mode() returns trigger
language plpgsql security definer set search_path='' as $$
declare changed boolean:=tg_op='INSERT'; org uuid;
begin
  if tg_op='UPDATE' then changed:=new.vat_enabled is distinct from old.vat_enabled or new.vat_rate is distinct from old.vat_rate; end if;
  if not changed or (tg_op='INSERT' and not new.vat_enabled) then return new; end if;
  if tg_table_name='service_jobs' then
    org:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
    perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
    if exists(select 1 from public.cash_transactions where service_job_id=new.id and allocation_type like 'CUSTOMER_%' and voided_at is null) then raise exception 'ƏDV rejimini dəyişmək üçün əvvəlcə müştəri ödənişlərini ləğv edin'; end if;
  else
    org:=prime_private.require_role(array['ADMIN']::public.app_role[]);
    perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
    if new.vat_enabled and new.source_type<>'SUPPLIER' then raise exception 'ƏDV yalnız təchizatçı alışına tətbiq edilir'; end if;
    if exists(select 1 from public.cash_transactions where purchase_id=new.id and voided_at is null)
      or exists(select 1 from public.purchase_returns where purchase_id=new.id)
      or exists(select 1 from public.supplier_credit_allocations where purchase_id=new.id) then raise exception 'Hesablaşma tarixçəsi olan alışın ƏDV rejimi dəyişdirilə bilməz'; end if;
  end if;
  if org<>new.organization_id then raise exception 'Bu müəssisəyə giriş yoxdur' using errcode='42501'; end if;
  return new;
end $$;
create trigger ab_vat_mode before insert or update on public.service_jobs for each row execute function prime_private.guard_vat_mode();
create trigger ad_vat_mode before insert or update on public.purchases for each row execute function prime_private.guard_vat_mode();

alter function public.create_workshop_job(jsonb,jsonb,jsonb,jsonb,uuid) rename to create_workshop_job_0013;
create function public.create_workshop_job(p_vehicle jsonb,p_job jsonb,p_works jsonb,p_parts jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]); result uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  if exists(select 1 from public.service_jobs where id=p_key and organization_id=org) then return p_key; end if;
  result:=public.create_workshop_job_0013(p_vehicle,p_job-'vat_enabled'-'vat_rate',p_works,p_parts,p_key);
  update public.service_jobs set vat_enabled=coalesce((p_job->>'vat_enabled')::boolean,false) where id=result and organization_id=org;
  return result;
end $$;

alter function public.update_vehicle_intake(uuid,jsonb,jsonb) rename to update_vehicle_intake_0013;
create function public.update_vehicle_intake(p_job uuid,p_vehicle jsonb,p_details jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  perform public.update_vehicle_intake_0013(p_job,p_vehicle,p_details-'vat_enabled');
  if p_details ? 'vat_enabled' then
    update public.service_jobs set vat_enabled=(p_details->>'vat_enabled')::boolean where id=p_job and organization_id=org;
  end if;
end $$;

alter function public.save_workshop_purchase(jsonb,uuid) rename to save_workshop_purchase_0013;
create function public.save_workshop_purchase(p_data jsonb,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); result uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  if nullif(p_data->>'id','') is null and exists(select 1 from public.purchases where id=p_key and organization_id=org) then return p_key; end if;
  if coalesce((p_data->>'vat_enabled')::boolean,false) and coalesce(p_data->>'payment_status','UNPAID')<>'UNPAID' then raise exception 'ƏDV-li alışın ödənişini Kassa vasitəsilə daxil edin'; end if;
  result:=public.save_workshop_purchase_0013(p_data,p_key);
  if p_data ? 'vat_enabled' then update public.purchases set vat_enabled=(p_data->>'vat_enabled')::boolean where id=result and organization_id=org; end if;
  return result;
end $$;

revoke all on function prime_private.vat_balance(uuid),prime_private.guard_vat_movement(),prime_private.audit_vat_movement(),prime_private.guard_vat_mode(),
  public.create_workshop_job_0013(jsonb,jsonb,jsonb,jsonb,uuid),public.update_vehicle_intake_0013(uuid,jsonb,jsonb),public.save_workshop_purchase_0013(jsonb,uuid),
  public.record_vat_adjustment(jsonb,uuid),public.create_workshop_job(jsonb,jsonb,jsonb,jsonb,uuid),public.update_vehicle_intake(uuid,jsonb,jsonb),public.save_workshop_purchase(jsonb,uuid)
  from public,anon,authenticated;
grant execute on function public.record_vat_adjustment(jsonb,uuid),public.create_workshop_job(jsonb,jsonb,jsonb,jsonb,uuid),public.update_vehicle_intake(uuid,jsonb,jsonb),public.save_workshop_purchase(jsonb,uuid) to authenticated;

alter function prime_private.vehicle_receivable(uuid) rename to vehicle_net_quote;
create function prime_private.vehicle_receivable(p_job uuid) returns numeric
language sql stable set search_path='' as $$
  select n+case when j.vat_enabled then round(n*0.18,2) else 0 end
  from public.service_jobs j cross join lateral prime_private.vehicle_net_quote(j.id) n where j.id=p_job
$$;
create or replace function prime_private.purchase_due(p_id uuid) returns numeric
language sql stable set search_path='' as $$
  select p.gross_amount-(s->>'returned')::numeric-(s->>'paid')::numeric-(s->>'credit_applied')::numeric+(s->>'credit_created')::numeric
  from public.purchases p cross join lateral prime_private.purchase_position(p.id) s where p.id=p_id
$$;

create function prime_private.post_payment_vat() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior public.vat_ledger;
begin
  if new.vat_amount=0 then return new; end if;
  if tg_op='INSERT' then
    insert into public.vat_ledger(organization_id,kind,direction,amount,occurred_at,created_by,created_by_name,reference_number,note,cash_transaction_id,service_job_id,supplier_id,idempotency_key)
    values(new.organization_id,case when new.allocation_type='SUPPLIER_PURCHASE' then 'SUPPLIER_PAYMENT' when new.counterparty_details->>'payment_kind'='SUPPLIER_REFUND' then 'SUPPLIER_REFUND' else 'CUSTOMER_RECEIPT' end,
      new.direction,new.vat_amount,new.occurred_at,auth.uid(),'',coalesce(nullif(new.reference_number,''),'ƏDV-'||left(new.id::text,8)),
      coalesce(nullif(new.purpose,''),'ƏDV hesablaşması'),new.id,new.service_job_id,new.supplier_identity_id,new.id);
  elsif old.voided_at is null and new.voided_at is not null then
    select * into prior from public.vat_ledger where cash_transaction_id=new.id and kind<>'REVERSAL';
    if not found then raise exception 'ƏDV hesablaşma tarixçəsi tapılmadı'; end if;
    insert into public.vat_ledger(organization_id,kind,direction,amount,occurred_at,created_by,created_by_name,reference_number,note,cash_transaction_id,service_job_id,supplier_id,reversal_of,idempotency_key)
    values(new.organization_id,'REVERSAL',case prior.direction when 'IN' then 'OUT' else 'IN' end,prior.amount,greatest(now(),prior.occurred_at),auth.uid(),'',prior.reference_number,
      new.void_reason,new.id,new.service_job_id,new.supplier_identity_id,prior.id,gen_random_uuid());
  end if;
  return new;
end $$;
create trigger e_post_payment_vat after insert or update on public.cash_transactions for each row execute function prime_private.post_payment_vat();

revoke all on function prime_private.vehicle_net_quote(uuid),prime_private.vehicle_receivable(uuid),prime_private.post_payment_vat() from public,anon,authenticated;

create or replace function public.validate_cash_transaction() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare cap numeric; paid numeric; j public.service_jobs; w public.job_work_items; p public.purchases; a public.financial_accounts;
begin
 if tg_op='UPDATE' then
  if (to_jsonb(new)-'voided_at'-'void_reason'-'net_amount') is distinct from (to_jsonb(old)-'voided_at'-'void_reason'-'net_amount') or old.voided_at is not null or new.voided_at is null or nullif(trim(new.void_reason),'') is null then raise exception 'Ödəniş yalnız səbəb göstərilməklə ləğv edilə bilər'; end if;
  return new;
 end if;
 if new.voided_at is not null then raise exception 'Yeni ödəniş ləğv edilmiş ola bilməz'; end if;
 if new.amount<>round(new.amount,2) then raise exception 'Məbləğ iki onluq rəqəm olmalıdır'; end if;
 new.direction:=case when new.allocation_type like 'CUSTOMER_%' or new.allocation_type in ('GENERAL_IN','TRANSFER_IN','OPENING_IN') then 'IN' else 'OUT' end;
 new.occurred_at:=coalesce(new.occurred_at,new.transaction_date::timestamp at time zone 'Asia/Baku');
 new.transaction_date:=(new.occurred_at at time zone 'Asia/Baku')::date;
 select display_name into new.created_by_name from public.user_profiles where auth_user_id=auth.uid();
 if new.financial_account_id is not null then
  select * into a from public.financial_accounts where id=new.financial_account_id and organization_id=new.organization_id and active for share;
  if not found or a.currency<>new.currency then raise exception 'Aktiv uyğun bank hesabı seçin'; end if;
 end if;
 if new.category_id is not null and not exists(select 1 from public.transaction_categories where id=new.category_id and organization_id=new.organization_id and active and direction=new.direction) then raise exception 'Uyğun kateqoriya seçin'; end if;
 if new.service_job_id is not null then
  select * into j from public.service_jobs where id=new.service_job_id and organization_id=new.organization_id for update;
  if not found or j.archived_at is not null or j.deleted_at is not null or j.financially_closed_at is not null then raise exception 'Aktiv və maliyyəsi açıq servis kartı tələb olunur'; end if;
 end if;
 if new.allocation_type like 'CUSTOMER_%' then
  if j.id is null then raise exception 'Servis kartı seçin'; end if;
  cap:=prime_private.vehicle_receivable(j.id);
  select coalesce(sum(amount),0) into paid from public.cash_transactions where service_job_id=j.id and allocation_type like 'CUSTOMER_%' and voided_at is null;
  new.counterparty_name_snapshot:=j.customer_name;
 elsif new.allocation_type='WORKER_WORK_ITEM' then
  select * into w from public.job_work_items where id=new.work_item_id and service_job_id=j.id;
  if not found or w.status='CANCELLED' or not w.labor_cost_known or w.assigned_worker_id is null then raise exception 'Usta və maya dəyəri tələb olunur'; end if;
  cap:=w.labor_cost;
  select coalesce(sum(amount),0) into paid from public.cash_transactions where work_item_id=w.id and allocation_type='WORKER_WORK_ITEM' and voided_at is null;
  select concat_ws(' ',first_name,last_name) into new.counterparty_name_snapshot from public.workers where id=w.assigned_worker_id;
  new.worker_identity_id:=w.assigned_worker_id;
 elsif new.allocation_type='SUPPLIER_PURCHASE' then
  select * into p from public.purchases where id=new.purchase_id and service_job_id=j.id and source_type='SUPPLIER' and voided_at is null;
  if not found then raise exception 'Alış tapılmadı'; end if;
  cap:=p.gross_amount;
  select coalesce(sum(amount),0) into paid from public.cash_transactions where purchase_id=p.id and voided_at is null;
  new.supplier_identity_id:=coalesce(p.supplier_id,p.historical_supplier_id);
  new.counterparty_name_snapshot:=coalesce(p.supplier_snapshot->>'company_name',p.supplier_snapshot->>'shop_name',concat_ws(' ',p.supplier_snapshot->>'first_name',p.supplier_snapshot->>'last_name'));
 elsif new.allocation_type='VEHICLE_EXPENSE' and j.id is null then raise exception 'Avtomobil xərci üçün servis kartı seçin';
 end if;
 if cap is not null and new.amount+paid>cap then raise exception 'Ödəniş qalıq məbləğdən artıqdır'; end if;
 if new.allocation_type like 'OPENING_%' then
  perform prime_private.require_role(array['ADMIN']::public.app_role[]);
  if exists(select 1 from public.cash_transactions where organization_id=new.organization_id and channel=new.channel and financial_account_id is not distinct from new.financial_account_id and allocation_type like 'OPENING_%' and voided_at is null) then raise exception 'Başlanğıc qalıq artıq daxil edilib'; end if;
 end if;
 return new;
end $$;

create or replace function public.guard_financial_edits() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare paid numeric;
begin
 perform 1 from service_jobs where id=coalesce(new.service_job_id,old.service_job_id) for update;
 if tg_op='DELETE' then raise exception 'Maliyyə tarixçəsi silinə bilməz; arxiv və ya ləğv istifadə edin'; end if;
 if tg_table_name='purchases' then
  if tg_op='UPDATE' and old.supplier_id is not null and new.supplier_id is null and old.supplier_snapshot is not null
   and not exists(select 1 from suppliers where id=old.supplier_id)
   and (to_jsonb(new)-'supplier_id'-'updated_at'-'total_price'-'net_amount'-'vat_amount'-'gross_amount')=(to_jsonb(old)-'supplier_id'-'updated_at'-'total_price'-'net_amount'-'vat_amount'-'gross_amount') then return new; end if;
  if pg_trigger_depth()<2 and ((tg_op='INSERT' and new.source_type='SUPPLIER' and new.paid_amount<>0) or (tg_op='UPDATE' and (new.paid_amount<>old.paid_amount or new.payment_status<>old.payment_status))) then raise exception 'Ödənişi Kassa vasitəsilə daxil edin'; end if;
  select coalesce(sum(amount),0) into paid from cash_transactions where purchase_id=new.id and voided_at is null;
  if new.quantity*new.unit_price<>round(new.quantity*new.unit_price,2) then raise exception 'Alış cəmi ən çox iki onluq rəqəm ola bilər'; end if;
  if new.source_type='SUPPLIER' then
   new.paid_amount:=paid;
   new.payment_status:=case when paid=0 then 'UNPAID'::payment_status when paid>=new.quantity*new.unit_price+case when new.vat_enabled then round(new.quantity*new.unit_price*0.18,2) else 0 end then 'PAID'::payment_status else 'PARTIAL'::payment_status end;
  end if;
  if tg_op='UPDATE' and paid>0 and (new.supplier_id is distinct from old.supplier_id or new.source_type<>old.source_type or new.required_part_id is distinct from old.required_part_id or new.voided_at is distinct from old.voided_at) then raise exception 'Əvvəlcə bağlı ödənişləri səbəb göstərərək ləğv edin'; end if;
 elsif tg_table_name='job_work_items' then
  if new.labor_cost<>round(new.labor_cost,2) or new.labor_cost>9999999999.99 then raise exception 'Usta mayası düzgün pul formatında olmalıdır'; end if;
  select coalesce(sum(amount),0) into paid from cash_transactions where work_item_id=new.id and allocation_type='WORKER_WORK_ITEM' and voided_at is null;
  if paid>0 and (not new.labor_cost_known or new.assigned_worker_id is distinct from old.assigned_worker_id) then raise exception 'Ödənilmiş usta məbləği qorunmalıdır'; end if;
  if paid>0 and new.status='CANCELLED' and old.status<>'CANCELLED' then raise exception 'Ödənişi olan iş ləğv edilə bilməz'; end if;
 end if;
 return new;
end $$;

create function prime_private.audit_vat_mode() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_enabled boolean:=false; jid uuid; net numeric;
begin
  if tg_op='UPDATE' then old_enabled:=old.vat_enabled; end if;
  if old_enabled=new.vat_enabled then return new; end if;
  if tg_table_name='service_jobs' then jid:=new.id; net:=prime_private.vehicle_net_quote(new.id);
  else jid:=new.service_job_id; net:=new.net_amount; end if;
  perform prime_private.write_audit(new.organization_id,auth.uid(),'VAT_MODE_CHANGED',tg_table_name,new.id,jid,null,'ƏDV rejimi dəyişdirildi',
    jsonb_build_object('vat_enabled',jsonb_build_object('before',old_enabled,'after',new.vat_enabled)),
    jsonb_build_object('old_gross',net+case when old_enabled then round(net*0.18,2) else 0 end,'new_gross',net+case when new.vat_enabled then round(net*0.18,2) else 0 end));
  return new;
end $$;
create trigger z_vat_mode_audit after insert or update on public.service_jobs for each row execute function prime_private.audit_vat_mode();
create trigger z_vat_mode_audit after insert or update on public.purchases for each row execute function prime_private.audit_vat_mode();
revoke all on function prime_private.audit_vat_mode() from public,anon,authenticated;

alter table public.purchase_returns
  add column vat_amount numeric not null default 0 check (vat_amount>=0 and vat_amount<=amount),
  add column credit_vat_amount numeric not null default 0 check (credit_vat_amount>=0 and credit_vat_amount<=credit_amount),
  add column net_amount numeric generated always as (amount-vat_amount) stored,
  add column credit_net_amount numeric generated always as (credit_amount-credit_vat_amount) stored;
alter table public.supplier_credit_allocations
  add column vat_amount numeric not null default 0 check (vat_amount>=0 and vat_amount<=amount),
  add column net_amount numeric generated always as (amount-vat_amount) stored;

create function prime_private.purchase_vat_due(p_id uuid) returns numeric
language sql stable set search_path='' as $$
  select p.vat_amount
    -coalesce((select sum(r.vat_amount-r.credit_vat_amount) from public.purchase_returns r where r.purchase_id=p.id),0)
    -coalesce((select sum(t.vat_amount) from public.cash_transactions t where t.purchase_id=p.id and t.allocation_type='SUPPLIER_PURCHASE' and t.voided_at is null),0)
    -coalesce((select sum(a.vat_amount) from public.supplier_credit_allocations a where a.purchase_id=p.id),0)
  from public.purchases p where p.id=p_id
$$;
create function prime_private.supplier_credit_vat_available(p_id uuid) returns numeric
language sql stable set search_path='' as $$
  select r.credit_vat_amount
    -coalesce((select sum(vat_amount) from public.supplier_credit_allocations where return_id=r.id),0)
    -coalesce((select sum(t.vat_amount) from public.supplier_refunds f join public.cash_transactions t on t.id=f.transaction_id where f.return_id=r.id and t.voided_at is null),0)
  from public.purchase_returns r where r.id=p_id
$$;

create function prime_private.return_vat_components() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.purchases; previous_net numeric; previous_quantity numeric; returned_net numeric; due_vat numeric;
begin
  select * into p from public.purchases where id=new.purchase_id and organization_id=new.organization_id;
  if not found then raise exception 'Alış tapılmadı'; end if;
  select coalesce(sum(net_amount),0),coalesce(sum(quantity),0) into previous_net,previous_quantity from public.purchase_returns where purchase_id=p.id;
  returned_net:=round((previous_quantity+new.quantity)*p.unit_price,2)-previous_net;
  new.vat_amount:=new.amount-returned_net;
  due_vat:=prime_private.purchase_vat_due(p.id);
  new.credit_vat_amount:=least(new.credit_amount,greatest(0,new.vat_amount-greatest(0,due_vat)));
  return new;
end $$;
create trigger return_vat_components before insert on public.purchase_returns for each row execute function prime_private.return_vat_components();

create function prime_private.credit_vat_components() returns trigger
language plpgsql security definer set search_path='' as $$
declare available numeric; vat_available numeric; target_due numeric; target_vat numeric;
begin
  available:=prime_private.supplier_credit_available(new.return_id);
  vat_available:=prime_private.supplier_credit_vat_available(new.return_id);
  target_due:=prime_private.purchase_due(new.purchase_id);
  target_vat:=prime_private.purchase_vat_due(new.purchase_id);
  new.vat_amount:=case when available>0 then round(new.amount*vat_available/available,2) else 0 end;
  if new.vat_amount>target_vat or new.amount-new.vat_amount>target_due-target_vat then
    raise exception 'Kreditin net/ƏDV bölgüsü alışın qalıq borcuna uyğun deyil';
  end if;
  return new;
end $$;
create trigger credit_vat_components before insert on public.supplier_credit_allocations for each row execute function prime_private.credit_vat_components();

create function prime_private.split_payment_vat() returns trigger
language plpgsql security definer set search_path='' as $$
declare gross numeric; vat numeric; paid numeric; paid_vat numeric; remaining numeric; remaining_vat numeric; rid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||'finance',0));
  new.vat_amount:=0;
  if new.allocation_type like 'CUSTOMER_%' then
    select prime_private.vehicle_receivable(j.id),case when j.vat_enabled then round(prime_private.vehicle_net_quote(j.id)*0.18,2) else 0 end
      into gross,vat from public.service_jobs j where id=new.service_job_id and organization_id=new.organization_id;
    select coalesce(sum(amount),0),coalesce(sum(vat_amount),0) into paid,paid_vat from public.cash_transactions
      where service_job_id=new.service_job_id and allocation_type like 'CUSTOMER_%' and voided_at is null;
  elsif new.allocation_type='SUPPLIER_PURCHASE' then
    select gross_amount,vat_amount into gross,vat from public.purchases where id=new.purchase_id and organization_id=new.organization_id;
    remaining:=prime_private.purchase_due(new.purchase_id);
    remaining_vat:=prime_private.purchase_vat_due(new.purchase_id);
    paid:=gross-remaining; paid_vat:=vat-remaining_vat;
  elsif new.counterparty_details->>'payment_kind'='SUPPLIER_REFUND' then
    rid:=(new.counterparty_details->>'return_id')::uuid;
    gross:=prime_private.supplier_credit_available(rid);
    vat:=prime_private.supplier_credit_vat_available(rid);
    paid:=0; paid_vat:=0;
  end if;
  if coalesce(vat,0)>0 and gross>0 then
    new.vat_amount:=greatest(0,least(new.amount,vat-paid_vat,round((paid+new.amount)*vat/gross,2)-paid_vat));
  end if;
  return new;
end $$;

create trigger y_vat_split before insert on public.cash_transactions for each row execute function prime_private.split_payment_vat();
revoke all on function prime_private.split_payment_vat(),prime_private.purchase_vat_due(uuid),prime_private.supplier_credit_vat_available(uuid),prime_private.return_vat_components(),prime_private.credit_vat_components() from public,anon,authenticated;

create or replace function public.return_purchase(p_purchase uuid,p_data jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); p public.purchases; j public.service_jobs; old public.purchase_returns;
  q numeric:=(p_data->>'quantity')::numeric; s jsonb; amount numeric; credit numeric; at_time timestamptz:=coalesce((p_data->>'occurred_at')::timestamptz,now());
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  if p_key is null then raise exception 'Əməliyyat açarı tələb olunur'; end if;
  select * into old from public.purchase_returns where id=p_key and organization_id=org;
  if found then
    if old.purchase_id<>p_purchase or old.quantity<>q then raise exception 'Təkrar əməliyyat məlumatları uyğun deyil'; end if;
    return old.id;
  end if;
  select * into p from public.purchases where id=p_purchase and organization_id=org and source_type='SUPPLIER' and voided_at is null;
  if not found then raise exception 'Təchizatçı alışı tapılmadı'; end if;
  select * into j from public.service_jobs where id=p.service_job_id and organization_id=org for update;
  if j.financially_closed_at is not null or j.archived_at is not null or j.deleted_at is not null then raise exception 'Maliyyəsi açıq aktiv servis kartı tələb olunur'; end if;
  perform 1 from public.purchases where id=p.id for update;
  s:=prime_private.purchase_position(p.id);
  if q is null or q<=0 or q<>round(q,3) or q>p.quantity-(s->>'returned_quantity')::numeric then raise exception 'Qaytarılan miqdar alış qalığından artıqdır'; end if;
  if nullif(btrim(p_data->>'reason'),'') is null then raise exception 'Qaytarma səbəbini daxil edin'; end if;
  if (at_time at time zone 'Asia/Baku')::date<p.purchase_date then raise exception 'Qaytarma tarixi alış tarixindən əvvəl ola bilməz'; end if;
  if exists(select 1 from public.cash_transactions where purchase_id=p.id and voided_at is null and occurred_at>at_time)
    or exists(select 1 from public.supplier_credit_allocations where purchase_id=p.id and created_at>at_time)
    or exists(select 1 from public.purchase_returns where purchase_id=p.id and occurred_at>at_time) then raise exception 'Qaytarma tarixi əvvəlki hesablaşmadan əvvəl ola bilməz'; end if;
  -- Cumulative rounding makes the final decimal return equal the exact original total.
  amount:=round(((s->>'returned_quantity')::numeric+q)*p.unit_price,2)+case when p.vat_enabled then round(round(((s->>'returned_quantity')::numeric+q)*p.unit_price,2)*0.18,2) else 0 end-(s->>'returned')::numeric;
  credit:=greatest(0,amount-greatest(0,prime_private.purchase_due(p.id)));
  insert into public.purchase_returns(id,organization_id,purchase_id,service_job_id,supplier_id,quantity,amount,credit_amount,paid_snapshot,reason,occurred_at,created_by,reference_number)
    values(p_key,org,p.id,j.id,coalesce(p.supplier_id,p.historical_supplier_id),q,amount,credit,(s->>'paid')::numeric,p_data->>'reason',at_time,auth.uid(),p_data->>'reference_number');
  if q+(s->>'returned_quantity')::numeric=p.quantity then update public.purchases set lifecycle_closed=true where id=p.id; end if;
  perform prime_private.write_audit(org,auth.uid(),'PURCHASE_RETURNED','purchases',p.id,j.id,j.vehicle_id,case when p.vat_enabled then 'ƏDV-li detal qaytarıldı' else 'Detal qaytarıldı' end,'{}',
    jsonb_build_object('name',coalesce(p.custom_item_name,(select name from public.part_catalog where id=p.part_catalog_id)),'amount',amount,'quantity',q,'credit',credit,'handling',coalesce(p_data->>'handling','CREDIT'),'reason',p_data->>'reason') ||
    (select jsonb_build_object('net_amount',r.net_amount,'vat_amount',r.vat_amount,'gross_amount',r.amount) from public.purchase_returns r where r.id=p_key));
  if credit>0 then perform prime_private.write_audit(org,auth.uid(),'SUPPLIER_CREDIT_CREATED','purchase_returns',p_key,j.id,j.vehicle_id,'Təchizatçı krediti yarandı','{}',jsonb_build_object('amount',credit)); end if;
  if credit>0 and p_data->>'handling'='REFUND' then perform public.refund_supplier_credit(p_key,p_data||jsonb_build_object('amount',credit),gen_random_uuid()); end if;
  return p_key;
end $$;

create or replace function public.exchange_purchase(p_purchase uuid,p_data jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); p public.purchases; existing public.purchase_returns; replacement uuid:=gen_random_uuid(); returned uuid; available numeric;
  q numeric:=(p_data->>'new_quantity')::numeric; price numeric:=(p_data->>'new_unit_price')::numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  select * into existing from public.purchase_returns where id=p_key and organization_id=org;
  if found then
    if existing.purchase_id<>p_purchase or existing.replacement_purchase_id is null then raise exception 'Təkrar əməliyyat məlumatları uyğun deyil'; end if;
    return existing.replacement_purchase_id;
  end if;
  select * into p from public.purchases where id=p_purchase and organization_id=org and voided_at is null;
  if not found then raise exception 'Alış tapılmadı'; end if;
  if q is null or q<=0 or q<>round(q,3) or price is null or price<0 or price<>round(price,2) or q*price<>round(q*price,2) or nullif(btrim(p_data->>'new_name'),'') is null then raise exception 'Yeni detalın adı, miqdarı və qiyməti düzgün deyil'; end if;
  returned:=public.return_purchase(p.id,p_data||jsonb_build_object('quantity',p.quantity-(prime_private.purchase_position(p.id)->>'returned_quantity')::numeric,'handling','CREDIT'),p_key);
  insert into public.purchases(id,owner_user_id,service_job_id,required_part_id,part_catalog_id,custom_item_name,quantity,unit_price,source_type,supplier_id,purchased_by_admin,payment_status,paid_amount,document_no,part_code_oem,purchase_date,notes,replacement_of,replacement_required_part_id,unit_name,vat_enabled)
    values(replacement,auth.uid(),p.service_job_id,coalesce(p.required_part_id,p.replacement_required_part_id),p.part_catalog_id,btrim(p_data->>'new_name'),q,price,'SUPPLIER',p.supplier_id,true,'UNPAID',0,p_data->>'document_no',p_data->>'part_code_oem',coalesce(((p_data->>'occurred_at')::timestamptz at time zone 'Asia/Baku')::date,current_date),left(p_data->>'reason',250),p.id,coalesce(p.required_part_id,p.replacement_required_part_id),coalesce(nullif(btrim(p_data->>'unit_name'),''),'Ədəd'),coalesce((p_data->>'new_vat_enabled')::boolean,p.vat_enabled));
  update public.purchase_returns set replacement_purchase_id=replacement where id=returned;
  available:=least(prime_private.supplier_credit_available(returned),(select gross_amount from public.purchases where id=replacement));
  if available>0 then perform public.apply_supplier_credit(returned,replacement,available,gen_random_uuid()); end if;
  if prime_private.supplier_credit_available(returned)>0 and p_data->>'handling'='REFUND' then perform public.refund_supplier_credit(returned,p_data||jsonb_build_object('amount',prime_private.supplier_credit_available(returned)),gen_random_uuid()); end if;
  perform prime_private.write_audit(org,auth.uid(),'PURCHASE_EXCHANGED','purchases',p.id,p.service_job_id,null,case when p.vat_enabled or coalesce((p_data->>'new_vat_enabled')::boolean,false) then 'ƏDV-li detal dəyişdirildi' else 'Detal dəyişdirildi' end,'{}',
    jsonb_build_object('old_name',coalesce(p.custom_item_name,(select name from public.part_catalog where id=p.part_catalog_id)),'new_name',p_data->>'new_name','old_value',p.total_price,'new_value',q*price,'difference',q*price-p.total_price,'reason',p_data->>'reason','handling',coalesce(p_data->>'handling','CREDIT'),'replacement_id',replacement,'old_gross',p.gross_amount) ||
    (select jsonb_build_object('new_gross',gross_amount,'net_amount',net_amount,'vat_amount',vat_amount) from public.purchases where id=replacement));
  return replacement;
end $$;

create or replace function prime_private.guard_purchase_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='purchases' then
    if new.lifecycle_closed and not exists(select 1 from public.purchase_returns where purchase_id=new.id) then raise exception 'Qaytarma tarixçəsi tələb olunur'; end if;
    if new.replacement_of is not null and not exists(select 1 from public.purchases where id=new.replacement_of and organization_id=new.organization_id and service_job_id=new.service_job_id and lifecycle_closed) then raise exception 'Əvəz edilən alış tapılmadı'; end if;
    if tg_op='UPDATE' and new.replacement_of is distinct from old.replacement_of then raise exception 'Dəyişdirmə əlaqəsi dəyişdirilə bilməz'; end if;
    if tg_op='INSERT' then return new; end if;
  end if;
  if tg_table_name='cash_transactions' then
    if tg_op='INSERT' and new.allocation_type='SUPPLIER_PURCHASE' and new.amount>prime_private.purchase_due(new.purchase_id) then raise exception 'Ödəniş qaytarma və kreditdən sonra qalan borcdan artıqdır'; end if;
    if tg_op='UPDATE' and old.voided_at is null and new.voided_at is not null and exists(select 1 from public.purchase_returns where purchase_id=old.purchase_id) then raise exception 'Qaytarma tarixçəsinə bağlı ödəniş qorunmalıdır'; end if;
  elsif exists(select 1 from public.purchase_returns where purchase_id=old.id) or exists(select 1 from public.supplier_credit_allocations where purchase_id=old.id) then
    if new.supplier_id is null and old.supplier_id is not null and old.supplier_snapshot is not null and not exists(select 1 from public.suppliers where id=old.supplier_id)
      and (to_jsonb(new)-'supplier_id'-'updated_at'-'total_price'-'net_amount'-'vat_amount'-'gross_amount')=(to_jsonb(old)-'supplier_id'-'updated_at'-'total_price'-'net_amount'-'vat_amount'-'gross_amount') then return new; end if;
    if new.lifecycle_closed is distinct from old.lifecycle_closed and (not new.lifecycle_closed or new.quantity<>(prime_private.purchase_position(new.id)->>'returned_quantity')::numeric) then raise exception 'Alışın qaytarma statusu tarixçə ilə uyğun deyil'; end if;
    if (to_jsonb(new)-'updated_at'-'total_price'-'net_amount'-'vat_amount'-'gross_amount'-'paid_amount'-'payment_status'-'lifecycle_closed') is distinct from (to_jsonb(old)-'updated_at'-'total_price'-'net_amount'-'vat_amount'-'gross_amount'-'paid_amount'-'payment_status'-'lifecycle_closed') then raise exception 'Qaytarma və kredit tarixçəsi olan alış dəyişdirilə bilməz'; end if;
  end if;
  return new;
end $$;

create or replace function public.sync_purchase_payment() returns trigger
language plpgsql security definer set search_path='' as $$
declare paid numeric; total numeric;
begin
  if new.purchase_id is not null then
    select coalesce(sum(amount),0) into paid from public.cash_transactions where purchase_id=new.purchase_id and voided_at is null;
    select gross_amount into total from public.purchases where id=new.purchase_id;
    update public.purchases set paid_amount=paid,payment_status=case when paid=0 then 'UNPAID'::public.payment_status when paid>=total then 'PAID'::public.payment_status else 'PARTIAL'::public.payment_status end where id=new.purchase_id;
  end if;
  return new;
end $$;

alter function public.finance_data(text,uuid) rename to finance_data_0013;
revoke all on function public.finance_data_0013(text,uuid) from public,anon,authenticated;
create function public.finance_data(p_kind text,p_job uuid default null) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
begin
  if p_kind='vat_ledger' then
    return query select to_jsonb(v)||jsonb_build_object('party',coalesce(t.counterparty_name_snapshot,''),'channel',t.channel,'plate',car.plate,
      'balance',sum(case v.direction when 'IN' then v.amount else -v.amount end) over(order by v.occurred_at,v.posting_order rows unbounded preceding))
    from public.vat_ledger v left join public.cash_transactions t on t.id=v.cash_transaction_id
    left join public.service_jobs j on j.id=v.service_job_id left join public.vehicles car on car.id=j.vehicle_id
    where v.organization_id=org order by v.occurred_at,v.posting_order;
  elsif p_kind='jobs' then
    return query select r||jsonb_build_object('vat_enabled',j.vat_enabled,'net_quotation',prime_private.vehicle_net_quote(j.id),
      'gross_quotation',prime_private.vehicle_receivable(j.id),'vat_quotation',prime_private.vehicle_receivable(j.id)-prime_private.vehicle_net_quote(j.id))
    from public.finance_data_0013(p_kind,p_job) r join public.service_jobs j on j.id=(r->>'id')::uuid and j.organization_id=org;
  elsif p_kind='purchases' then
    return query select r||jsonb_build_object('vat_enabled',p.vat_enabled,'net_amount',p.net_amount,'vat_amount',p.vat_amount,'gross_amount',p.gross_amount,
      'returned_net',coalesce((select sum(net_amount) from public.purchase_returns where purchase_id=p.id),0),
      'cost',p.net_amount-coalesce((select sum(net_amount) from public.purchase_returns where purchase_id=p.id),0),
      'remaining_vat',prime_private.purchase_vat_due(p.id),'remaining_net',prime_private.purchase_due(p.id)-prime_private.purchase_vat_due(p.id),
      'paid_vat',coalesce((select sum(vat_amount) from public.cash_transactions where purchase_id=p.id and voided_at is null),0))
    from public.finance_data_0013(p_kind,p_job) r join public.purchases p on p.id=(r->>'id')::uuid and p.organization_id=org;
  else return query select * from public.finance_data_0013(p_kind,p_job);
  end if;
end $$;
revoke all on function public.finance_data(text,uuid) from public,anon,authenticated;
grant execute on function public.finance_data(text,uuid) to authenticated;

-- Preserve the existing signed-source selection, but snapshot operating balances
-- from net cash movements. External renderers still suppress account balances.
alter function prime_private.reconciliation_source(text,uuid,date) rename to reconciliation_source_0013;
revoke all on function prime_private.reconciliation_source_0013(text,uuid,date) from public,anon,authenticated;
create function prime_private.reconciliation_source(p_type text,p_entity uuid,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; rows jsonb;
begin
  result:=prime_private.reconciliation_source_0013(p_type,p_entity,p_to);
  with chronology as (
    select r, sum(case when r->>'voided_at' is not null then 0 when r->>'direction'='IN' then (r->>'net_amount')::numeric else -(r->>'net_amount')::numeric end)
      over(partition by r->>'channel',r->>'financial_account_id',r->>'currency' order by (r->>'occurred_at')::timestamptz,r->>'id' rows unbounded preceding) balance
    from public.finance_data('ledger') r where (r->>'transaction_date')::date<=p_to
  ) select coalesce(jsonb_agg(r||jsonb_build_object('account_balance',balance) order by r->>'id'),'[]') into rows
    from chronology where r->>case when p_type='worker' then 'worker_identity_id' else 'supplier_identity_id' end=p_entity::text;
  return jsonb_set(result,'{ledger}',rows);
end $$;
revoke all on function prime_private.reconciliation_source(text,uuid,date) from public,anon,authenticated;

create or replace function prime_private.guard_financial_closure() returns trigger language plpgsql set search_path='' as $$
declare jid uuid;
begin
 if tg_table_name='service_jobs' then
  if tg_op='INSERT' and (new.financially_closed_at is not null or new.financially_closed_by is not null) then raise exception 'Yeni servis kartı maliyyəsi açıq yaradılmalıdır'; end if;
  if tg_op='UPDATE' and (new.financially_closed_at is distinct from old.financially_closed_at or new.financially_closed_by is distinct from old.financially_closed_by) and current_user in ('authenticated','anon') then raise exception 'Maliyyə bağlanmasını hesablaşma vasitəsilə edin'; end if;
  if tg_op='UPDATE' and old.financially_closed_at is not null and (new.agreed_budget is distinct from old.agreed_budget or new.has_line_quotes is distinct from old.has_line_quotes or new.vat_enabled is distinct from old.vat_enabled) then raise exception 'Əvvəlcə maliyyəni yenidən açın'; end if;
  return new;
 end if;
 jid:=new.service_job_id;
 perform 1 from public.service_jobs where id=jid for update;
 if exists(select 1 from public.service_jobs where id=jid and financially_closed_at is not null) then
  if tg_table_name='purchases' and tg_op='UPDATE' and new.supplier_id is null and old.supplier_snapshot is not null and not exists(select 1 from public.suppliers where id=old.supplier_id) and (to_jsonb(new)-'supplier_id'-'updated_at'-'total_price'-'net_amount'-'vat_amount'-'gross_amount')=(to_jsonb(old)-'supplier_id'-'updated_at'-'total_price'-'net_amount'-'vat_amount'-'gross_amount') then return new; end if;
  raise exception 'Əvvəlcə avtomobil maliyyəsini yenidən açın';
 end if;
 return new;
end $$;

-- A settled VAT invoice cannot be silently repriced. Reverse its payments first;
-- ordinary work status/cost/note edits remain available.
create function prime_private.guard_settled_vat_price() returns trigger
language plpgsql security definer set search_path='' as $$
declare jid uuid; changed boolean; enabled boolean;
begin
  if tg_table_name='purchases' then
    if tg_op<>'UPDATE' then return new; end if;
    changed:=new.quantity is distinct from old.quantity or new.unit_price is distinct from old.unit_price;
    if old.vat_enabled and changed and exists(select 1 from public.cash_transactions where purchase_id=old.id and voided_at is null) then
      raise exception 'ƏDV-li alışın qiymətini dəyişmək üçün əvvəlcə bağlı ödənişləri ləğv edin';
    end if;
    return new;
  end if;
  if tg_table_name='service_jobs' then
    if tg_op<>'UPDATE' then return new; end if;
    jid:=new.id;
    changed:=new.agreed_budget is distinct from old.agreed_budget or new.has_line_quotes is distinct from old.has_line_quotes;
    enabled:=old.vat_enabled;
  else
    jid:=coalesce(new.service_job_id,old.service_job_id);
    select vat_enabled into enabled from public.service_jobs where id=jid;
    changed:=tg_op in ('INSERT','DELETE');
    if tg_op='UPDATE' then changed:=new.quantity is distinct from old.quantity or new.customer_unit_price is distinct from old.customer_unit_price or new.quoted_price is distinct from old.quoted_price; end if;
  end if;
  if enabled and changed and exists(select 1 from public.cash_transactions where service_job_id=jid and allocation_type like 'CUSTOMER_%' and voided_at is null) then
    raise exception 'ƏDV-li təklifi dəyişmək üçün əvvəlcə müştəri ödənişlərini ləğv edin';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger zz_settled_vat_price before update on public.service_jobs for each row execute function prime_private.guard_settled_vat_price();
create trigger zz_settled_vat_price before update on public.purchases for each row execute function prime_private.guard_settled_vat_price();
create trigger zz_settled_vat_price before insert or update or delete on public.job_work_items for each row execute function prime_private.guard_settled_vat_price();
create trigger zz_settled_vat_price before insert or update or delete on public.job_required_parts for each row execute function prime_private.guard_settled_vat_price();
revoke all on function prime_private.guard_settled_vat_price() from public,anon,authenticated;

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
    or exists(select 1 from public.job_required_parts r where r.service_job_id=j.id and not exists(select 1 from public.purchases p where coalesce(p.required_part_id,p.replacement_required_part_id)=r.id and p.voided_at is null and p.quantity>(prime_private.purchase_position(p.id)->>'returned_quantity')::numeric)) then raise exception 'Maya dəyəri daxil edilməyib'; end if;
  select coalesce(sum(amount),0) into paid from public.cash_transactions where service_job_id=j.id and allocation_type like 'CUSTOMER_%' and voided_at is null;
  due:=prime_private.vehicle_receivable(j.id)-paid;
  if due<>0 then raise exception 'Müştəri borcu bağlanmayıb'; end if;
  if exists(select 1 from public.purchases p where p.service_job_id=j.id and p.source_type='SUPPLIER' and p.voided_at is null and prime_private.purchase_due(p.id)>0)
    or exists(select 1 from public.job_work_items w where w.service_job_id=j.id and w.status<>'CANCELLED' and w.labor_cost>prime_private.worker_paid(w.id)) then raise exception 'Öhdəliklər tam ödənilməyib'; end if;
  if exists(select 1 from public.purchases p where p.service_job_id=j.id and p.source_type='SUPPLIER' and p.voided_at is null and prime_private.purchase_due(p.id)<0)
    or exists(select 1 from public.job_work_items w where w.service_job_id=j.id and w.labor_cost<prime_private.worker_paid(w.id)) then raise exception 'Artıq ödəniş var; əvvəlcə uzlaşdırın'; end if;
  select jsonb_build_object('part_cost',coalesce((select sum(p.net_amount-coalesce((select sum(r.net_amount) from public.purchase_returns r where r.purchase_id=p.id),0)) from public.purchases p where service_job_id=j.id and voided_at is null),0),
    'worker_cost',coalesce((select sum(labor_cost) from public.job_work_items where service_job_id=j.id and status<>'CANCELLED'),0),
    'other_expenses',coalesce(sum(net_amount) filter(where allocation_type='VEHICLE_EXPENSE'),0),
    'supplier_paid',coalesce(sum(amount) filter(where allocation_type='SUPPLIER_PURCHASE'),0),
    'worker_paid',coalesce(sum(amount) filter(where allocation_type='WORKER_WORK_ITEM'),0),
    'applied_advance',coalesce((select sum(prime_private.worker_applied_advance(w.id)) from public.job_work_items w where w.service_job_id=j.id),0),
    'other_expense_paid',coalesce(sum(net_amount) filter(where allocation_type='VEHICLE_EXPENSE'),0),
    'outgoing_paid',coalesce(sum(net_amount) filter(where direction='OUT'),0),
    'vat_amount',coalesce(sum(vat_amount) filter(where direction='OUT'),0)) into snapshot from public.cash_transactions where service_job_id=j.id and voided_at is null;
  snapshot:=snapshot||jsonb_build_object('cost',(snapshot->>'part_cost')::numeric+(snapshot->>'worker_cost')::numeric+(snapshot->>'other_expenses')::numeric,'customer_received',paid,'customer_due',due,'completed_count',completed_count);
  update public.service_jobs set financially_closed_at=now(),financially_closed_by=auth.uid() where id=j.id;
  perform prime_private.write_audit(org,auth.uid(),'VEHICLE_FINANCE_CLOSED','service_jobs',j.id,j.id,j.vehicle_id,'Maliyyə bağlandı','{}',snapshot);
  perform prime_private.write_audit(org,auth.uid(),'VEHICLE_WORK_COMPLETED','service_jobs',j.id,j.id,j.vehicle_id,'Maliyyə bağlanarkən işlər tamamlandı','{}',jsonb_build_object('completed_count',completed_count));
end $$;
commit;
