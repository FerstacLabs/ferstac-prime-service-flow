begin;

-- Durable identities keep immutable ledger/work references valid after master deletion.
create table public.master_identities (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  kind text not null check(kind in ('worker','account','category')),
  snapshot jsonb not null,
  deleted_at timestamptz
);
alter table public.master_identities enable row level security;
revoke all on public.master_identities from public,anon,authenticated;
alter table public.transaction_categories add column is_system boolean not null default false;
update public.transaction_categories set is_system=true where name in ('Müştəri ödənişi','Təchizatçı ödənişi','Usta ödənişi');
insert into public.master_identities select id,organization_id,'worker',to_jsonb(w),null from public.workers w;
insert into public.master_identities select id,organization_id,'account',to_jsonb(a),null from public.financial_accounts a;
insert into public.master_identities select id,organization_id,'category',to_jsonb(c),null from public.transaction_categories c;

alter table public.job_work_items drop constraint job_work_items_assigned_worker_id_fkey;
alter table public.job_work_items add constraint job_work_items_assigned_worker_id_fkey foreign key(assigned_worker_id) references public.master_identities(id);
alter table public.purchases drop constraint purchases_purchased_by_worker_id_fkey;
alter table public.purchases add constraint purchases_purchased_by_worker_id_fkey foreign key(purchased_by_worker_id) references public.master_identities(id);
alter table public.cash_transactions drop constraint cash_transactions_financial_account_id_fkey;
alter table public.cash_transactions add constraint cash_transactions_financial_account_id_fkey foreign key(financial_account_id) references public.master_identities(id);
alter table public.cash_transactions drop constraint cash_transactions_category_id_fkey;
alter table public.cash_transactions add constraint cash_transactions_category_id_fkey foreign key(category_id) references public.master_identities(id);

-- Unchanged historical worker links remain valid for cost corrections and reversals.
create or replace function public.enforce_workshop_relations() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare ref record; linked uuid; new_json jsonb := to_jsonb(new);
begin
  if tg_op='UPDATE' and (new.owner_user_id is distinct from old.owner_user_id or new.organization_id<>old.organization_id) then
    raise exception 'Creator and organization are immutable';
  end if;
  if new_json ? 'notes' and length(new_json->>'notes')>250 and (tg_op='INSERT' or new_json->>'notes' is distinct from to_jsonb(old)->>'notes') then
    raise exception 'Qeyd maksimum 250 simvol ola bilər';
  end if;
  for ref in select * from (values
    ('vehicle_id','vehicles'),('service_job_id','service_jobs'),('role_id','worker_roles'),
    ('work_catalog_id','work_catalog'),('part_catalog_id','part_catalog'),('assigned_worker_id','master_identities'),
    ('supplier_id','suppliers'),('purchased_by_worker_id','master_identities'),('required_part_id','job_required_parts'),
    ('work_item_id','job_work_items'),('purchase_id','purchases')
  ) refs(field_name,table_name) loop
    if new_json->>ref.field_name is not null then
      execute format('select organization_id from public.%I where id=$1',ref.table_name) into linked using (new_json->>ref.field_name)::uuid;
      if linked is distinct from new.organization_id then raise exception 'Related record not found' using errcode='42501'; end if;
    end if;
  end loop;
  if tg_op='UPDATE' and new_json ? 'service_job_id' and new_json->>'service_job_id'<>to_jsonb(old)->>'service_job_id' then raise exception 'Servis kartı dəyişdirilə bilməz'; end if;
  if tg_table_name='job_work_items' and tg_op='INSERT' then
    perform 1 from service_jobs where id=new.service_job_id for update;
    if new.work_catalog_id is not null and exists(select 1 from job_work_items where service_job_id=new.service_job_id and work_catalog_id=new.work_catalog_id) then raise exception 'Təkrar iş seçilib'; end if;
    if new.quoted_price is null and exists(select 1 from service_jobs where id=new.service_job_id and has_line_quotes) then raise exception 'Müştəri qiyməti tələb olunur'; end if;
  end if;
  if tg_table_name='purchases' then
    if new.required_part_id is not null and not exists(select 1 from job_required_parts where id=new.required_part_id and service_job_id=new.service_job_id and part_catalog_id=new.part_catalog_id) then raise exception 'Detal bu servis kartına aid deyil'; end if;
    if new.source_type='CUSTOMER_PROVIDED' and (new.unit_price<>0 or new.paid_amount<>0) then raise exception 'Müştərinin detalı alış borcu yaratmır'; end if;
  end if;
  return new;
