-- Forward-only extension. Existing budgets, costs, catalogs and payments are retained.
begin;

alter table work_catalog add column owner_user_id uuid references auth.users(id), add column created_at timestamptz not null default now();
alter table part_catalog add column owner_user_id uuid references auth.users(id), add column created_at timestamptz not null default now();
alter table worker_roles add column owner_user_id uuid references auth.users(id), add column created_at timestamptz not null default now();
alter table worker_roles drop constraint worker_roles_name_key;
alter table part_catalog drop constraint part_catalog_category_name_key;
create function catalog_key(text) returns text language sql immutable strict as $$ select lower(regexp_replace(trim($1), '\s+', ' ', 'g')) $$;
create unique index work_catalog_owner_name on work_catalog(owner_user_id, catalog_key(name)) where owner_user_id is not null;
create unique index part_catalog_owner_name on part_catalog(owner_user_id, catalog_key(name)) where owner_user_id is not null;
create unique index worker_roles_owner_name on worker_roles(owner_user_id, catalog_key(name)) where owner_user_id is not null;
drop policy "master work catalog readable" on work_catalog;
drop policy "master part catalog readable" on part_catalog;
drop policy "master worker roles readable" on worker_roles;
do $$ declare t text; begin
  foreach t in array array['work_catalog','part_catalog','worker_roles'] loop
    execute format('create policy catalog_read on %I for select using (owner_user_id is null or owner_user_id = auth.uid())',t);
    execute format('create policy catalog_insert on %I for insert with check (owner_user_id = auth.uid())',t);
    execute format('create policy catalog_update on %I for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid())',t);
  end loop;
end $$;

alter table service_jobs add column has_line_quotes boolean not null default false;
alter table job_work_items add column quoted_price numeric(12,2) check (quoted_price >= 0),
  add column labor_cost_known boolean not null default false,
  add column display_order int not null default 0;
update job_work_items set labor_cost_known = true where labor_cost > 0;
create table job_required_parts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  service_job_id uuid not null references service_jobs(id),
  part_catalog_id uuid not null references part_catalog(id),
  quoted_price numeric(12,2) not null check (quoted_price >= 0),
  notes text check (length(notes) <= 250),
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique(service_job_id, part_catalog_id)
);
alter table job_required_parts enable row level security;
create policy required_parts_owned on job_required_parts for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
alter table purchases add column required_part_id uuid references job_required_parts(id), add column voided_at timestamptz;
create unique index purchase_requirement_active on purchases(required_part_id) where voided_at is null;
create index required_parts_job on job_required_parts(service_job_id, display_order);
create index purchases_supplier_date on purchases(owner_user_id,supplier_id,purchase_date);
create index work_worker_date on job_work_items(owner_user_id,assigned_worker_id,planned_at);
create index work_catalog_reference on job_work_items(work_catalog_id);
create index required_part_catalog_reference on job_required_parts(part_catalog_id);

-- One transaction settles exactly one explicit target. No independent payment totals.
create table cash_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  service_job_id uuid not null references service_jobs(id),
  allocation_type text not null check (allocation_type in ('CUSTOMER_WORK','CUSTOMER_PART','CUSTOMER_BUDGET','SUPPLIER_PURCHASE','WORKER_WORK_ITEM')),
  work_item_id uuid references job_work_items(id),
  required_part_id uuid references job_required_parts(id),
  purchase_id uuid references purchases(id),
  direction text generated always as (case when allocation_type like 'CUSTOMER_%' then 'IN' else 'OUT' end) stored,
  amount numeric(12,2) not null check (amount > 0),
  transaction_date date not null default (now() at time zone 'Asia/Baku')::date,
  notes text check (length(notes) <= 250),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text check (length(void_reason) <= 250),
  check (
    (allocation_type in ('CUSTOMER_WORK','WORKER_WORK_ITEM') and work_item_id is not null and required_part_id is null and purchase_id is null)
    or (allocation_type = 'CUSTOMER_PART' and required_part_id is not null and work_item_id is null and purchase_id is null)
    or (allocation_type = 'SUPPLIER_PURCHASE' and purchase_id is not null and work_item_id is null and required_part_id is null)
    or (allocation_type = 'CUSTOMER_BUDGET' and work_item_id is null and required_part_id is null and purchase_id is null)
  )
);
alter table cash_transactions enable row level security;
create policy cash_read on cash_transactions for select using (owner_user_id = auth.uid());
create policy cash_insert on cash_transactions for insert with check (owner_user_id = auth.uid());
create policy cash_void on cash_transactions for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create index cash_job_date on cash_transactions(owner_user_id,service_job_id,transaction_date);
create index cash_owner_date on cash_transactions(owner_user_id,transaction_date);
create index cash_work on cash_transactions(work_item_id) where voided_at is null;
create index cash_purchase on cash_transactions(purchase_id) where voided_at is null;
create index cash_part on cash_transactions(required_part_id) where voided_at is null;

