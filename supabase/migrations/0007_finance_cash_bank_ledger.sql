begin;

-- Extend the existing ledger in place: no historical payment is copied.
create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check(length(trim(name)) between 1 and 120),
  bank_name text, iban text, currency text not null default 'AZN' check(currency='AZN'),
  account_holder text, tax_id text, swift text, notes text check(length(notes)<=250),
  active boolean not null default true, created_at timestamptz not null default now()
);
create table public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check(length(trim(name)) between 1 and 120),
  direction text not null check(direction in ('IN','OUT')),
  active boolean not null default true,
  unique(organization_id,name,direction)
);
insert into public.transaction_categories(organization_id,name,direction)
select o.id,c.name,c.direction from public.organizations o cross join (values
 ('Müştəri ödənişi','IN'),('Müştəri avansı','IN'),('Digər gəlir','IN'),('Geri qaytarılmış vəsait','IN'),('Digər mədaxil','IN'),
 ('Təchizatçı ödənişi','OUT'),('Usta ödənişi','OUT'),('Əlavə avtomobil xərci','OUT'),('Yanacaq','OUT'),('Çatdırılma','OUT'),
 ('Alət / avadanlıq','OUT'),('Material','OUT'),('Kommunal','OUT'),('İcarə','OUT'),('Bank komissiyası','OUT'),('POS komissiyası','OUT'),
 ('Əmək haqqı / personal','OUT'),('Fövqəladə xərc','OUT'),('Digər məxaric','OUT')) c(name,direction);
