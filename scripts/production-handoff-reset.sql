-- ONE-TIME OWNER-ONLY MAINTENANCE. NEVER run automatically or through application RPC.
-- All psql variables are mandatory. See docs/production-handoff-reset.md.
\set ON_ERROR_STOP on
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';
set local row_security=off;
select set_config('prime.handoff_org', :'org', true),
  set_config('prime.handoff_approval', :'approval', true),
  set_config('prime.handoff_backup', :'backup_verified', true),
  set_config('prime.handoff_writes', :'writes_stopped', true),
  set_config('prime.handoff_database', :'expected_database', true),
  set_config('prime.handoff_review', :'reviewed_inventory', true),
  set_config('prime.handoff_admin', :'admin_id', true),
  set_config('prime.handoff_cashier', :'cashier_id', true),
  set_config('prime.handoff_intake', :'intake_id', true);
do $guard$
declare t record; org uuid:=current_setting('prime.handoff_org')::uuid;
begin
  if current_setting('prime.handoff_approval')<>'RESET BUSINESS DATA '||org::text
    or current_setting('prime.handoff_backup')<>'yes' or current_setting('prime.handoff_writes')<>'yes'
    or current_setting('prime.handoff_database')<>current_database() then
    raise exception 'Missing explicit organization approval, verified backup, write freeze or matching database';
  end if;
  -- Lock auth and public rows BEFORE taking the comparison snapshot. No login/write traffic during reset.
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','auth') and c.relkind='r' order by n.nspname,c.relname loop
    execute format('lock table %I.%I in %s mode',t.nspname,t.relname,
      case when t.nspname='auth' then 'share' else 'access exclusive' end);
  end loop;
  if (select count(*) from public.user_profiles p join auth.users u on u.id=p.auth_user_id
    where p.organization_id=org and p.is_active and not p.must_change_password and
    ((p.role='ADMIN' and p.auth_user_id=current_setting('prime.handoff_admin')::uuid) or
     (p.role='CASHIER' and p.auth_user_id=current_setting('prime.handoff_cashier')::uuid) or
     (p.role='INTAKE' and p.auth_user_id=current_setting('prime.handoff_intake')::uuid)))<>3 then
    raise exception 'Three selected active handoff accounts must exist with correct roles and unchanged credentials';
  end if;
end $guard$;
\ir production-handoff-inventory.sql
select set_config('prime.handoff_before',current_setting('prime.handoff_inventory'),true) \gset
do $reset$
declare
  org uuid:=current_setting('prime.handoff_org')::uuid;
  t record; bad boolean; join_sql text; triggers jsonb; item jsonb;
  business text[]:=array['reconciliation_sources','reconciliation_documents','supplier_credit_allocations',
    'supplier_refunds','worker_advance_allocations','worker_advances','vat_ledger','cash_reversals',
    'cash_transactions','purchase_returns','purchases','job_work_items','job_required_parts',
    'worker_compensation_policies','service_jobs','vehicles','workers','suppliers','financial_accounts',
    'work_catalog','part_catalog','worker_roles','master_identities','audit_logs'];