end $$;

create function prime_private.track_master_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare master_kind text:=case tg_table_name when 'workers' then 'worker' when 'financial_accounts' then 'account' else 'category' end; event text;
begin
  if tg_op='DELETE' then
    update public.master_identities set snapshot=to_jsonb(old)||jsonb_build_object('active',false)||case when master_kind='worker' then jsonb_build_object('worker_roles',(select jsonb_build_object('id',r.id,'name',r.name) from public.worker_roles r where r.id=(to_jsonb(old)->>'role_id')::uuid)) else '{}'::jsonb end,deleted_at=now() where id=old.id and organization_id=old.organization_id;
    return old;
  end if;
  insert into public.master_identities(id,organization_id,kind,snapshot) values(new.id,new.organization_id,master_kind,to_jsonb(new))
    on conflict(id) do update set snapshot=excluded.snapshot where master_identities.organization_id=excluded.organization_id and master_identities.deleted_at is null;
  if tg_op='UPDATE' and new.active is distinct from old.active then
    event:=case master_kind when 'worker' then 'WORKER' when 'account' then 'BANK_ACCOUNT' else 'TRANSACTION_CATEGORY' end || case when new.active then '_RESTORED' else '_ARCHIVED' end;
    perform prime_private.write_audit(new.organization_id,auth.uid(),event,tg_table_name,new.id,null,null,event,'{}',jsonb_build_object('name',coalesce(to_jsonb(new)->>'name',concat_ws(' ',to_jsonb(new)->>'first_name',to_jsonb(new)->>'last_name'))));
  end if;
  return new;
end $$;
create trigger z_identity after insert or update or delete on public.workers for each row execute function prime_private.track_master_identity();
create trigger z_identity after insert or update or delete on public.financial_accounts for each row execute function prime_private.track_master_identity();
create trigger z_identity after insert or update or delete on public.transaction_categories for each row execute function prime_private.track_master_identity();

create function public.master_directory(p_kind text) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid;
begin
  org:=prime_private.require_role(case when p_kind='worker' then array['ADMIN']::public.app_role[] else array['ADMIN','CASHIER']::public.app_role[] end);
  if p_kind not in ('worker','account','category') then raise exception 'Naməlum məlumat növü'; end if;
  return query select i.snapshot||jsonb_build_object('deleted_at',i.deleted_at)||case when p_kind='worker' then jsonb_build_object('worker_roles',coalesce(i.snapshot->'worker_roles',(select jsonb_build_object('id',r.id,'name',r.name) from public.worker_roles r where r.id=(i.snapshot->>'role_id')::uuid))) else '{}'::jsonb end from public.master_identities i where i.organization_id=org and i.kind=p_kind order by i.id;
end $$;