do $$ declare t text; begin
  foreach t in array array['financial_accounts','transaction_categories'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy finance_read on public.%I for select to authenticated using(organization_id=prime_private.organization_id() and prime_private.has_role(array[''ADMIN'',''CASHIER'']::public.app_role[]))',t);
  end loop;
end $$;

alter table public.service_jobs add column financially_closed_at timestamptz,
  add column financially_closed_by uuid references auth.users(id);
alter table public.purchases add column supplier_snapshot jsonb,
  add column historical_supplier_id uuid;
alter table public.purchases drop constraint partial_payment_bounds;
alter table public.purchases add constraint partial_payment_bounds check (
 (payment_status='UNPAID' and paid_amount=0) or
 (payment_status='PAID' and paid_amount>=quantity*unit_price) or
 (payment_status='PARTIAL' and paid_amount>0 and paid_amount<quantity*unit_price));
-- Snapshot identity before the master can ever be deleted.
alter table public.purchases disable trigger user;
update public.purchases p set supplier_snapshot=jsonb_build_object('id',s.id,'company_name',s.company_name,'shop_name',s.shop_name,'first_name',s.first_name,'last_name',s.last_name,'father_name',s.father_name,'tax_id_voen',s.tax_id_voen,'phone',s.phone,'address',s.address),historical_supplier_id=s.id
from public.suppliers s where s.id=p.supplier_id;
alter table public.purchases enable trigger user;
alter table public.purchases drop constraint supplier_required_when_supplier;
alter table public.purchases add constraint supplier_identity_required check(source_type<>'SUPPLIER' or supplier_id is not null or supplier_snapshot is not null);
alter table public.purchases drop constraint purchases_supplier_id_fkey;
alter table public.purchases add constraint purchases_supplier_id_fkey foreign key(supplier_id) references public.suppliers(id) on delete set null;

alter table public.cash_transactions alter column service_job_id drop not null;
alter table public.cash_transactions alter column direction drop expression;
alter table public.cash_transactions add column channel text not null default 'CASH' check(channel in ('CASH','BANK')),
 add column financial_account_id uuid references public.financial_accounts(id),
 add column currency text not null default 'AZN' check(currency='AZN'),
 add column payment_method text not null default 'CASH' check(payment_method in ('CASH','TRANSFER','POS','ONLINE','OTHER')),
 add column category_id uuid references public.transaction_categories(id),
 add column purpose text not null default '' check(length(purpose)<=500),
 add column counterparty_name_snapshot text,
 add column counterparty_details jsonb not null default '{}',
 add column supplier_identity_id uuid,
 add column worker_identity_id uuid,
 add column reference_number text,
 add column bank_reference text,
 add column payment_order_number text,
 add column supporting_reference text,
 add column occurred_at timestamptz,
 add column transfer_id uuid,
 add column created_by_name text;
alter table public.cash_reversals alter column service_job_id drop not null;
-- Existing allocation columns ARE allocation records, one target per movement.
-- New customer receipts target the vehicle receivable, not private sale lines.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.cash_transactions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%allocation_type%' loop
  execute format('alter table public.cash_transactions drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.cash_transactions add constraint cash_allocation_type check(allocation_type in
 ('CUSTOMER_WORK','CUSTOMER_PART','CUSTOMER_BUDGET','CUSTOMER_VEHICLE','SUPPLIER_PURCHASE','WORKER_WORK_ITEM','GENERAL_IN','GENERAL_OUT','VEHICLE_EXPENSE','TRANSFER_IN','TRANSFER_OUT','OPENING_IN','OPENING_OUT'));
alter table public.cash_transactions add constraint cash_allocation_target check(
 (allocation_type in ('CUSTOMER_WORK','WORKER_WORK_ITEM') and work_item_id is not null and required_part_id is null and purchase_id is null and service_job_id is not null)
 or (allocation_type='CUSTOMER_PART' and required_part_id is not null and work_item_id is null and purchase_id is null and service_job_id is not null)
 or (allocation_type='SUPPLIER_PURCHASE' and purchase_id is not null and work_item_id is null and required_part_id is null and service_job_id is not null)
 or (allocation_type not in ('CUSTOMER_WORK','CUSTOMER_PART','SUPPLIER_PURCHASE','WORKER_WORK_ITEM') and work_item_id is null and required_part_id is null and purchase_id is null));
alter table public.cash_transactions add constraint cash_account_channel check(
 (channel='CASH' and financial_account_id is null and payment_method='CASH') or
 (channel='BANK' and financial_account_id is not null and payment_method<>'CASH'));
alter table public.cash_transactions disable trigger user;
update public.cash_transactions t set occurred_at=(t.transaction_date::timestamp at time zone 'Asia/Baku'),
 created_by_name=(select display_name from public.user_profiles where auth_user_id=t.owner_user_id),
 counterparty_name_snapshot=case when t.allocation_type like 'CUSTOMER_%' then j.customer_name
 when t.allocation_type='SUPPLIER_PURCHASE' then coalesce(s.company_name,s.shop_name,concat_ws(' ',s.first_name,s.last_name))
 else concat_ws(' ',w.first_name,w.last_name) end,
 supplier_identity_id=p.supplier_id,worker_identity_id=wi.assigned_worker_id
from public.service_jobs j left join public.purchases p on p.service_job_id=j.id
 left join public.suppliers s on s.id=p.supplier_id
 left join public.job_work_items wi on wi.service_job_id=j.id
 left join public.workers w on w.id=wi.assigned_worker_id
where t.service_job_id=j.id and (t.purchase_id is null or t.purchase_id=p.id) and (t.work_item_id is null or t.work_item_id=wi.id);
-- Non-supplier/non-worker receipts must not inherit an unrelated identity from the join.
update public.cash_transactions set supplier_identity_id=null where allocation_type<>'SUPPLIER_PURCHASE';
update public.cash_transactions set worker_identity_id=null where allocation_type<>'WORKER_WORK_ITEM';
alter table public.cash_transactions enable trigger user;
create index ledger_org_account_date on public.cash_transactions(organization_id,channel,financial_account_id,transaction_date);
create index ledger_org_category_date on public.cash_transactions(organization_id,category_id,transaction_date);
create index ledger_transfer on public.cash_transactions(transfer_id) where transfer_id is not null;

create function prime_private.vehicle_receivable(p_job uuid) returns numeric language sql stable set search_path='' as $$
 select case when j.has_line_quotes then
 coalesce((select sum(quoted_price) from public.job_work_items where service_job_id=j.id),0)+coalesce((select sum(quoted_price) from public.job_required_parts where service_job_id=j.id),0)
 else j.agreed_budget+coalesce((select sum(quoted_price) from public.job_work_items where service_job_id=j.id and is_additional),0)+coalesce((select sum(quoted_price) from public.job_required_parts where service_job_id=j.id and is_additional),0) end
 from public.service_jobs j where j.id=p_job
$$;

-- Keep legacy target validation for old allocation types; new types are validated here.
alter function public.validate_cash_transaction() rename to validate_cash_transaction_legacy;
create function public.validate_cash_transaction() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare cap numeric; paid numeric; j public.service_jobs; w public.job_work_items; p public.purchases; a public.financial_accounts;
begin
 if tg_op='UPDATE' then
  if (to_jsonb(new)-'voided_at'-'void_reason') is distinct from (to_jsonb(old)-'voided_at'-'void_reason') or old.voided_at is not null or new.voided_at is null or nullif(trim(new.void_reason),'') is null then raise exception 'Ödəniş yalnız səbəb göstərilməklə ləğv edilə bilər'; end if;
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
  cap:=p.total_price;
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
drop trigger b_validate_cash on public.cash_transactions;
create trigger b_validate_cash before insert or update on public.cash_transactions for each row execute function public.validate_cash_transaction();

create function public.save_financial_master(p_kind text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); result uuid; event text;
begin
 if coalesce(p_data->>'currency','AZN')<>'AZN' then raise exception 'Yalnız AZN hesabı dəstəklənir'; end if;
 if p_kind='account' then
  if nullif(p_data->>'id','') is null then
   insert into public.financial_accounts(organization_id,name,bank_name,iban,account_holder,tax_id,swift,notes)
   values(org,p_data->>'name',p_data->>'bank_name',p_data->>'iban',p_data->>'account_holder',p_data->>'tax_id',p_data->>'swift',p_data->>'notes') returning id into result;
   event:='BANK_ACCOUNT_CREATED';
  else
   update public.financial_accounts set name=p_data->>'name',bank_name=p_data->>'bank_name',iban=p_data->>'iban',account_holder=p_data->>'account_holder',tax_id=p_data->>'tax_id',swift=p_data->>'swift',notes=p_data->>'notes',active=coalesce((p_data->>'active')::boolean,true)
   where id=(p_data->>'id')::uuid and organization_id=org returning id into result;
   event:=case when p_data->>'active'='false' then 'BANK_ACCOUNT_ARCHIVED' else 'BANK_ACCOUNT_UPDATED' end;
  end if;
 elsif p_kind='category' then
  insert into public.transaction_categories(organization_id,name,direction) values(org,trim(p_data->>'name'),p_data->>'direction')
  on conflict(organization_id,name,direction) do update set active=true returning id into result;
  event:='TRANSACTION_CATEGORY_CREATED';
 else raise exception 'Naməlum əməliyyat'; end if;
 if result is null then raise exception 'Qeyd tapılmadı'; end if;
 perform prime_private.write_audit(org,auth.uid(),event,p_kind,result,null,null,event);
 return result;
end $$;

create function public.record_financial_transaction(p_data jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]); result uuid; kind text:=p_data->>'allocation_type'; amount numeric:=(p_data->>'amount')::numeric;
begin
 if p_key is null then raise exception 'Əməliyyat açarı tələb olunur'; end if;
 if coalesce(p_data->>'currency','AZN')<>'AZN' then raise exception 'Yalnız AZN dəstəklənir'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
 select id into result from public.cash_transactions where organization_id=org and idempotency_key=p_key;
 if found then return result; end if;
 if kind not in ('CUSTOMER_VEHICLE','SUPPLIER_PURCHASE','WORKER_WORK_ITEM','GENERAL_IN','GENERAL_OUT','VEHICLE_EXPENSE','OPENING_IN','OPENING_OUT') or kind is null then raise exception 'Əməliyyat növü düzgün deyil'; end if;
 if amount is null or amount<=0 or amount<>round(amount,2) or amount>9999999999.99 then raise exception 'Məbləğ düzgün deyil'; end if;
 if length(trim(coalesce(p_data->>'purpose',''))) not between 1 and 500 then raise exception 'Təyinat tələb olunur'; end if;
 if kind in ('GENERAL_IN','GENERAL_OUT','VEHICLE_EXPENSE') and nullif(p_data->>'category_id','') is null then raise exception 'Kateqoriya seçin'; end if;
 insert into public.cash_transactions(owner_user_id,service_job_id,allocation_type,work_item_id,purchase_id,amount,idempotency_key,channel,financial_account_id,payment_method,category_id,purpose,counterparty_name_snapshot,counterparty_details,reference_number,bank_reference,payment_order_number,supporting_reference,occurred_at,notes)
 values(auth.uid(),nullif(p_data->>'service_job_id','')::uuid,kind,
 case when kind='WORKER_WORK_ITEM' then (p_data->>'target_id')::uuid end,case when kind='SUPPLIER_PURCHASE' then (p_data->>'target_id')::uuid end,amount,p_key,
 p_data->>'channel',nullif(p_data->>'financial_account_id','')::uuid,case when p_data->>'channel'='CASH' then 'CASH' else coalesce(p_data->>'payment_method','TRANSFER') end,
 nullif(p_data->>'category_id','')::uuid,trim(p_data->>'purpose'),nullif(trim(p_data->>'counterparty_name'),''),coalesce(p_data->'counterparty_details','{}'),
 p_data->>'reference_number',p_data->>'bank_reference',p_data->>'payment_order_number',p_data->>'supporting_reference',(p_data->>'occurred_at')::timestamptz,p_data->>'notes') returning id into result;
 return result;