begin
  if current_setting('prime.handoff_inventory')::jsonb->>'reviewed_inventory'<>current_setting('prime.handoff_review') then
    raise exception 'Inventory changed since review: repeat read-only preview and obtain approval again';
  end if;
  if (select count(*) from public.unit_catalog where organization_id=org)=0 or
    (select count(*) from public.transaction_categories where organization_id=org)=0 then
    raise exception 'Required units/categories are missing';
  end if;
  -- Detect cross-tenant references BEFORE any cascading FK action can occur.
  -- Unknown external dependencies fail closed, even if their tables currently appear empty.
  for t in select c.*,a.relname as child,b.relname as parent,a.relnamespace as child_schema
    from pg_constraint c join pg_class a on a.oid=c.conrelid join pg_class b on b.oid=c.confrelid
    where c.contype='f' and b.relnamespace='public'::regnamespace and b.relname=any(business) loop
    if t.child_schema<>'public'::regnamespace or not t.child=any(business) then
      raise exception 'Unreviewed incoming foreign key: %',t.conname;
    end if;
    select string_agg(format('a.%I=b.%I',a.attname,b.attname),' and ' order by x.i) into join_sql
    from generate_subscripts(t.conkey,1) x(i)
    join pg_attribute a on a.attrelid=t.conrelid and a.attnum=t.conkey[x.i]
    join pg_attribute b on b.attrelid=t.confrelid and b.attnum=t.confkey[x.i];
    execute format('select exists(select 1 from public.%I a join public.%I b on %s
      where a.organization_id<>b.organization_id and (a.organization_id=$1 or b.organization_id=$1))',t.child,t.parent,join_sql) into bad using org;
    if bad then raise exception 'Cross-organization reference: %; manual investigation required',t.conname; end if;
  end loop;
  -- Maintenance-only suspension of named APPLICATION triggers, with exact restoration.
  -- FK/internal triggers stay enabled. No session_replication_role, no DROP, no CASCADE.
  select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'trigger',g.tgname,'state',g.tgenabled) order by c.relname,g.tgname),'[]')
    into triggers from pg_trigger g join pg_class c on c.oid=g.tgrelid
    where c.relnamespace='public'::regnamespace and c.relname=any(business) and not g.tgisinternal;
  for item in select value from jsonb_array_elements(triggers) loop
    execute format('alter table public.%I disable trigger %I',item->>'table',item->>'trigger');
  end loop;
  delete from public.reconciliation_sources where organization_id=org;
  delete from public.reconciliation_documents where organization_id=org;
  delete from public.supplier_credit_allocations where organization_id=org;
  delete from public.supplier_refunds where organization_id=org;
  delete from public.worker_advance_allocations where organization_id=org;
  delete from public.worker_advances where organization_id=org;
  delete from public.vat_ledger where organization_id=org;
  delete from public.cash_reversals where organization_id=org;
  delete from public.cash_transactions where organization_id=org;
  delete from public.purchase_returns where organization_id=org;
  delete from public.purchases where organization_id=org;
  delete from public.job_work_items where organization_id=org;
  delete from public.job_required_parts where organization_id=org;
  delete from public.worker_compensation_policies where organization_id=org;
  delete from public.service_jobs where organization_id=org;
  delete from public.vehicles where organization_id=org;
  delete from public.workers where organization_id=org;
  delete from public.suppliers where organization_id=org;
  delete from public.financial_accounts where organization_id=org;
  delete from public.work_catalog where organization_id=org;
  delete from public.part_catalog where organization_id=org;
  delete from public.worker_roles where organization_id=org;
  delete from public.master_identities where organization_id=org and kind<>'category';
  delete from public.audit_logs where organization_id=org;
  for item in select value from jsonb_array_elements(triggers) loop
    execute format('alter table public.%I %s trigger %I',item->>'table',case item->>'state'
      when 'O' then 'enable' when 'A' then 'enable always' when 'R' then 'enable replica' else 'disable' end,item->>'trigger');
  end loop;
end $reset$;
\ir production-handoff-inventory.sql
do $check$
declare t record; n bigint; org uuid:=current_setting('prime.handoff_org')::uuid;
begin
  if current_setting('prime.handoff_before')::jsonb->>'preserved_fingerprint'
    is distinct from current_setting('prime.handoff_inventory')::jsonb->>'preserved_fingerprint' then
    raise exception 'Preserved data, auth, other organization, counter or infrastructure changed: rollback';
  end if;
  for t in select key,value from jsonb_each_text(current_setting('prime.handoff_inventory')::jsonb->'counts')
    where key not in ('organizations','user_profiles','unit_catalog','transaction_categories','master_identities') loop
    if t.value::bigint<>0 then raise exception 'Business rows remain in %: rollback',t.key; end if;
  end loop;
  select count(*) into n from public.master_identities where organization_id=org and kind<>'category';
  if n<>0 then raise exception 'Business identities remain'; end if;
end $check$;
select current_setting('prime.handoff_before')::jsonb->'counts' as before_counts,
  current_setting('prime.handoff_inventory')::jsonb->'counts' as after_counts,
  'DB verified; Storage cleanup and separate verification still required' as result;
commit;