insert into cash_transactions(owner_user_id,service_job_id,allocation_type,purchase_id,amount,transaction_date,notes,idempotency_key)
select owner_user_id,service_job_id,'SUPPLIER_PURCHASE',id,paid_amount,purchase_date,'Əvvəlki alış ödənişi',id
from purchases where source_type = 'SUPPLIER' and paid_amount > 0;
-- Non-supplier historical paid_amount is retained for compatibility, not invented as cash.

create function enforce_workshop_relations() returns trigger language plpgsql set search_path = public as $$
declare owner_id uuid; linked_job uuid; ref_owner uuid;
begin
  owner_id := new.owner_user_id;
  if tg_op = 'UPDATE' and owner_id <> old.owner_user_id then raise exception 'Sahib dəyişdirilə bilməz'; end if;
  if to_jsonb(new) ? 'notes' and (tg_op = 'INSERT' or new.notes is distinct from old.notes) and length(new.notes) > 250 then
    raise exception 'Qeyd maksimum 250 simvol ola bilər';
  end if;
  if tg_table_name in ('job_work_items','purchases','job_required_parts','cash_transactions') then
    select owner_user_id into ref_owner from service_jobs where id = new.service_job_id;
    if ref_owner is distinct from owner_id then raise exception 'Servis kartı tapılmadı'; end if;
    if tg_op = 'UPDATE' and new.service_job_id <> old.service_job_id then raise exception 'Servis kartı dəyişdirilə bilməz'; end if;
  end if;
  if tg_table_name = 'service_jobs' then
    select owner_user_id into ref_owner from vehicles where id = new.vehicle_id;
    if ref_owner is distinct from owner_id then raise exception 'Avtomobil tapılmadı'; end if;
  end if;
  if tg_table_name = 'workers' then
    if not exists(select 1 from worker_roles where id=new.role_id and (owner_user_id is null or owner_user_id=owner_id)) then raise exception 'Rol tapılmadı'; end if;
  end if;
  if tg_table_name = 'job_work_items' then
    if tg_op='INSERT' then
      perform 1 from service_jobs where id=new.service_job_id for update;
      if new.work_catalog_id is not null and exists(select 1 from job_work_items where service_job_id=new.service_job_id and work_catalog_id=new.work_catalog_id) then raise exception 'Təkrar iş seçilib'; end if;
      if new.quoted_price is null and exists(select 1 from service_jobs where id=new.service_job_id and has_line_quotes) then raise exception 'Müştəri qiyməti tələb olunur'; end if;
    end if;
    if new.work_catalog_id is not null and not exists(select 1 from work_catalog where id=new.work_catalog_id and (owner_user_id is null or owner_user_id=owner_id)) then raise exception 'İş tapılmadı'; end if;
    if new.assigned_worker_id is not null and not exists(select 1 from workers where id=new.assigned_worker_id and owner_user_id=owner_id) then raise exception 'Usta tapılmadı'; end if;
  end if;
  if tg_table_name in ('purchases','job_required_parts') then
    if new.part_catalog_id is not null and not exists(select 1 from part_catalog where id=new.part_catalog_id and (owner_user_id is null or owner_user_id=owner_id)) then raise exception 'Detal tapılmadı'; end if;
  end if;
  if tg_table_name = 'purchases' then
    if new.supplier_id is not null and not exists(select 1 from suppliers where id=new.supplier_id and owner_user_id=owner_id) then raise exception 'Təchizatçı tapılmadı'; end if;
    if new.purchased_by_worker_id is not null and not exists(select 1 from workers where id=new.purchased_by_worker_id and owner_user_id=owner_id) then raise exception 'Alıcı tapılmadı'; end if;
    if new.required_part_id is not null and not exists(select 1 from job_required_parts where id=new.required_part_id and service_job_id=new.service_job_id and part_catalog_id=new.part_catalog_id) then raise exception 'Detal bu servis kartına aid deyil'; end if;
    if new.source_type = 'CUSTOMER_PROVIDED' and (new.unit_price <> 0 or new.paid_amount <> 0) then raise exception 'Müştərinin detalı alış borcu yaratmır'; end if;
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['vehicles','service_jobs','workers','suppliers','job_work_items','purchases','job_required_parts','cash_transactions'] loop
    execute format('create trigger a_workshop_relations before insert or update on %I for each row execute function enforce_workshop_relations()',t);
  end loop;
