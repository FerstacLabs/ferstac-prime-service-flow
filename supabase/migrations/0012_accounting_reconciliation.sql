-- Additional compensation is a final expense, never an advance or work settlement.
-- Forward-only migration; apply only after taking the normal production backup.
begin;
insert into public.transaction_categories(organization_id,name,direction,is_system)
select id,'İşçi bonusu','OUT',true from public.organizations
on conflict(organization_id,name,direction) do update set is_system=true,active=true;

create function prime_private.guard_worker_bonus() returns trigger
language plpgsql security definer set search_path='' as $$
declare bonus boolean;
begin
  select name='İşçi bonusu' into bonus from public.transaction_categories where id=new.category_id and organization_id=new.organization_id;
  if coalesce(bonus,false) then
    if new.allocation_type<>'GENERAL_OUT' or new.work_item_id is not null or new.purchase_id is not null then
      raise exception 'Bonus iş üzrə ödəniş və ya avans deyil';
    end if;
    select id,concat_ws(' ',first_name,last_name) into new.worker_identity_id,new.counterparty_name_snapshot
      from public.workers where id=nullif(new.counterparty_details->>'worker_id','')::uuid and organization_id=new.organization_id and active;
    if not found then raise exception 'Bonus üçün aktiv işçi seçin'; end if;
    new.counterparty_details:=new.counterparty_details||jsonb_build_object('payment_kind','WORKER_BONUS');
  elsif new.counterparty_details->>'payment_kind'='WORKER_BONUS' then
    raise exception 'Bonus üçün İşçi bonusu təyinatını seçin';
  end if;
  return new;
end $$;
create trigger c_worker_bonus before insert on public.cash_transactions for each row execute function prime_private.guard_worker_bonus();

create function prime_private.audit_worker_bonus() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.counterparty_details->>'payment_kind'='WORKER_BONUS' then
    perform prime_private.write_audit(new.organization_id,auth.uid(),'WORKER_BONUS_CREATED','cash_transactions',new.id,new.service_job_id,null,'İşçiyə bonus verildi','{}',
      jsonb_build_object('worker_id',new.worker_identity_id,'name',new.counterparty_name_snapshot,'amount',new.amount,'reason',new.purpose,'channel',new.channel));
  end if;
  return new;
end $$;
create trigger d_worker_bonus after insert on public.cash_transactions for each row execute function prime_private.audit_worker_bonus();
revoke all on function prime_private.guard_worker_bonus(),prime_private.audit_worker_bonus() from public,anon,authenticated;

-- Expose completion dates without exposing prices or percentage policies to cashiers.
alter function public.finance_data(text,uuid) rename to finance_data_0010;
revoke all on function public.finance_data_0010(text,uuid) from public,anon,authenticated;
create function public.finance_data(p_kind text,p_job uuid default null) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
begin
  if p_kind='work' then
    return query select r||jsonb_build_object('completed_at',w.completed_at)
      from public.finance_data_0010(p_kind,p_job) r join public.job_work_items w on w.id=(r->>'id')::uuid and w.organization_id=org;
  else return query select * from public.finance_data_0010(p_kind,p_job);
  end if;
end $$;
revoke all on function public.finance_data(text,uuid) from public,anon,authenticated;
grant execute on function public.finance_data(text,uuid) to authenticated;