create function public.manage_master_lifecycle(p_kind text,p_id uuid,p_action text,p_confirmation text default '') returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); t text; row_data jsonb; balance numeric; event text;
begin
  if p_action not in ('archive','restore','delete') then raise exception 'Əməliyyat yanlışdır'; end if;
  t:=case p_kind when 'worker' then 'workers' when 'account' then 'financial_accounts' when 'category' then 'transaction_categories' end;
  if t is null then raise exception 'Məlumat növü yanlışdır'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  execute format('select to_jsonb(t) from public.%I t where id=$1 and organization_id=$2 for update',t) into row_data using p_id,org;
  if row_data is null then raise exception 'Qeyd tapılmadı' using errcode='42501'; end if;
  if p_kind='category' and (row_data->>'is_system')::boolean then raise exception 'Sistem kateqoriyası qorunur'; end if;
  if p_action<>'delete' then
    execute format('update public.%I set active=$1 where id=$2 and organization_id=$3',t) using p_action='restore',p_id,org;
    return;
  end if;
  if p_confirmation<>'SİL' then raise exception 'Təsdiq üçün SİL yazın'; end if;
  if p_kind='worker' and exists(select 1 from public.job_work_items where assigned_worker_id=p_id and status in ('TODO','IN_PROGRESS')) then
    raise exception 'Bu işçiyə aktiv işlər təyin olunub. Silməzdən əvvəl həmin işləri başqa ustaya təyin edin və ya tamamlayın.';
  end if;
  if p_kind='account' then
    select coalesce(sum(case direction when 'IN' then amount else -amount end),0) into balance from public.cash_transactions where organization_id=org and financial_account_id=p_id and voided_at is null;
    if balance<>0 then raise exception 'Hesabın qalığı sıfır deyil. Silməzdən əvvəl vəsaiti uzlaşdırın.'; end if;
    if exists(select 1 from public.cash_transactions x where x.financial_account_id=p_id and x.transfer_id is not null and exists(select 1 from public.cash_transactions y where y.organization_id=org and y.transfer_id=x.transfer_id group by y.transfer_id having count(*)<>2 or count(*) filter(where voided_at is null) not in (0,2) or sum(case direction when 'IN' then amount else -amount end)<>0)) then raise exception 'Həll olunmamış köçürmə var'; end if;
  end if;
  execute format('delete from public.%I where id=$1 and organization_id=$2',t) using p_id,org;
  event:=case p_kind when 'worker' then 'WORKER' when 'account' then 'BANK_ACCOUNT' else 'TRANSACTION_CATEGORY' end||'_PERMANENTLY_DELETED';
  perform prime_private.write_audit(org,auth.uid(),event,t,p_id,null,null,event,'{}',jsonb_build_object('name',coalesce(row_data->>'name',concat_ws(' ',row_data->>'first_name',row_data->>'last_name'))));
end $$;

-- Delete must only be possible through the guarded lifecycle RPC.
revoke delete on public.workers from authenticated;
create function prime_private.validate_worker_assignment() returns trigger language plpgsql security definer set search_path='' as $$
declare worker uuid;
begin
  worker:=(to_jsonb(new)->>case when tg_table_name='job_work_items' then 'assigned_worker_id' else 'purchased_by_worker_id' end)::uuid;
  if worker is not null and (tg_op='INSERT' or (to_jsonb(new)->case when tg_table_name='job_work_items' then 'assigned_worker_id' else 'purchased_by_worker_id' end) is distinct from (to_jsonb(old)->case when tg_table_name='job_work_items' then 'assigned_worker_id' else 'purchased_by_worker_id' end)) then
    perform 1 from public.workers where id=worker and organization_id=new.organization_id and active for share;
    if not found then raise exception 'Aktiv usta seçin'; end if;
    if tg_table_name='job_work_items' and tg_op='UPDATE' then
      if old.assigned_worker_id is null and old.status='TODO' and new.status='TODO' then new.status:='IN_PROGRESS'; new.started_at:=coalesce(new.started_at,now()); end if;
    end if;
  end if;
  return new;
end $$;
create trigger ac_operational_assignment before insert or update on public.job_work_items for each row execute function prime_private.validate_worker_assignment();
create trigger ac_operational_assignment before insert or update on public.purchases for each row execute function prime_private.validate_worker_assignment();
create trigger c_assignment_status after update of assigned_worker_id on public.job_work_items for each row when(old.status is distinct from new.status) execute function public.derive_job_status();