end $$;

create function validate_cash_transaction() returns trigger language plpgsql set search_path = public as $$
declare cap numeric; settled numeric; j service_jobs; w job_work_items; p purchases;
begin
  select * into j from service_jobs where id=new.service_job_id for update;
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'voided_at' - 'void_reason' - 'direction') is distinct from (to_jsonb(old) - 'voided_at' - 'void_reason' - 'direction')
      or old.voided_at is not null or new.voided_at is null or nullif(trim(new.void_reason),'') is null then
      raise exception 'Ödəniş yalnız səbəb göstərilməklə ləğv edilə bilər';
    end if;
    return new;
  end if;
  if new.voided_at is not null then raise exception 'Yeni ödəniş ləğv edilmiş ola bilməz'; end if;
  if new.work_item_id is not null then
    select * into w from job_work_items where id=new.work_item_id and service_job_id=j.id;
    if not found then raise exception 'İş tapılmadı'; end if;
    if new.allocation_type='CUSTOMER_WORK' then
      cap := w.quoted_price;
    else
      if w.status <> 'DONE' or w.assigned_worker_id is null or not w.labor_cost_known then raise exception 'Usta ödənişi üçün tamamlanmış iş və maya tələb olunur'; end if;
      cap := w.labor_cost;
    end if;
  elsif new.required_part_id is not null then
    select quoted_price into cap from job_required_parts where id=new.required_part_id and service_job_id=j.id;
  elsif new.purchase_id is not null then
    select * into p from purchases where id=new.purchase_id and service_job_id=j.id and source_type='SUPPLIER' and voided_at is null;
    if not found then raise exception 'Alış tapılmadı'; end if;
    cap := p.total_price;
  else
    if j.has_line_quotes then raise exception 'Ödənişi iş və ya detal üzrə bölüşdürün'; end if;
    cap := j.agreed_budget;
  end if;
  if cap is null then raise exception 'Qiymət daxil edilməyib'; end if;
  select coalesce(sum(amount),0) into settled from cash_transactions
    where service_job_id=j.id and allocation_type=new.allocation_type and voided_at is null
      and work_item_id is not distinct from new.work_item_id and required_part_id is not distinct from new.required_part_id
      and purchase_id is not distinct from new.purchase_id;
  if new.amount + settled > cap then raise exception 'Ödəniş qalıq məbləğdən artıqdır'; end if;
  return new;
end $$;
create trigger b_validate_cash before insert or update on cash_transactions for each row execute function validate_cash_transaction();

create function sync_purchase_payment() returns trigger language plpgsql set search_path = public as $$
declare paid numeric; total numeric;
begin
  if new.purchase_id is not null then
    select coalesce(sum(amount),0) into paid from cash_transactions where purchase_id=new.purchase_id and voided_at is null;
    select total_price into total from purchases where id=new.purchase_id;
    update purchases set paid_amount=paid, payment_status=case when paid=0 then 'UNPAID'::payment_status when paid=total then 'PAID'::payment_status else 'PARTIAL'::payment_status end where id=new.purchase_id;
  end if;
  return new;