end $$;

create function public.transfer_financial_funds(p_from uuid,p_to uuid,p_amount numeric,p_at timestamptz,p_note text,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
begin
 if p_key is null then raise exception 'Əməliyyat açarı tələb olunur'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
 if exists(select 1 from public.cash_transactions where organization_id=org and transfer_id=p_key) then return p_key; end if;
 if p_from is not distinct from p_to or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Köçürmə məlumatları düzgün deyil'; end if;
 insert into public.cash_transactions(owner_user_id,allocation_type,amount,idempotency_key,channel,financial_account_id,payment_method,purpose,occurred_at,transfer_id,notes)
 values(auth.uid(),'TRANSFER_OUT',p_amount,p_key,case when p_from is null then 'CASH' else 'BANK' end,p_from,case when p_from is null then 'CASH' else 'TRANSFER' end,'Daxili köçürmə',p_at,p_key,p_note),
 (auth.uid(),'TRANSFER_IN',p_amount,gen_random_uuid(),case when p_to is null then 'CASH' else 'BANK' end,p_to,case when p_to is null then 'CASH' else 'TRANSFER' end,'Daxili köçürmə',p_at,p_key,p_note);
 perform prime_private.write_audit(org,auth.uid(),'INTERNAL_TRANSFER_CREATED','cash_transactions',p_key,null,null,'Daxili köçürmə','{}',jsonb_build_object('amount',p_amount,'from',p_from,'to',p_to));
 return p_key;
end $$;

create function prime_private.snapshot_supplier() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.supplier_id is not null and (tg_op='INSERT' or new.supplier_id is distinct from old.supplier_id) then
  select jsonb_build_object('id',id,'company_name',company_name,'shop_name',shop_name,'first_name',first_name,'last_name',last_name,'father_name',father_name,'tax_id_voen',tax_id_voen,'phone',phone,'address',address)
  into new.supplier_snapshot from public.suppliers where id=new.supplier_id and organization_id=new.organization_id;
  new.historical_supplier_id:=new.supplier_id;
 elsif tg_op='UPDATE' and (new.supplier_snapshot is distinct from old.supplier_snapshot or new.historical_supplier_id is distinct from old.historical_supplier_id) then
  raise exception 'Tarixi təchizatçı məlumatı dəyişdirilə bilməz';
 end if;
 if tg_op='INSERT' and new.source_type='SUPPLIER' and new.supplier_id is null then raise exception 'Təchizatçı seçin'; end if;
 return new;
end $$;
create trigger ac_supplier_snapshot before insert or update on public.purchases for each row execute function prime_private.snapshot_supplier();

-- Retain every existing paid-work/cost guard; only allow FK detachment after the
-- referenced supplier has actually been deleted and its snapshot already exists.
create or replace function public.guard_financial_edits() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare paid numeric;
begin
 perform 1 from service_jobs where id=coalesce(new.service_job_id,old.service_job_id) for update;
 if tg_op='DELETE' then raise exception 'Maliyyə tarixçəsi silinə bilməz; arxiv və ya ləğv istifadə edin'; end if;
 if tg_table_name='purchases' then
  if tg_op='UPDATE' and old.supplier_id is not null and new.supplier_id is null and old.supplier_snapshot is not null
   and not exists(select 1 from suppliers where id=old.supplier_id)
   and (to_jsonb(new)-'supplier_id'-'updated_at'-'total_price')=(to_jsonb(old)-'supplier_id'-'updated_at'-'total_price') then return new; end if;
  if pg_trigger_depth()<2 and ((tg_op='INSERT' and new.source_type='SUPPLIER' and new.paid_amount<>0) or (tg_op='UPDATE' and (new.paid_amount<>old.paid_amount or new.payment_status<>old.payment_status))) then raise exception 'Ödənişi Kassa vasitəsilə daxil edin'; end if;
  select coalesce(sum(amount),0) into paid from cash_transactions where purchase_id=new.id and voided_at is null;
  if new.quantity*new.unit_price<>round(new.quantity*new.unit_price,2) then raise exception 'Alış cəmi ən çox iki onluq rəqəm ola bilər'; end if;
  if new.source_type='SUPPLIER' then
   new.paid_amount:=paid;
   new.payment_status:=case when paid=0 then 'UNPAID'::payment_status when paid>=new.quantity*new.unit_price then 'PAID'::payment_status else 'PARTIAL'::payment_status end;
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

-- Corrections change obligations, never historic money. Negative balances remain
-- visible as credits and prevent closure until explicitly reconciled.
create or replace function public.guard_legacy_budget() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.has_line_quotes is distinct from old.has_line_quotes and exists(select 1 from cash_transactions where service_job_id=new.id and allocation_type='CUSTOMER_BUDGET' and voided_at is null) then raise exception 'Əvvəlki büdcə üzrə ödənişlər qorunmalıdır'; end if;
 return new;
end $$;

create function public.delete_supplier_permanently(p_id uuid,p_confirmation text) returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); s public.suppliers; label text;
begin
 if p_confirmation is distinct from 'SİL' then raise exception 'Təsdiq üçün SİL yazın'; end if;
 select * into s from public.suppliers where id=p_id and organization_id=org for update;
 if not found then raise exception 'Təchizatçı tapılmadı'; end if;
 label:=coalesce(s.company_name,s.shop_name,concat_ws(' ',s.first_name,s.last_name));
 perform prime_private.write_audit(org,auth.uid(),'SUPPLIER_PERMANENTLY_DELETED','suppliers',s.id,null,null,'Təchizatçı həmişəlik silindi','{}',jsonb_build_object('name',label,'tax_id',s.tax_id_voen));
 delete from public.suppliers where id=s.id;