-- Payments against completed historical work retain a readable recipient after deletion.
create function prime_private.historical_worker_recipient() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.allocation_type='WORKER_WORK_ITEM' and nullif(new.counterparty_name_snapshot,'') is null then
    select concat_ws(' ',snapshot->>'first_name',snapshot->>'last_name') into new.counterparty_name_snapshot from public.master_identities where id=new.worker_identity_id and organization_id=new.organization_id and kind='worker';
  end if;
  return new;
end $$;
create trigger c_historical_worker before insert on public.cash_transactions for each row execute function prime_private.historical_worker_recipient();
revoke all on function prime_private.historical_worker_recipient() from public,anon,authenticated;

-- Keep previous financial master validation and account behavior intact.
alter function public.save_financial_master(text,jsonb) rename to save_financial_master_0008;
revoke all on function public.save_financial_master_0008(text,jsonb) from public,anon,authenticated;
create function public.save_financial_master(p_kind text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN']::public.app_role[]); result uuid; c public.transaction_categories;
begin
  if p_kind='category' and nullif(p_data->>'id','') is not null then
    select * into c from public.transaction_categories where id=(p_data->>'id')::uuid and organization_id=org for update;
    if not found then raise exception 'Kateqoriya tapılmadı'; end if;
    if c.is_system then raise exception 'Sistem kateqoriyası qorunur'; end if;
    if c.direction<>p_data->>'direction' and exists(select 1 from public.cash_transactions where category_id=c.id) then raise exception 'İstifadə edilmiş kateqoriyanın istiqaməti dəyişdirilə bilməz'; end if;
    update public.transaction_categories set name=trim(p_data->>'name'),direction=p_data->>'direction',active=coalesce((p_data->>'active')::boolean,true) where id=c.id returning id into result;
    perform prime_private.write_audit(org,auth.uid(),'TRANSACTION_CATEGORY_UPDATED','transaction_categories',result,null,null,'Kateqoriya yeniləndi','{}',jsonb_build_object('name',p_data->>'name'));
    return result;
  end if;
  return public.save_financial_master_0008(p_kind,p_data);
end $$;

alter function public.work_queue_data(text) rename to work_queue_data_0008;
revoke all on function public.work_queue_data_0008(text) from public,anon,authenticated;
create function public.work_queue_data(p_kind text) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','INTAKE']::public.app_role[]);
begin
  if p_kind='workers' then
    return query select jsonb_build_object('id',id,'first_name',snapshot->>'first_name','last_name',snapshot->>'last_name','active',deleted_at is null and (snapshot->>'active')::boolean,'deleted_at',deleted_at) from public.master_identities where organization_id=org and kind='worker' order by id;
  else return query select * from public.work_queue_data_0008(p_kind); end if;
end $$;

alter function public.finance_data(text,uuid) rename to finance_data_0008;
revoke all on function public.finance_data_0008(text,uuid) from public,anon,authenticated;
create function public.finance_data(p_kind text,p_job uuid default null) returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
begin
  if p_kind='work' then
    return query select row||jsonb_build_object('worker',coalesce(nullif(row->>'worker',''),concat_ws(' ',i.snapshot->>'first_name',i.snapshot->>'last_name'))) from public.finance_data_0008(p_kind,p_job) row left join public.master_identities i on i.id=(row->>'worker_id')::uuid and i.organization_id=org and i.kind='worker';
  else return query select * from public.finance_data_0008(p_kind,p_job); end if;
end $$;

revoke all on function prime_private.track_master_identity(),prime_private.validate_worker_assignment(),public.master_directory(text),public.manage_master_lifecycle(text,uuid,text,text),public.save_financial_master(text,jsonb),public.work_queue_data(text),public.finance_data(text,uuid) from public,anon,authenticated;
grant execute on function public.master_directory(text),public.manage_master_lifecycle(text,uuid,text,text),public.save_financial_master(text,jsonb),public.work_queue_data(text),public.finance_data(text,uuid) to authenticated;
commit;