end $$;
create trigger c_sync_payment after insert or update on cash_transactions for each row execute function sync_purchase_payment();

create function guard_financial_edits() returns trigger language plpgsql set search_path = public as $$
declare paid numeric;
begin
  perform 1 from service_jobs where id=coalesce(new.service_job_id,old.service_job_id) for update;
  if tg_op='DELETE' then raise exception 'Maliyyə tarixçəsi silinə bilməz; arxiv və ya ləğv istifadə edin'; end if;
  if tg_table_name='purchases' then
    if pg_trigger_depth() < 2 and ((tg_op='INSERT' and new.source_type='SUPPLIER' and new.paid_amount <> 0)
      or (tg_op='UPDATE' and (new.paid_amount <> old.paid_amount or new.payment_status <> old.payment_status))) then
      raise exception 'Ödənişi Kassa vasitəsilə daxil edin';
    end if;
    select coalesce(sum(amount),0) into paid from cash_transactions where purchase_id=new.id and voided_at is null;
    if new.quantity*new.unit_price <> round(new.quantity*new.unit_price,2) then raise exception 'Alış cəmi ən çox iki onluq rəqəm ola bilər'; end if;
    if paid > new.quantity*new.unit_price then raise exception 'Maya ödənilmiş məbləğdən az ola bilməz'; end if;
    if new.source_type='SUPPLIER' then
      new.paid_amount:=paid;
      new.payment_status:=case when paid=0 then 'UNPAID'::payment_status when paid=new.quantity*new.unit_price then 'PAID'::payment_status else 'PARTIAL'::payment_status end;
    end if;
    if tg_op='UPDATE' and paid>0 and (new.supplier_id is distinct from old.supplier_id or new.source_type<>old.source_type or new.required_part_id is distinct from old.required_part_id or new.voided_at is distinct from old.voided_at) then
      raise exception 'Əvvəlcə bağlı ödənişləri səbəb göstərərək ləğv edin';
    end if;
  elsif tg_table_name='job_work_items' then
    if new.labor_cost <> round(new.labor_cost,2) or new.labor_cost > 9999999999.99 then raise exception 'Usta mayası düzgün pul formatında olmalıdır'; end if;
    select coalesce(sum(amount),0) into paid from cash_transactions where work_item_id=new.id and allocation_type='WORKER_WORK_ITEM' and voided_at is null;
    if paid>new.labor_cost or (paid>0 and (new.status<>'DONE' or not new.labor_cost_known or new.assigned_worker_id is distinct from old.assigned_worker_id)) then raise exception 'Ödənilmiş usta məbləği qorunmalıdır'; end if;
    select coalesce(sum(amount),0) into paid from cash_transactions where work_item_id=new.id and allocation_type='CUSTOMER_WORK' and voided_at is null;
    if paid>coalesce(new.quoted_price,0) then raise exception 'Qiymət ödənişdən az ola bilməz'; end if;
  elsif tg_table_name='job_required_parts' then
    select coalesce(sum(amount),0) into paid from cash_transactions where required_part_id=new.id and voided_at is null;
    if paid>new.quoted_price then raise exception 'Qiymət ödənişdən az ola bilməz'; end if;
  end if;
  return new;
end $$;
create trigger b_purchase_guard before insert or update or delete on purchases for each row execute function guard_financial_edits();
create trigger b_work_guard before update or delete on job_work_items for each row execute function guard_financial_edits();
create trigger b_requirement_guard before update or delete on job_required_parts for each row execute function guard_financial_edits();

create function guard_legacy_budget() returns trigger language plpgsql set search_path = public as $$
declare paid numeric;
begin
  select coalesce(sum(amount),0) into paid from cash_transactions where service_job_id=new.id and allocation_type='CUSTOMER_BUDGET' and voided_at is null;
  if paid>new.agreed_budget or (paid>0 and new.has_line_quotes<>old.has_line_quotes) then raise exception 'Əvvəlki büdcə üzrə ödənişlər qorunmalıdır'; end if;
  return new;
