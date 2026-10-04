-- Forward-only. Apply manually after backup; never edit previously shipped migrations.
begin;

-- Supplier masters may be safely deleted; reconciliation still needs their durable identity.
alter table public.master_identities drop constraint master_identities_kind_check;
alter table public.master_identities add constraint master_identities_kind_check check(kind in ('worker','account','category','supplier'));
insert into public.master_identities(id,organization_id,kind,snapshot,deleted_at)
select distinct on (coalesce(p.supplier_id,p.historical_supplier_id)) coalesce(p.supplier_id,p.historical_supplier_id),p.organization_id,'supplier',p.supplier_snapshot,
  case when p.supplier_id is null then now() else null end
from public.purchases p where coalesce(p.supplier_id,p.historical_supplier_id) is not null and p.supplier_snapshot is not null
order by coalesce(p.supplier_id,p.historical_supplier_id),p.purchase_date desc,p.id
on conflict(id) do nothing;
insert into public.master_identities(id,organization_id,kind,snapshot)
select s.id,s.organization_id,'supplier',to_jsonb(s) from public.suppliers s
on conflict(id) do update set snapshot=excluded.snapshot,deleted_at=null;
create function prime_private.track_reconciliation_supplier() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    update public.master_identities set snapshot=to_jsonb(old),deleted_at=now() where id=old.id and organization_id=old.organization_id;
    return old;
  end if;
  insert into public.master_identities(id,organization_id,kind,snapshot) values(new.id,new.organization_id,'supplier',to_jsonb(new))
    on conflict(id) do update set snapshot=excluded.snapshot where master_identities.organization_id=excluded.organization_id;
  return new;
end $$;
create trigger z_reconciliation_identity after insert or update or delete on public.suppliers for each row execute function prime_private.track_reconciliation_supplier();
revoke all on function prime_private.track_reconciliation_supplier() from public,anon,authenticated;

create sequence public.reconciliation_document_number;
create table public.reconciliation_documents (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  document_number text not null unique,
  entity_type text not null check(entity_type in ('worker','supplier')),
  entity_id uuid not null references public.master_identities(id),
  entity_name_snapshot text not null,
  entity_snapshot jsonb not null,
  period_from date not null,
  period_to date not null check(period_to >= period_from),
  service_job_id uuid references public.service_jobs(id),
  source_snapshot jsonb not null,
  report_snapshot jsonb,
  totals_snapshot jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  status text not null default 'DRAFT' check(status in ('DRAFT','CONFIRMED')),
  confirmed_by uuid references auth.users(id),
  confirmed_by_name text,
  confirmed_at timestamptz,
  signed_file_path text,
  signed_file_sha256 text,
  signed_file_size bigint,
  note text check(length(note)<=1000),
  version integer not null check(version>0),
  supersedes_document_id uuid references public.reconciliation_documents(id),
  superseded_by uuid references public.reconciliation_documents(id),
  outdated boolean not null default false,
  check((status='DRAFT' and confirmed_by is null and confirmed_at is null) or
    (status='CONFIRMED' and confirmed_by is not null and confirmed_at is not null and signed_file_path is not null and report_snapshot is not null))
);
create unique index reconciliation_version on public.reconciliation_documents
  (organization_id,entity_type,entity_id,period_from,period_to,coalesce(service_job_id,'00000000-0000-0000-0000-000000000000'::uuid),version);