end $$;

create function prime_private.audit_financial_movement() returns trigger language plpgsql security definer set search_path='' as $$
declare event text;
begin
 if tg_op='UPDATE' then event:='FINANCIAL_TRANSACTION_REVERSED';
 else event:=new.channel||'_'||new.direction||'_CREATED'; end if;
 perform prime_private.write_audit(new.organization_id,auth.uid(),event,'cash_transactions',new.id,new.service_job_id,null,event,'{}',jsonb_build_object('amount',new.amount,'channel',new.channel,'account_id',new.financial_account_id,'transfer_id',new.transfer_id));
 if tg_op='INSERT' then
  event:=case when new.allocation_type like 'CUSTOMER_%' then 'CUSTOMER_PAYMENT_CREATED' when new.allocation_type='SUPPLIER_PURCHASE' then 'SUPPLIER_PAYMENT_CREATED' when new.allocation_type='WORKER_WORK_ITEM' then 'WORKER_PAYMENT_CREATED' when new.allocation_type='GENERAL_IN' then 'GENERAL_INCOME_CREATED' when new.allocation_type in ('GENERAL_OUT','VEHICLE_EXPENSE') then 'GENERAL_EXPENSE_CREATED' end;
  if event is not null then perform prime_private.write_audit(new.organization_id,auth.uid(),event,'cash_transactions',new.id,new.service_job_id,null,event,'{}',jsonb_build_object('amount',new.amount)); end if;
 end if;
 return new;