end $$;
create trigger b_legacy_budget before update on service_jobs for each row execute function guard_legacy_budget();

create function derive_job_status() returns trigger language plpgsql set search_path = public as $$
declare next_status service_job_status;
begin
  perform 1 from service_jobs where id=new.service_job_id for update;
  select case when bool_and(status in ('DONE','CANCELLED')) then 'READY'::service_job_status
    when bool_or(status='IN_PROGRESS') then 'IN_PROGRESS'::service_job_status else 'WAITING'::service_job_status end
    into next_status from job_work_items where service_job_id=new.service_job_id;
  update service_jobs set status=next_status,updated_at=now() where id=new.service_job_id and status not in ('DELIVERED','PAUSED');
  return new;
end $$;
create trigger c_work_status after insert or update of status on job_work_items for each row execute function derive_job_status();

create function create_catalog_entry(p_kind text,p_name text) returns jsonb language plpgsql security invoker set search_path = public as $$
declare t text; result jsonb; cleaned text;
begin
  if auth.uid() is null then raise exception 'Sessiya tapılmadı'; end if;
  t := case p_kind when 'work' then 'work_catalog' when 'part' then 'part_catalog' when 'role' then 'worker_roles' end;
  cleaned := regexp_replace(trim(p_name),'\s+',' ','g');
  if t is null or length(cleaned) not between 1 and 120 then raise exception 'Ad 1-120 simvol olmalıdır'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || t || catalog_key(cleaned),0));
  execute format('select to_jsonb(c) from %I c where catalog_key(name)=catalog_key($1) and (owner_user_id is null or owner_user_id=$2) order by owner_user_id nulls first limit 1',t) into result using cleaned,auth.uid();
  if result is not null then
    execute format('update %I set active=true where id=$1 and owner_user_id=$2',t) using (result->>'id')::uuid,auth.uid();
    return result;
  end if;
  if p_kind='work' then
    insert into work_catalog(owner_user_id,code,category,name) values(auth.uid(),gen_random_uuid()::text,'Servis',cleaned) returning to_jsonb(work_catalog) into result;
  elsif p_kind='part' then
    insert into part_catalog(owner_user_id,category,name) values(auth.uid(),'Servis',cleaned) returning to_jsonb(part_catalog) into result;
  else
    insert into worker_roles(owner_user_id,name) values(auth.uid(),cleaned) returning to_jsonb(worker_roles) into result;
  end if;
  return result;
end $$;

create function record_cash_payment(p_job uuid,p_type text,p_target uuid,p_amount numeric,p_date date,p_note text,p_key uuid) returns uuid language plpgsql security invoker set search_path = public as $$
declare existing_id uuid; result uuid;
begin
  perform 1 from service_jobs where id=p_job and owner_user_id=auth.uid() for update;
  if not found then raise exception 'Servis kartı tapılmadı'; end if;
  select id into existing_id from cash_transactions where idempotency_key=p_key;
  if found then return existing_id; end if;
  if p_amount <> round(p_amount,2) then raise exception 'Məbləğ ən çox iki onluq rəqəm ola bilər'; end if;
  insert into cash_transactions(owner_user_id,service_job_id,allocation_type,work_item_id,required_part_id,purchase_id,amount,transaction_date,notes,idempotency_key)
  values(auth.uid(),p_job,p_type,case when p_type in ('CUSTOMER_WORK','WORKER_WORK_ITEM') then p_target end,
    case when p_type='CUSTOMER_PART' then p_target end,case when p_type='SUPPLIER_PURCHASE' then p_target end,p_amount,p_date,p_note,p_key) returning id into result;
  return result;
end $$;