-- Purchase lifecycle events do not rewrite purchased quantities, prices or receipts.
create table public.purchase_returns (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  purchase_id uuid not null references public.purchases(id),
  service_job_id uuid not null references public.service_jobs(id),
  supplier_id uuid not null,
  quantity numeric not null check(quantity>0),
  amount numeric(12,2) not null check(amount>=0),
  credit_amount numeric(12,2) not null check(credit_amount>=0 and credit_amount<=amount),
  paid_snapshot numeric(12,2) not null,
  reason text not null check(length(btrim(reason)) between 1 and 500),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  reference_number text,
  replacement_purchase_id uuid unique references public.purchases(id)
);
create table public.supplier_credit_allocations (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  return_id uuid not null references public.purchase_returns(id),
  purchase_id uuid not null references public.purchases(id),
  amount numeric(12,2) not null check(amount>0),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
create table public.supplier_refunds (
  transaction_id uuid primary key references public.cash_transactions(id),
  organization_id uuid not null references public.organizations(id),
  return_id uuid not null references public.purchase_returns(id)
);
alter table public.purchases add column replacement_of uuid references public.purchases(id);
alter table public.purchases add column replacement_required_part_id uuid references public.job_required_parts(id);
alter table public.purchases add column lifecycle_closed boolean not null default false;
alter table public.purchases add column unit_name text check(length(unit_name) between 1 and 30);
drop index public.purchase_requirement_active;
create unique index purchase_requirement_active on public.purchases(required_part_id) where voided_at is null and not lifecycle_closed;
create index purchase_returns_purchase on public.purchase_returns(purchase_id);
create index supplier_credit_target on public.supplier_credit_allocations(purchase_id);
do $$ declare t text; begin
  foreach t in array array['purchase_returns','supplier_credit_allocations','supplier_refunds'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy finance_read on public.%I for select to authenticated using(organization_id=prime_private.organization_id() and prime_private.has_role(array[''ADMIN'',''CASHIER'']::public.app_role[]))',t);
  end loop;
end $$;

create function prime_private.purchase_position(p_id uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('returned_quantity',coalesce((select sum(quantity) from public.purchase_returns where purchase_id=p.id),0),
    'returned',coalesce((select sum(amount) from public.purchase_returns where purchase_id=p.id),0),
    'credit_created',coalesce((select sum(credit_amount) from public.purchase_returns where purchase_id=p.id),0),
    'credit_applied',coalesce((select sum(amount) from public.supplier_credit_allocations where purchase_id=p.id),0),
    'paid',coalesce((select sum(amount) from public.cash_transactions where purchase_id=p.id and allocation_type='SUPPLIER_PURCHASE' and voided_at is null),0))
  from public.purchases p where p.id=p_id
$$;
create function prime_private.purchase_due(p_id uuid) returns numeric language sql stable set search_path='' as $$
  select p.total_price-(s->>'returned')::numeric-(s->>'paid')::numeric-(s->>'credit_applied')::numeric+(s->>'credit_created')::numeric
    from public.purchases p cross join lateral prime_private.purchase_position(p.id) s where p.id=p_id
$$;
create function prime_private.supplier_credit_available(p_return uuid) returns numeric language sql stable set search_path='' as $$
  select r.credit_amount-coalesce((select sum(amount) from public.supplier_credit_allocations where return_id=r.id),0)
    -coalesce((select sum(t.amount) from public.supplier_refunds f join public.cash_transactions t on t.id=f.transaction_id where f.return_id=r.id and t.voided_at is null),0)
    from public.purchase_returns r where r.id=p_return
$$;

create function public.return_purchase(p_purchase uuid,p_data jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
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
  amount:=round(((s->>'returned_quantity')::numeric+q)*p.unit_price,2)-(s->>'returned')::numeric;
  credit:=greatest(0,amount-greatest(0,prime_private.purchase_due(p.id)));
  insert into public.purchase_returns(id,organization_id,purchase_id,service_job_id,supplier_id,quantity,amount,credit_amount,paid_snapshot,reason,occurred_at,created_by,reference_number)
    values(p_key,org,p.id,j.id,coalesce(p.supplier_id,p.historical_supplier_id),q,amount,credit,(s->>'paid')::numeric,p_data->>'reason',at_time,auth.uid(),p_data->>'reference_number');
  if q+(s->>'returned_quantity')::numeric=p.quantity then update public.purchases set lifecycle_closed=true where id=p.id; end if;
  perform prime_private.write_audit(org,auth.uid(),'PURCHASE_RETURNED','purchases',p.id,j.id,j.vehicle_id,'Detal qaytarıldı','{}',
    jsonb_build_object('name',coalesce(p.custom_item_name,(select name from public.part_catalog where id=p.part_catalog_id)),'amount',amount,'quantity',q,'credit',credit,'handling',coalesce(p_data->>'handling','CREDIT'),'reason',p_data->>'reason'));
  if credit>0 then perform prime_private.write_audit(org,auth.uid(),'SUPPLIER_CREDIT_CREATED','purchase_returns',p_key,j.id,j.vehicle_id,'Təchizatçı krediti yarandı','{}',jsonb_build_object('amount',credit)); end if;
  if credit>0 and p_data->>'handling'='REFUND' then perform public.refund_supplier_credit(p_key,p_data||jsonb_build_object('amount',credit),gen_random_uuid()); end if;
  return p_key;
end $$;

create function public.apply_supplier_credit(p_return uuid,p_purchase uuid,p_amount numeric,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); r public.purchase_returns; p public.purchases; old public.supplier_credit_allocations;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  if p_key is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Məbləğ düzgün deyil'; end if;
  select * into old from public.supplier_credit_allocations where id=p_key and organization_id=org;
  if found then
    if old.return_id<>p_return or old.purchase_id<>p_purchase or old.amount<>p_amount then raise exception 'Təkrar əməliyyat məlumatları uyğun deyil'; end if;
    return p_key;
  end if;
  select * into r from public.purchase_returns where id=p_return and organization_id=org for update;
  if not found then raise exception 'Təchizatçı krediti tapılmadı'; end if;
  select * into p from public.purchases where id=p_purchase and organization_id=org and source_type='SUPPLIER' and voided_at is null;
  if not found or coalesce(p.supplier_id,p.historical_supplier_id)<>r.supplier_id or p.id=r.purchase_id then raise exception 'Eyni təchizatçının başqa alışını seçin'; end if;
  perform 1 from public.service_jobs where id=p.service_job_id and financially_closed_at is null and archived_at is null and deleted_at is null for update;
  if not found then raise exception 'Maliyyəsi açıq aktiv servis kartı tələb olunur'; end if;
  if p_amount>prime_private.supplier_credit_available(r.id) or p_amount>prime_private.purchase_due(p.id) then raise exception 'Məbləğ kredit və ya alış borcundan artıqdır'; end if;
  insert into public.supplier_credit_allocations(id,organization_id,return_id,purchase_id,amount,created_by) values(p_key,org,r.id,p.id,p_amount,auth.uid());
  perform prime_private.write_audit(org,auth.uid(),'SUPPLIER_CREDIT_APPLIED','purchases',p.id,p.service_job_id,null,'Təchizatçı krediti alışa tətbiq edildi','{}',jsonb_build_object('amount',p_amount,'return_id',r.id));
  return p_key;
end $$;

-- Additional insert guard supplements the original settlement cap, without changing receipts.
create function prime_private.guard_purchase_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
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
      and (to_jsonb(new)-'supplier_id'-'updated_at'-'total_price')=(to_jsonb(old)-'supplier_id'-'updated_at'-'total_price') then return new; end if;
    if new.lifecycle_closed is distinct from old.lifecycle_closed and (not new.lifecycle_closed or new.quantity<>(prime_private.purchase_position(new.id)->>'returned_quantity')::numeric) then raise exception 'Alışın qaytarma statusu tarixçə ilə uyğun deyil'; end if;
    if (to_jsonb(new)-'updated_at'-'total_price'-'paid_amount'-'payment_status'-'lifecycle_closed') is distinct from (to_jsonb(old)-'updated_at'-'total_price'-'paid_amount'-'payment_status'-'lifecycle_closed') then raise exception 'Qaytarma və kredit tarixçəsi olan alış dəyişdirilə bilməz'; end if;
  end if;
  return new;
end $$;
create trigger c_purchase_lifecycle before insert or update on public.cash_transactions for each row execute function prime_private.guard_purchase_lifecycle();
create trigger c_purchase_lifecycle before insert or update on public.purchases for each row execute function prime_private.guard_purchase_lifecycle();

create function public.refund_supplier_credit(p_return uuid,p_data jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]); r public.purchase_returns; result uuid; cat uuid; amount numeric:=(p_data->>'amount')::numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  select t.id into result from public.cash_transactions t join public.supplier_refunds f on f.transaction_id=t.id where t.organization_id=org and t.idempotency_key=p_key and f.return_id=p_return;
  if found then return result; end if;
  if exists(select 1 from public.cash_transactions where organization_id=org and idempotency_key=p_key) then raise exception 'Əməliyyat açarı artıq istifadə olunub'; end if;
  select * into r from public.purchase_returns where id=p_return and organization_id=org for update;
  if not found or amount is null or amount<=0 or amount>prime_private.supplier_credit_available(r.id) then raise exception 'Məbləğ təchizatçı kreditindən artıqdır'; end if;
  insert into public.transaction_categories(organization_id,name,direction,is_system) values(org,'Təchizatçıdan geri qaytarma','IN',true)
    on conflict(organization_id,name,direction) do update set active=true,is_system=true returning id into cat;
  result:=public.record_financial_transaction(p_data||jsonb_build_object('allocation_type','GENERAL_IN','service_job_id',r.service_job_id,'category_id',cat,
    'purpose',coalesce(nullif(p_data->>'purpose',''),'Təchizatçıdan geri qaytarma'),
    'reference_number',coalesce(nullif(p_data->>'reference_number',''),r.reference_number,'Qaytarma-'||left(r.id::text,8)),
    'counterparty_details',jsonb_build_object('payment_kind','SUPPLIER_REFUND','return_id',r.id,'supplier_id',r.supplier_id,'purchase_id',r.purchase_id,
      'item_name',(select coalesce(p.custom_item_name,c.name) from public.purchases p left join public.part_catalog c on c.id=p.part_catalog_id where p.id=r.purchase_id),
      'original_reference',(select coalesce(document_no,'Alış-'||left(id::text,8)) from public.purchases where id=r.purchase_id))),p_key);
  return result;
end $$;

create function prime_private.guard_supplier_refund() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.purchase_returns;
begin
  if exists(select 1 from public.transaction_categories where id=new.category_id and organization_id=new.organization_id and name='Təchizatçıdan geri qaytarma') and new.counterparty_details->>'payment_kind' is distinct from 'SUPPLIER_REFUND' then raise exception 'Geri ödənişi təchizatçı krediti vasitəsilə qeydə alın'; end if;
  if new.counterparty_details->>'payment_kind'='SUPPLIER_REFUND' then
    select * into r from public.purchase_returns where id=nullif(new.counterparty_details->>'return_id','')::uuid and organization_id=new.organization_id;
    if not found or new.allocation_type<>'GENERAL_IN' or new.service_job_id is distinct from r.service_job_id or new.amount>prime_private.supplier_credit_available(r.id) or new.occurred_at<r.occurred_at then raise exception 'Təchizatçı geri qaytarması düzgün deyil'; end if;
    new.supplier_identity_id:=r.supplier_id;
    select coalesce(supplier_snapshot->>'company_name',supplier_snapshot->>'shop_name',concat_ws(' ',supplier_snapshot->>'first_name',supplier_snapshot->>'last_name')) into new.counterparty_name_snapshot
      from public.purchases where id=r.purchase_id and organization_id=r.organization_id;
  end if;
  return new;
end $$;
create trigger c_supplier_refund before insert on public.cash_transactions for each row execute function prime_private.guard_supplier_refund();

create function prime_private.register_supplier_refund() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.counterparty_details->>'payment_kind'='SUPPLIER_REFUND' then
    insert into public.supplier_refunds(transaction_id,organization_id,return_id) values(new.id,new.organization_id,(new.counterparty_details->>'return_id')::uuid);
    perform prime_private.write_audit(new.organization_id,auth.uid(),'SUPPLIER_REFUND_CREATED','cash_transactions',new.id,new.service_job_id,null,'Təchizatçıdan vəsait geri alındı','{}',jsonb_build_object('amount',new.amount,'name',new.counterparty_name_snapshot,'channel',new.channel));
  end if;
  return new;
end $$;
create trigger d_supplier_refund after insert on public.cash_transactions for each row execute function prime_private.register_supplier_refund();
revoke all on function prime_private.register_supplier_refund() from public,anon,authenticated;

create function public.exchange_purchase(p_purchase uuid,p_data jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
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
  insert into public.purchases(id,owner_user_id,service_job_id,required_part_id,part_catalog_id,custom_item_name,quantity,unit_price,source_type,supplier_id,purchased_by_admin,payment_status,paid_amount,document_no,part_code_oem,purchase_date,notes,replacement_of,replacement_required_part_id,unit_name)
    values(replacement,auth.uid(),p.service_job_id,coalesce(p.required_part_id,p.replacement_required_part_id),p.part_catalog_id,btrim(p_data->>'new_name'),q,price,'SUPPLIER',p.supplier_id,true,'UNPAID',0,p_data->>'document_no',p_data->>'part_code_oem',coalesce(((p_data->>'occurred_at')::timestamptz at time zone 'Asia/Baku')::date,current_date),left(p_data->>'reason',250),p.id,coalesce(p.required_part_id,p.replacement_required_part_id),coalesce(nullif(btrim(p_data->>'unit_name'),''),'Ədəd'));
  update public.purchase_returns set replacement_purchase_id=replacement where id=returned;
  available:=least(prime_private.supplier_credit_available(returned),q*price);
  if available>0 then perform public.apply_supplier_credit(returned,replacement,available,gen_random_uuid()); end if;
  if prime_private.supplier_credit_available(returned)>0 and p_data->>'handling'='REFUND' then perform public.refund_supplier_credit(returned,p_data||jsonb_build_object('amount',prime_private.supplier_credit_available(returned)),gen_random_uuid()); end if;
  perform prime_private.write_audit(org,auth.uid(),'PURCHASE_EXCHANGED','purchases',p.id,p.service_job_id,null,'Detal dəyişdirildi','{}',
    jsonb_build_object('old_name',coalesce(p.custom_item_name,(select name from public.part_catalog where id=p.part_catalog_id)),'new_name',p_data->>'new_name','old_value',p.total_price,'new_value',q*price,'difference',q*price-p.total_price,'reason',p_data->>'reason','handling',coalesce(p_data->>'handling','CREDIT'),'replacement_id',replacement));
  return replacement;
end $$;
revoke all on function public.exchange_purchase(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.exchange_purchase(uuid,jsonb,uuid) to authenticated;

revoke all on function prime_private.purchase_position(uuid),prime_private.purchase_due(uuid),prime_private.supplier_credit_available(uuid),prime_private.guard_purchase_lifecycle(),prime_private.guard_supplier_refund(),
  public.return_purchase(uuid,jsonb,uuid),public.apply_supplier_credit(uuid,uuid,numeric,uuid),public.refund_supplier_credit(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.return_purchase(uuid,jsonb,uuid),public.apply_supplier_credit(uuid,uuid,numeric,uuid),public.refund_supplier_credit(uuid,jsonb,uuid) to authenticated;

create or replace function public.finance_data(p_kind text,p_job uuid default null) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
begin
  if p_kind='work' then
    return query select r||jsonb_build_object('completed_at',w.completed_at)
      from public.finance_data_0010(p_kind,p_job) r join public.job_work_items w on w.id=(r->>'id')::uuid and w.organization_id=org;
  elsif p_kind='purchases' then
    return query select r||s||jsonb_build_object('original_cost',p.total_price,'cost',p.total_price-(s->>'returned')::numeric,'remaining',prime_private.purchase_due(p.id),
      'purchase_date',p.purchase_date,'quantity',p.quantity,'replacement_of',p.replacement_of,'replacement_required_part_id',p.replacement_required_part_id,
      'settled',(s->>'paid')::numeric+(s->>'credit_applied')::numeric-(s->>'credit_created')::numeric,
      'exchanged',exists(select 1 from public.purchase_returns where purchase_id=p.id and replacement_purchase_id is not null))
      from public.finance_data_0010(p_kind,p_job) r join public.purchases p on p.id=(r->>'id')::uuid and p.organization_id=org
      cross join lateral prime_private.purchase_position(p.id) s;
  elsif p_kind='jobs' then
    return query select r||jsonb_build_object('missing_costs',
      (select count(*) from public.job_work_items w where w.service_job_id=(r->>'id')::uuid and w.status<>'CANCELLED' and (not w.labor_cost_known or w.assigned_worker_id is null))+
      (select count(*) from public.job_required_parts q where q.service_job_id=(r->>'id')::uuid and not exists(select 1 from public.purchases p where p.required_part_id=q.id and p.voided_at is null and not p.lifecycle_closed)))
      from public.finance_data_0010(p_kind,p_job) r;
  elsif p_kind='purchase_returns' then
    return query select to_jsonb(r)||jsonb_build_object('available',prime_private.supplier_credit_available(r.id)) from public.purchase_returns r where r.organization_id=org and (p_job is null or r.service_job_id=p_job) order by r.id;
  elsif p_kind='supplier_credit_allocations' then
    return query select to_jsonb(a)||jsonb_build_object('service_job_id',p.service_job_id,'supplier_id',r.supplier_id)
      from public.supplier_credit_allocations a join public.purchases p on p.id=a.purchase_id join public.purchase_returns r on r.id=a.return_id where a.organization_id=org and (p_job is null or p.service_job_id=p_job) order by a.id;
  else return query select * from public.finance_data_0010(p_kind,p_job);
  end if;
end $$;

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
  select jsonb_build_object('part_cost',coalesce((select sum(p.total_price-(prime_private.purchase_position(p.id)->>'returned')::numeric) from public.purchases p where service_job_id=j.id and voided_at is null),0),
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