end $$;
drop trigger z_audit on public.cash_transactions;
create trigger z_audit after insert or update on public.cash_transactions for each row execute function prime_private.audit_financial_movement();

create or replace function public.void_cash_payment(p_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); t public.cash_transactions; item public.cash_transactions; result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
 if length(trim(p_reason)) not between 1 and 250 or p_reason is null then raise exception 'Ləğv səbəbi tələb olunur'; end if;
 select * into t from public.cash_transactions where id=p_id and organization_id=org;
 if not found then raise exception 'Ödəniş tapılmadı' using errcode='42501'; end if;
 for item in select * from public.cash_transactions where organization_id=org and (id=t.id or (t.transfer_id is not null and transfer_id=t.transfer_id)) order by id loop
  perform 1 from public.service_jobs where id=item.service_job_id for update;
  if exists(select 1 from public.service_jobs where id=item.service_job_id and financially_closed_at is not null) then raise exception 'Əvvəlcə avtomobil maliyyəsini yenidən açın'; end if;
  if item.voided_at is null then
   update public.cash_transactions set voided_at=now(),void_reason=trim(p_reason) where id=item.id;
   insert into public.cash_reversals(organization_id,transaction_id,service_job_id,actor_user_id,amount,direction,reason)
   values(org,item.id,item.service_job_id,auth.uid(),item.amount,case when item.direction='IN' then 'OUT' else 'IN' end,trim(p_reason)) returning id into result;
  else select id into result from public.cash_reversals where transaction_id=item.id; end if;
 end loop;
 return result;
end $$;