create function save_workshop_purchase(p_data jsonb,p_key uuid) returns uuid language plpgsql security invoker set search_path = public as $$
declare r job_required_parts; p purchases; result uuid; initial_paid numeric; old_purchase purchases;
begin
  select * into p from jsonb_populate_record(null::purchases,p_data);
  perform 1 from service_jobs where id=p.service_job_id and owner_user_id=auth.uid() for update;
  if not found then raise exception 'Servis kartı tapılmadı'; end if;
  if p.id is null then
    select id into result from purchases where id=p_key;
    if found then return result; end if;
  end if;
  if p.required_part_id is not null then
    select * into r from job_required_parts where id=p.required_part_id and service_job_id=p.service_job_id;
    if not found then raise exception 'Tələb olunan detal tapılmadı'; end if;
    p.part_catalog_id := r.part_catalog_id;
    p.custom_item_name := null;
  end if;
  if p.source_type='CUSTOMER_PROVIDED' then p.unit_price:=0; end if;
  initial_paid := case when p.source_type<>'SUPPLIER' then 0 when p.payment_status='PAID' then p.quantity*p.unit_price when p.payment_status='PARTIAL' then p.paid_amount else 0 end;
  if p.id is null and p.source_type='SUPPLIER' and p.payment_status='PARTIAL' and (initial_paid is null or initial_paid<=0 or initial_paid>=p.quantity*p.unit_price) then raise exception 'Qismən ödəniş düzgün deyil'; end if;
  if p.id is null then
    insert into purchases(id,owner_user_id,service_job_id,required_part_id,part_catalog_id,custom_item_name,quantity,unit_price,source_type,supplier_id,purchased_by_worker_id,purchased_by_admin,payment_status,paid_amount,part_code_oem,brand_model,serial_no,document_no,purchase_date,notes)
    values(p_key,auth.uid(),p.service_job_id,p.required_part_id,p.part_catalog_id,p.custom_item_name,p.quantity,p.unit_price,p.source_type,p.supplier_id,p.purchased_by_worker_id,p.purchased_by_admin,'UNPAID',0,p.part_code_oem,p.brand_model,p.serial_no,p.document_no,p.purchase_date,p.notes) returning id into result;
    if initial_paid>0 then perform record_cash_payment(p.service_job_id,'SUPPLIER_PURCHASE',result,initial_paid,p.purchase_date,p.notes,p_key); end if;
  else
    select * into old_purchase from purchases where id=p.id and service_job_id=p.service_job_id and voided_at is null;
    if not found then raise exception 'Alış tapılmadı'; end if;
    -- Editing metadata/cost never silently edits a settlement; use Kassa for payment changes.
    update purchases set unit_price=p.unit_price,quantity=p.quantity,source_type=p.source_type,supplier_id=p.supplier_id,
      purchased_by_worker_id=p.purchased_by_worker_id,purchased_by_admin=p.purchased_by_admin,part_code_oem=p.part_code_oem,
      brand_model=p.brand_model,serial_no=p.serial_no,document_no=p.document_no,purchase_date=p.purchase_date,notes=p.notes
      where id=p.id returning id into result;
  end if;
  return result;
end $$;