create index reconciliation_history on public.reconciliation_documents(organization_id,entity_type,entity_id,period_from,period_to,created_at desc);
create index reconciliation_recent on public.reconciliation_documents(organization_id,entity_type,created_at desc,id);
create table public.reconciliation_sources (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.reconciliation_documents(id),
  organization_id uuid not null references public.organizations(id),
  ledger_id uuid references public.cash_transactions(id),
  work_item_id uuid references public.job_work_items(id),
  purchase_id uuid references public.purchases(id),
  return_id uuid references public.purchase_returns(id),
  advance_allocation_id uuid references public.worker_advance_allocations(id),
  credit_allocation_id uuid references public.supplier_credit_allocations(id),
  check(num_nonnulls(ledger_id,work_item_id,purchase_id,return_id,advance_allocation_id,credit_allocation_id)=1)
);
create index reconciliation_sources_document on public.reconciliation_sources(document_id);
do $$ declare t text; begin
  foreach t in array array['reconciliation_documents','reconciliation_sources'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy finance_read on public.%I for select to authenticated using(organization_id=prime_private.organization_id() and prime_private.has_role(array[''ADMIN'',''CASHIER'']::public.app_role[]))',t);
  end loop;
end $$;

-- Capture with the caller's finance authorization in one database transaction.
-- Related pre-period records are retained for opening balances; future events are excluded.
create function prime_private.reconciliation_source(p_type text,p_entity uuid,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
  result jsonb:='{}'; k text; a jsonb;
begin
  foreach k in array array['jobs','work','purchases','ledger','workers','advances','advance_allocations','purchase_returns','supplier_credit_allocations'] loop
    if k='ledger' then
      with chronology as (
        select r, sum(case when r->>'voided_at' is not null then 0 when r->>'direction'='IN' then (r->>'amount')::numeric else -(r->>'amount')::numeric end)
          over(partition by r->>'channel',r->>'financial_account_id',r->>'currency' order by (r->>'occurred_at')::timestamptz,r->>'id' rows unbounded preceding) balance
        from public.finance_data('ledger') r where (r->>'transaction_date')::date<=p_to
      ) select coalesce(jsonb_agg(r||jsonb_build_object('account_balance',balance) order by r->>'id'),'[]') into a
        from chronology where r->>case when p_type='worker' then 'worker_identity_id' else 'supplier_identity_id' end=p_entity::text;
    else
      select coalesce(jsonb_agg(r order by r->>'id'),'[]') into a from public.finance_data(k) r
      where case k
        when 'work' then p_type='worker' and r->>'worker_id'=p_entity::text
        when 'purchases' then p_type='supplier' and r->>'supplier_id'=p_entity::text and (r->>'purchase_date')::date<=p_to
        when 'workers' then p_type='worker' and r->>'id'=p_entity::text
        when 'advances' then p_type='worker' and r->>'worker_id'=p_entity::text and ((r->>'occurred_at')::timestamptz at time zone 'Asia/Baku')::date<=p_to
        when 'advance_allocations' then p_type='worker' and r->>'worker_id'=p_entity::text and ((r->>'created_at')::timestamptz at time zone 'Asia/Baku')::date<=p_to
        when 'purchase_returns' then p_type='supplier' and r->>'supplier_id'=p_entity::text and ((r->>'occurred_at')::timestamptz at time zone 'Asia/Baku')::date<=p_to
        when 'supplier_credit_allocations' then p_type='supplier' and r->>'supplier_id'=p_entity::text and ((r->>'created_at')::timestamptz at time zone 'Asia/Baku')::date<=p_to
        else true end;
    end if;
    result:=result||jsonb_build_object(case k when 'advance_allocations' then 'advanceAllocations' when 'purchase_returns' then 'purchaseReturns' when 'supplier_credit_allocations' then 'supplierCredits' else k end,a);
  end loop;
  select coalesce(jsonb_agg(r),'[]') into a from jsonb_array_elements(result->'jobs') r where exists (
    select 1 from jsonb_array_elements((result->'work')||(result->'purchases')||(result->'ledger')) s where s->>'service_job_id'=r->>'id');
  result:=jsonb_set(result,'{jobs}',a);
  select coalesce(jsonb_agg(to_jsonb(account_row) order by account_row.id),'[]') into a from public.financial_accounts account_row where account_row.organization_id=org;
  result:=result||jsonb_build_object('accounts',a);
  select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') into a from public.transaction_categories c where c.organization_id=org;
  return result||jsonb_build_object('categories',a);
end $$;

create function prime_private.reconciliation_audit(d public.reconciliation_documents,p_action text,p_message text) returns void
language sql security definer set search_path='' as $$
  select prime_private.write_audit(d.organization_id,auth.uid(),p_action,'reconciliation_documents',d.id,d.service_job_id,null,p_message,'{}',
    jsonb_build_object('document_number',d.document_number,'name',d.entity_name_snapshot,'period_from',d.period_from,'period_to',d.period_to,
      'version',d.version,'totals',d.totals_snapshot));
$$;

create function public.create_reconciliation(p_id uuid,p_type text,p_entity uuid,p_from date,p_to date,p_job uuid default null,p_note text default null,p_previous uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]);
  party public.master_identities; d public.reconciliation_documents; previous public.reconciliation_documents; source jsonb; k text; col text;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  select * into d from public.reconciliation_documents where id=p_id;
  if found then
    if d.organization_id<>org or d.created_by<>auth.uid() or d.entity_type<>p_type or d.entity_id<>p_entity or d.period_from<>p_from or d.period_to<>p_to or d.service_job_id is distinct from p_job then raise exception 'Hesablaşma sorğusu uyğun deyil'; end if;
    return d.id;
  end if;
  if p_type not in ('worker','supplier') or p_from is null or p_to is null or p_from>p_to then raise exception 'Tərəfi və düzgün tarix aralığını seçin'; end if;
  select * into party from public.master_identities where id=p_entity and organization_id=org and kind=p_type;
  if not found then raise exception 'Hesablaşma tərəfi tapılmadı'; end if;
  if p_job is not null and not exists(select 1 from public.service_jobs where id=p_job and organization_id=org) then raise exception 'Servis kartı tapılmadı'; end if;
  select * into previous from public.reconciliation_documents where organization_id=org and entity_type=p_type and entity_id=p_entity and period_from=p_from and period_to=p_to and service_job_id is not distinct from p_job order by version desc limit 1;
  if previous.id is not null and p_previous is distinct from previous.id then raise exception 'Bu dövr üçün sənəd mövcuddur. Son sənəddən yeni versiya yaradın'; end if;
  if previous.id is null and p_previous is not null then raise exception 'Əvvəlki hesablaşma tapılmadı'; end if;
  source:=prime_private.reconciliation_source(p_type,p_entity,p_to);
  insert into public.reconciliation_documents(id,organization_id,document_number,entity_type,entity_id,entity_name_snapshot,entity_snapshot,period_from,period_to,service_job_id,source_snapshot,created_by,note,version,supersedes_document_id)
  values(p_id,org,'PR-HES-'||extract(year from current_date)::text||'-'||lpad(nextval('public.reconciliation_document_number')::text,6,'0'),p_type,p_entity,
    case when p_type='worker' then concat_ws(' ',party.snapshot->>'first_name',party.snapshot->>'last_name') else coalesce(party.snapshot->>'company_name',nullif(concat_ws(' ',party.snapshot->>'first_name',party.snapshot->>'last_name'),''),'Təchizatçı') end,
    party.snapshot,p_from,p_to,p_job,source,auth.uid(),nullif(btrim(p_note),''),coalesce(previous.version,0)+1,previous.id) returning * into d;
  foreach k in array array['ledger','work','purchases','purchaseReturns','advanceAllocations','supplierCredits'] loop
    col:=case k when 'ledger' then 'ledger_id' when 'work' then 'work_item_id' when 'purchases' then 'purchase_id' when 'purchaseReturns' then 'return_id' when 'advanceAllocations' then 'advance_allocation_id' else 'credit_allocation_id' end;
    execute format('insert into public.reconciliation_sources(document_id,organization_id,%I) select $1,$2,(r->>''id'')::uuid from jsonb_array_elements($3) r',col) using d.id,org,source->k;
  end loop;
  perform prime_private.reconciliation_audit(d,'RECONCILIATION_CREATED','Hesablaşma sənədi yaradıldı');
  return d.id;
end $$;

-- Only the authenticated server can seal its canonical renderer output, once.
create function public.seal_reconciliation(p_id uuid,p_org uuid,p_report jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if jsonb_typeof(p_report->'summary')<>'array' or jsonb_typeof(p_report->'sections')<>'array' then raise exception 'Hesablaşma hesabatı düzgün deyil'; end if;
  update public.reconciliation_documents set report_snapshot=p_report,totals_snapshot=p_report->'summary'
    where id=p_id and organization_id=p_org and status='DRAFT' and report_snapshot is null;
end $$;

create function public.attach_reconciliation_file(p_id uuid,p_org uuid,p_actor uuid,p_path text,p_hash text,p_size bigint) returns void
language plpgsql security definer set search_path='' as $$
declare d public.reconciliation_documents;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||'finance',0));
  select * into d from public.reconciliation_documents where id=p_id and organization_id=p_org for update;
  if not found or d.status<>'DRAFT' or d.outdated then raise exception 'İmzalı fayl üçün yeni hesablaşma versiyası yaradın'; end if;
  if not exists(select 1 from public.user_profiles where auth_user_id=p_actor and organization_id=p_org and is_active and role in ('ADMIN','CASHIER')) then raise exception 'Bu əməliyyata icazə yoxdur'; end if;
  if p_path !~ ('^'||p_org::text||'/reconciliations/'||p_id::text||'/[0-9a-f-]{36}\.pdf$') or p_hash !~ '^[0-9a-f]{64}$' or p_size not between 5 and 10485760
    or not exists(select 1 from storage.objects where bucket_id='prime-reconciliations' and name=p_path) then raise exception 'İmzalı sənədin faylı düzgün deyil'; end if;
  update public.reconciliation_documents set signed_file_path=p_path,signed_file_sha256=p_hash,signed_file_size=p_size where id=p_id;
  perform prime_private.write_audit(p_org,p_actor,'RECONCILIATION_SIGNED_FILE_UPLOADED','reconciliation_documents',d.id,d.service_job_id,null,'İmzalı hesablaşma sənədi yükləndi','{}',jsonb_build_object('document_number',d.document_number,'name',d.entity_name_snapshot,'period_from',d.period_from,'period_to',d.period_to,'version',d.version));