-- Base quote rows are no longer accessible to CASHIER. A whitelist RPC supplies
-- obligations and aggregate receivables without loading line prices or profit.
drop policy org_read on public.job_work_items;
create policy org_read on public.job_work_items for select to authenticated using(organization_id=prime_private.organization_id() and prime_private.has_role(array['ADMIN']::public.app_role[]));
drop policy org_read on public.job_required_parts;
create policy org_read on public.job_required_parts for select to authenticated using(organization_id=prime_private.organization_id() and prime_private.has_role(array['ADMIN','INTAKE']::public.app_role[]));
drop policy org_read on public.service_jobs;
create policy org_read on public.service_jobs for select to authenticated using(organization_id=prime_private.organization_id() and prime_private.has_role(array['ADMIN','INTAKE']::public.app_role[]));

create function public.finance_data(p_kind text,p_job uuid default null) returns setof jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
begin
 if p_kind='jobs' then
  return query select jsonb_build_object('id',j.id,'job_no',j.job_no,'plate',v.plate,'model',concat_ws(' ',v.make,v.model),'customer_name',j.customer_name,'closed_at',j.financially_closed_at,'inactive',j.deleted_at is not null or j.archived_at is not null,
   'customer_due',prime_private.vehicle_receivable(j.id)-coalesce((select sum(amount) from public.cash_transactions where service_job_id=j.id and allocation_type like 'CUSTOMER_%' and voided_at is null),0),
   'missing_costs',(select count(*) from public.job_work_items where service_job_id=j.id and status<>'CANCELLED' and (not labor_cost_known or assigned_worker_id is null))+(select count(*) from public.job_required_parts r where r.service_job_id=j.id and not exists(select 1 from public.purchases p where p.required_part_id=r.id and p.voided_at is null)))
  from public.service_jobs j join public.vehicles v on v.id=j.vehicle_id where j.organization_id=org and (p_job is null or j.id=p_job) order by j.id;
 elsif p_kind='work' then
  return query select jsonb_build_object('id',w.id,'service_job_id',w.service_job_id,'title',coalesce(w.custom_title,c.name,'Digər iş'),'worker_id',w.assigned_worker_id,'worker',concat_ws(' ',u.first_name,u.last_name),'status',w.status,'labor_cost',w.labor_cost,'labor_cost_known',w.labor_cost_known,'is_additional',w.is_additional)
  from public.job_work_items w left join public.work_catalog c on c.id=w.work_catalog_id left join public.workers u on u.id=w.assigned_worker_id where w.organization_id=org and (p_job is null or w.service_job_id=p_job) order by w.id;
 elsif p_kind='purchases' then
  return query select jsonb_build_object('id',p.id,'service_job_id',p.service_job_id,'title',coalesce(p.custom_item_name,c.name,'Detal'),'cost',p.total_price,'source_type',p.source_type,'supplier_id',coalesce(p.supplier_id,p.historical_supplier_id),'supplier',coalesce(p.supplier_snapshot->>'company_name',p.supplier_snapshot->>'shop_name',concat_ws(' ',p.supplier_snapshot->>'first_name',p.supplier_snapshot->>'last_name')))
  from public.purchases p left join public.part_catalog c on c.id=p.part_catalog_id where p.organization_id=org and p.voided_at is null and (p_job is null or p.service_job_id=p_job) order by p.id;
 elsif p_kind='ledger' then
  return query select to_jsonb(t) from public.cash_transactions t where t.organization_id=org and (p_job is null or t.service_job_id=p_job) order by t.id;
 else raise exception 'Naməlum məlumat növü'; end if;
end $$;