create function create_workshop_job(p_vehicle jsonb,p_job jsonb,p_works jsonb,p_parts jsonb,p_key uuid) returns uuid language plpgsql security invoker set search_path = public as $$
declare v vehicles; j service_jobs; vid uuid; jid uuid; line jsonb; pos int:=0;
begin
  if auth.uid() is null then raise exception 'Sessiya tapılmadı'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  if exists(select 1 from service_jobs where id=p_key) then return p_key; end if;
  select * into v from jsonb_populate_record(null::vehicles,p_vehicle);
  select * into j from jsonb_populate_record(null::service_jobs,p_job);
  if nullif(trim(v.make),'') is null or nullif(trim(v.model),'') is null then raise exception 'Marka və model tələb olunur'; end if;
  if jsonb_array_length(p_works)+jsonb_array_length(p_parts)=0 then raise exception 'Ən azı bir iş və ya detal tələb olunur'; end if;
  if exists(select 1 from jsonb_array_elements(p_works) x group by x->>'catalogId' having count(*)>1) then raise exception 'Təkrar iş seçilib'; end if;
  insert into vehicles(owner_user_id,plate,make,model,vehicle_type,body_type,manufacturer,production_year,first_registration_date,vin_body_number,chassis_number,engine_number,engine_power_hp,engine_power_kw,color,registration_certificate_series_no,registration_valid_until,max_permitted_mass_kg,unladen_mass_kg,registered_owner_full_name,registered_owner_address)
  values(auth.uid(),v.plate,v.make,v.model,v.vehicle_type,v.body_type,v.manufacturer,v.production_year,v.first_registration_date,v.vin_body_number,v.chassis_number,v.engine_number,v.engine_power_hp,v.engine_power_kw,v.color,v.registration_certificate_series_no,v.registration_valid_until,v.max_permitted_mass_kg,v.unladen_mass_kg,v.registered_owner_full_name,v.registered_owner_address)
  on conflict(owner_user_id,plate) do update set make=excluded.make,model=excluded.model,
    vehicle_type=coalesce(excluded.vehicle_type,vehicles.vehicle_type),body_type=coalesce(excluded.body_type,vehicles.body_type),
    manufacturer=coalesce(excluded.manufacturer,vehicles.manufacturer),production_year=coalesce(excluded.production_year,vehicles.production_year),
    first_registration_date=coalesce(excluded.first_registration_date,vehicles.first_registration_date),vin_body_number=coalesce(excluded.vin_body_number,vehicles.vin_body_number),
    chassis_number=coalesce(excluded.chassis_number,vehicles.chassis_number),engine_number=coalesce(excluded.engine_number,vehicles.engine_number),
    engine_power_hp=coalesce(excluded.engine_power_hp,vehicles.engine_power_hp),engine_power_kw=coalesce(excluded.engine_power_kw,vehicles.engine_power_kw),
    color=coalesce(excluded.color,vehicles.color),registration_certificate_series_no=coalesce(excluded.registration_certificate_series_no,vehicles.registration_certificate_series_no),
    registration_valid_until=coalesce(excluded.registration_valid_until,vehicles.registration_valid_until),max_permitted_mass_kg=coalesce(excluded.max_permitted_mass_kg,vehicles.max_permitted_mass_kg),
    unladen_mass_kg=coalesce(excluded.unladen_mass_kg,vehicles.unladen_mass_kg),registered_owner_full_name=coalesce(excluded.registered_owner_full_name,vehicles.registered_owner_full_name),
    registered_owner_address=coalesce(excluded.registered_owner_address,vehicles.registered_owner_address)
  returning id into vid;
  jid:=p_key;
  insert into service_jobs(id,owner_user_id,vehicle_id,job_no,customer_name,customer_phone,funding_source,insurance_company,insurance_claim_no,insurance_approved_amount,agreed_budget,received_at,target_delivery_date,notes,has_line_quotes)
  values(jid,auth.uid(),vid,'PR-'||to_char(now() at time zone 'Asia/Baku','YYYY')||'-'||upper(left(replace(jid::text,'-',''),12)),j.customer_name,j.customer_phone,j.funding_source,j.insurance_company,j.insurance_claim_no,j.insurance_approved_amount,coalesce(j.agreed_budget,0),coalesce(j.received_at,now()),j.target_delivery_date,j.notes,true);
  for line in select * from jsonb_array_elements(p_works) loop
    if line->>'quotedPrice' is null or (line->>'quotedPrice')::numeric <> round((line->>'quotedPrice')::numeric,2) then raise exception 'Müştəri qiyməti iki onluq rəqəmli məbləğ olmalıdır'; end if;
    insert into job_work_items(owner_user_id,service_job_id,work_catalog_id,quoted_price,notes,display_order)
    values(auth.uid(),jid,(line->>'catalogId')::uuid,(line->>'quotedPrice')::numeric,line->>'note',pos);
    pos:=pos+1;
  end loop;
  pos:=0;
  for line in select * from jsonb_array_elements(p_parts) loop
    if line->>'quotedPrice' is null or (line->>'quotedPrice')::numeric <> round((line->>'quotedPrice')::numeric,2) then raise exception 'Müştəri qiyməti iki onluq rəqəmli məbləğ olmalıdır'; end if;
    insert into job_required_parts(owner_user_id,service_job_id,part_catalog_id,quoted_price,notes,display_order)
    values(auth.uid(),jid,(line->>'catalogId')::uuid,(line->>'quotedPrice')::numeric,line->>'note',pos);
    pos:=pos+1;
  end loop;
  return jid;
end $$;

commit;