end $$;

create function public.confirm_reconciliation(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare org uuid:=prime_private.require_role(array['ADMIN','CASHIER']::public.app_role[]); d public.reconciliation_documents; prior public.reconciliation_documents;
begin
  perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
  select * into d from public.reconciliation_documents where id=p_id and organization_id=org for update;
  if not found then raise exception 'Hesablaşma tapılmadı'; end if;
  if d.status='CONFIRMED' then return; end if;
  if d.outdated then raise exception 'Yenilənmə tələb olunur. Yeni versiya yaradın'; end if;
  if d.signed_file_path is null or d.report_snapshot is null then raise exception 'Əvvəlcə hesabatı və imzalı PDF sənədini yadda saxlayın'; end if;
  if exists(select 1 from public.reconciliation_documents where supersedes_document_id=d.id) then raise exception 'Daha yeni versiya mövcuddur'; end if;
  update public.reconciliation_documents set status='CONFIRMED',confirmed_by=auth.uid(),confirmed_by_name=(select display_name from public.user_profiles where auth_user_id=auth.uid()),confirmed_at=now() where id=d.id returning * into d;
  perform prime_private.reconciliation_audit(d,'RECONCILIATION_CONFIRMED','Hesablaşma təsdiqləndi');
  for prior in with recursive chain as (
    select * from public.reconciliation_documents where id=d.supersedes_document_id
    union all select r.* from public.reconciliation_documents r join chain c on r.id=c.supersedes_document_id
  ) select * from chain where status='CONFIRMED' and superseded_by is null loop
    update public.reconciliation_documents set superseded_by=d.id where id=prior.id;
    perform prime_private.reconciliation_audit(prior,'RECONCILIATION_SUPERSEDED','Hesablaşma yeni versiya ilə əvəz edildi');
  end loop;
end $$;

create function prime_private.guard_reconciliation() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Hesablaşma tarixçəsi silinə bilməz'; end if;
  if (to_jsonb(new)-array['report_snapshot','totals_snapshot','signed_file_path','signed_file_sha256','signed_file_size','status','confirmed_by','confirmed_by_name','confirmed_at','superseded_by','outdated'])
    is distinct from (to_jsonb(old)-array['report_snapshot','totals_snapshot','signed_file_path','signed_file_sha256','signed_file_size','status','confirmed_by','confirmed_by_name','confirmed_at','superseded_by','outdated'])
    or (old.report_snapshot is not null and (new.report_snapshot is distinct from old.report_snapshot or new.totals_snapshot is distinct from old.totals_snapshot))
    or (old.status='CONFIRMED' and (to_jsonb(new)-array['outdated','superseded_by']) is distinct from (to_jsonb(old)-array['outdated','superseded_by'])) then
    raise exception 'Hesablaşma dəyişdirilə bilməz. Yeni versiya yaradın';
  end if;
  return new;
end $$;
create trigger reconciliation_immutable before update or delete on public.reconciliation_documents for each row execute function prime_private.guard_reconciliation();

-- Backdated changes affect opening balances too. Never rewrite the signed snapshot.
create function prime_private.invalidate_reconciliations() returns trigger
language plpgsql security definer set search_path='' as $$
declare r jsonb; d public.reconciliation_documents; org uuid; day date; party uuid; job uuid; source_id uuid;
begin
  if tg_op='UPDATE' and to_jsonb(old)=to_jsonb(new) then return new; end if;
  for r in select v from jsonb_array_elements(case when tg_op='INSERT' then jsonb_build_array(to_jsonb(new)) when tg_op='DELETE' then jsonb_build_array(to_jsonb(old)) else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end) v loop
    org:=(r->>'organization_id')::uuid;
    perform pg_advisory_xact_lock(hashtextextended(org::text||'finance',0));
    source_id:=(r->>'id')::uuid;
    job:=(r->>'service_job_id')::uuid;
    party:=coalesce(r->>'worker_identity_id',r->>'supplier_identity_id',r->>'assigned_worker_id',r->>'supplier_id',r->'counterparty_details'->>'worker_id')::uuid;
    if tg_table_name='worker_advance_allocations' then select worker_id into party from public.worker_advances where transaction_id=(r->>'advance_id')::uuid; end if;
    if tg_table_name='supplier_credit_allocations' then select supplier_id into party from public.purchase_returns where id=(r->>'return_id')::uuid; end if;
    day:=coalesce((r->>'transaction_date')::date,(r->>'purchase_date')::date,
      (coalesce(r->>'completed_at',r->>'occurred_at',r->>'created_at')::timestamptz at time zone 'Asia/Baku')::date,current_date);
    for d in select x.* from public.reconciliation_documents x where x.organization_id=org and not x.outdated and (
      (x.entity_id=party and day<=x.period_to)
      or exists(select 1 from public.reconciliation_sources s where s.document_id=x.id and source_id in(s.ledger_id,s.work_item_id,s.purchase_id,s.return_id,s.advance_allocation_id,s.credit_allocation_id))
      or (tg_table_name='cash_transactions' and day<=x.period_to and exists(select 1 from jsonb_array_elements(x.source_snapshot->'ledger') t where t->>'channel'=r->>'channel' and t->>'financial_account_id' is not distinct from r->>'financial_account_id' and (t->>'occurred_at')::timestamptz>=(r->>'occurred_at')::timestamptz))
    ) loop
      update public.reconciliation_documents set outdated=true where id=d.id;
      if d.status='CONFIRMED' then perform prime_private.reconciliation_audit(d,'RECONCILIATION_PERIOD_CHANGED_AFTER_CONFIRMATION','Təsdiqlənmiş dövr dəyişib. Yenilənmə tələb olunur'); end if;
    end loop;
  end loop;
  return coalesce(new,old);
end $$;
do $$ declare t text; begin
  foreach t in array array['cash_transactions','job_work_items','purchases','purchase_returns','worker_advance_allocations','supplier_credit_allocations'] loop
    execute format('create trigger reconciliation_changed after insert or update or delete on public.%I for each row execute function prime_private.invalidate_reconciliations()',t);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('prime-reconciliations','prime-reconciliations',false,10485760,array['application/pdf']);
create policy reconciliation_bucket_read on storage.buckets for select to authenticated using (
  id='prime-reconciliations' and prime_private.has_role(array['ADMIN','CASHIER']::public.app_role[])
);
-- Uploads go through the authenticated server's byte validation. No client INSERT/UPDATE/DELETE policy.
create policy reconciliation_signed_read on storage.objects for select to authenticated using (
  bucket_id='prime-reconciliations' and exists(select 1 from public.reconciliation_documents d
    where d.signed_file_path=name and d.organization_id=prime_private.organization_id()
      and prime_private.has_role(array['ADMIN','CASHIER']::public.app_role[]))
);

-- Defense against unrelated permissive policies added to the shared Storage table.
create policy reconciliation_read_boundary on storage.objects as restrictive for select to authenticated using (
  bucket_id<>'prime-reconciliations' or (prime_private.has_role(array['ADMIN','CASHIER']::public.app_role[]) and exists(
    select 1 from public.reconciliation_documents d where d.signed_file_path=name and d.organization_id=prime_private.organization_id()))
);
create policy reconciliation_anonymous_boundary on storage.objects as restrictive for select to anon using(bucket_id<>'prime-reconciliations');
create policy reconciliation_insert_boundary on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'prime-reconciliations');
create policy reconciliation_update_boundary on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'prime-reconciliations') with check(bucket_id<>'prime-reconciliations');
create policy reconciliation_delete_boundary on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'prime-reconciliations');

revoke all on sequence public.reconciliation_document_number from public,anon,authenticated;
revoke all on function prime_private.reconciliation_source(text,uuid,date),prime_private.reconciliation_audit(public.reconciliation_documents,text,text),prime_private.guard_reconciliation(),prime_private.invalidate_reconciliations() from public,anon,authenticated;
revoke all on function public.create_reconciliation(uuid,text,uuid,date,date,uuid,text,uuid),public.confirm_reconciliation(uuid),public.seal_reconciliation(uuid,uuid,jsonb),public.attach_reconciliation_file(uuid,uuid,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.create_reconciliation(uuid,text,uuid,date,date,uuid,text,uuid),public.confirm_reconciliation(uuid) to authenticated;
grant execute on function public.seal_reconciliation(uuid,uuid,jsonb),public.attach_reconciliation_file(uuid,uuid,uuid,text,text,bigint) to service_role;
notify pgrst,'reload schema';
commit;