create function public.set_vehicle_financial_state(p_job uuid,p_close boolean,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]); j public.service_jobs; due numeric; paid numeric; cost numeric; snapshot jsonb;
begin
 if p_close is null then raise exception 'Bağlanma əməliyyatı seçin'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
 select * into j from public.service_jobs where id=p_job and organization_id=org and archived_at is null and deleted_at is null for update;
 if not found then raise exception 'Servis kartı tapılmadı'; end if;
 if not p_close then
  perform prime_private.require_role(array['ADMIN']::public.app_role[]);
  if length(trim(coalesce(p_reason,''))) not between 1 and 250 then raise exception 'Yenidən açılma səbəbi tələb olunur'; end if;
 else
  if exists(select 1 from public.job_work_items where service_job_id=j.id and status<>'CANCELLED' and (not labor_cost_known or assigned_worker_id is null)) or exists(select 1 from public.job_required_parts r where r.service_job_id=j.id and not exists(select 1 from public.purchases p where p.required_part_id=r.id and p.voided_at is null)) then raise exception 'Maya dəyəri daxil edilməyib'; end if;
  select coalesce(sum(amount),0) into paid from public.cash_transactions where service_job_id=j.id and allocation_type like 'CUSTOMER_%' and voided_at is null;
  due:=prime_private.vehicle_receivable(j.id)-paid;
  if due<>0 then raise exception 'Müştəri borcu bağlanmayıb'; end if;
  if exists(select 1 from public.purchases p where p.service_job_id=j.id and p.source_type='SUPPLIER' and p.voided_at is null and p.total_price>(select coalesce(sum(amount),0) from public.cash_transactions where purchase_id=p.id and voided_at is null))
   or exists(select 1 from public.job_work_items w where w.service_job_id=j.id and w.status<>'CANCELLED' and w.labor_cost>(select coalesce(sum(amount),0) from public.cash_transactions where work_item_id=w.id and allocation_type='WORKER_WORK_ITEM' and voided_at is null)) then raise exception 'Öhdəliklər tam ödənilməyib'; end if;
  if exists(select 1 from public.purchases p where p.service_job_id=j.id and p.source_type='SUPPLIER' and p.voided_at is null and p.total_price<(select coalesce(sum(amount),0) from public.cash_transactions where purchase_id=p.id and voided_at is null))
   or exists(select 1 from public.job_work_items w where w.service_job_id=j.id and w.labor_cost<(select coalesce(sum(amount),0) from public.cash_transactions where work_item_id=w.id and allocation_type='WORKER_WORK_ITEM' and voided_at is null)) then raise exception 'Artıq ödəniş var; əvvəlcə uzlaşdırın'; end if;
  select coalesce(sum(total_price),0) into cost from public.purchases where service_job_id=j.id and voided_at is null;
  cost:=cost+coalesce((select sum(labor_cost) from public.job_work_items where service_job_id=j.id and status<>'CANCELLED'),0)+coalesce((select sum(amount) from public.cash_transactions where service_job_id=j.id and allocation_type='VEHICLE_EXPENSE' and voided_at is null),0);
  select jsonb_build_object('part_cost',coalesce((select sum(total_price) from public.purchases where service_job_id=j.id and voided_at is null),0),
   'worker_cost',coalesce((select sum(labor_cost) from public.job_work_items where service_job_id=j.id and status<>'CANCELLED'),0),
   'other_expenses',coalesce(sum(amount) filter(where allocation_type='VEHICLE_EXPENSE'),0),
   'supplier_paid',coalesce(sum(amount) filter(where allocation_type='SUPPLIER_PURCHASE'),0),
   'worker_paid',coalesce(sum(amount) filter(where allocation_type='WORKER_WORK_ITEM'),0),
   'other_expense_paid',coalesce(sum(amount) filter(where allocation_type='VEHICLE_EXPENSE'),0)) into snapshot
  from public.cash_transactions where service_job_id=j.id and voided_at is null;
 end if;
 update public.service_jobs set financially_closed_at=case when p_close then now() end,financially_closed_by=case when p_close then auth.uid() end where id=j.id;
 perform prime_private.write_audit(org,auth.uid(),case when p_close then 'VEHICLE_FINANCE_CLOSED' else 'VEHICLE_FINANCE_REOPENED' end,'service_jobs',j.id,j.id,j.vehicle_id,case when p_close then 'Maliyyə bağlandı' else 'Maliyyə yenidən açıldı' end,'{}',coalesce(snapshot,'{}')||jsonb_build_object('customer_received',paid,'customer_due',due,'cost',cost,'reason',p_reason,'outgoing_paid',(select coalesce(sum(amount),0) from public.cash_transactions where service_job_id=j.id and direction='OUT' and voided_at is null)));
end $$;

create function public.settle_vehicle_obligations(p_job uuid,p_rows jsonb,p_close boolean,p_key uuid) returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]); row jsonb; idx int:=0; key uuid;
begin
 if p_key is null or p_rows is null or p_close is null then raise exception 'Hesablaşma məlumatları tələb olunur'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>200 then raise exception 'Hesablaşma siyahısı düzgün deyil'; end if;
 for row in select * from jsonb_array_elements(p_rows) loop
  if row->>'allocation_type' not in ('SUPPLIER_PURCHASE','WORKER_WORK_ITEM') then raise exception 'Öhdəlik növü düzgün deyil'; end if;
  key:=md5(p_key::text||':'||idx)::uuid;
  perform public.record_financial_transaction(row||jsonb_build_object('service_job_id',p_job),key);
  idx:=idx+1;
 end loop;
 if p_close and not exists(select 1 from public.service_jobs where id=p_job and organization_id=org and financially_closed_at is not null) then perform public.set_vehicle_financial_state(p_job,true); end if;
end $$;

create function prime_private.guard_financial_closure() returns trigger language plpgsql set search_path='' as $$
declare jid uuid;
begin
 if tg_table_name='service_jobs' then
  if tg_op='INSERT' and (new.financially_closed_at is not null or new.financially_closed_by is not null) then raise exception 'Yeni servis kartı maliyyəsi açıq yaradılmalıdır'; end if;
  if tg_op='UPDATE' and (new.financially_closed_at is distinct from old.financially_closed_at or new.financially_closed_by is distinct from old.financially_closed_by) and current_user in ('authenticated','anon') then raise exception 'Maliyyə bağlanmasını hesablaşma vasitəsilə edin'; end if;
  if tg_op='UPDATE' and old.financially_closed_at is not null and (new.agreed_budget is distinct from old.agreed_budget or new.has_line_quotes is distinct from old.has_line_quotes) then raise exception 'Əvvəlcə maliyyəni yenidən açın'; end if;
  return new;
 end if;
 jid:=new.service_job_id;
 perform 1 from public.service_jobs where id=jid for update;
 if exists(select 1 from public.service_jobs where id=jid and financially_closed_at is not null) then
  if tg_table_name='purchases' and tg_op='UPDATE' and new.supplier_id is null and old.supplier_snapshot is not null and not exists(select 1 from public.suppliers where id=old.supplier_id) and (to_jsonb(new)-'supplier_id'-'updated_at'-'total_price')=(to_jsonb(old)-'supplier_id'-'updated_at'-'total_price') then return new; end if;
  raise exception 'Əvvəlcə avtomobil maliyyəsini yenidən açın';
 end if;
 return new;
end $$;
create trigger aa_finance_closed before insert or update on public.service_jobs for each row execute function prime_private.guard_financial_closure();
create trigger aa_finance_closed before insert or update on public.purchases for each row execute function prime_private.guard_financial_closure();
create trigger aa_finance_closed before insert or update on public.job_work_items for each row execute function prime_private.guard_financial_closure();
create trigger aa_finance_closed before insert or update on public.job_required_parts for each row execute function prime_private.guard_financial_closure();

-- Retain compatibility for purchase creation, without allowing the old endpoint
-- to bypass category, transfer-pair or vehicle-level receipt validation.
alter function public.record_cash_payment(uuid,text,uuid,numeric,date,text,uuid) set schema prime_private;
revoke all on function prime_private.record_cash_payment(uuid,text,uuid,numeric,date,text,uuid) from public,anon,authenticated;
create function public.record_cash_payment(p_job uuid,p_type text,p_target uuid,p_amount numeric,p_date date,p_note text,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
 if p_type not in ('CUSTOMER_WORK','CUSTOMER_PART','CUSTOMER_BUDGET','SUPPLIER_PURCHASE','WORKER_WORK_ITEM') or p_type is null then raise exception 'Yeni maliyyə əməliyyatı formasından istifadə edin'; end if;
 if p_type like 'CUSTOMER_%' then perform prime_private.require_role(array['ADMIN']::public.app_role[]); end if;
 return prime_private.record_cash_payment(p_job,p_type,p_target,p_amount,p_date,p_note,p_key);
end $$;
revoke all on function public.record_cash_payment(uuid,text,uuid,numeric,date,text,uuid) from public,anon,authenticated;
grant execute on function public.record_cash_payment(uuid,text,uuid,numeric,date,text,uuid) to authenticated;
revoke all on function prime_private.vehicle_receivable(uuid),prime_private.snapshot_supplier(),prime_private.audit_financial_movement(),prime_private.guard_financial_closure(),public.validate_cash_transaction(),public.validate_cash_transaction_legacy() from public,anon,authenticated;
revoke all on function public.save_financial_master(text,jsonb),public.record_financial_transaction(jsonb,uuid),public.transfer_financial_funds(uuid,uuid,numeric,timestamptz,text,uuid),public.finance_data(text,uuid),public.delete_supplier_permanently(uuid,text),public.set_vehicle_financial_state(uuid,boolean,text),public.settle_vehicle_obligations(uuid,jsonb,boolean,uuid) from public,anon,authenticated;
grant execute on function public.save_financial_master(text,jsonb),public.record_financial_transaction(jsonb,uuid),public.transfer_financial_funds(uuid,uuid,numeric,timestamptz,text,uuid),public.finance_data(text,uuid),public.delete_supplier_permanently(uuid,text),public.set_vehicle_financial_state(uuid,boolean,text),public.settle_vehicle_obligations(uuid,jsonb,boolean,uuid) to authenticated;
commit;
