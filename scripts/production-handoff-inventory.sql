-- Shared READ-ONLY inventory. No persistent objects or rows are changed.
-- Caller supplies transaction-local prime.handoff_org. Requires full owner access.
do $inventory$
declare
  org uuid := current_setting('prime.handoff_org')::uuid;
  preserved text[] := array['organizations','user_profiles','unit_catalog','transaction_categories'];
  business text[] := array['reconciliation_sources','reconciliation_documents','supplier_credit_allocations',
    'supplier_refunds','worker_advance_allocations','worker_advances','vat_ledger','cash_reversals',
    'cash_transactions','purchase_returns','purchases','job_work_items','job_required_parts',
    'worker_compensation_policies','service_jobs','vehicles','workers','suppliers','financial_accounts',
    'work_catalog','part_catalog','worker_roles','master_identities','audit_logs'];
  t record; n bigint; h text; keep_hash text; predicate text; relation_name text;
  counts jsonb := '{}'; keep jsonb := '{}'; contents jsonb := '{}'; counters jsonb := '{}';
  schema_state jsonb; result jsonb;
begin
  if not exists(select 1 from public.organizations where id=org) then raise exception 'Unknown organization'; end if;
  if exists(select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace
    where s.nspname in ('public','prime_private') and c.relkind in ('r','p','m','f')
      and not (s.nspname='public' and c.relname=any(preserved||business)))
    or (select count(*) from pg_class where relnamespace='public'::regnamespace
      and relkind='r' and relname=any(preserved||business))<>28 then
    raise exception 'Schema coverage changed: review ALL tables before using this 0001-0014 tool';
  end if;
  for t in select c.oid,c.relname from pg_class c where c.relnamespace='public'::regnamespace
    and c.relkind='r' order by c.relname loop
    relation_name := format('public.%I',t.relname);
    predicate := case when t.relname='organizations' then 'id=$1' else 'organization_id=$1' end;
    execute format('select count(*) from %s where %s',relation_name,predicate) into n using org;
    counts := counts||jsonb_build_object(t.relname,n);
    execute format('select md5(coalesce(string_agg(h,'''' order by h),'''')) from
      (select md5(to_jsonb(r)::text) h from %s r) x',relation_name) into h;
    contents := contents||jsonb_build_object(t.relname,h);
    predicate := case when t.relname=any(preserved) then 'true'
      when t.relname='master_identities' then 'organization_id<>$1 or kind=''category'''
      else 'organization_id<>$1' end;
    execute format('select md5(coalesce(string_agg(h,'''' order by h),'''')) from
      (select md5(to_jsonb(r)::text) h from %s r where %s) x',relation_name,predicate) into keep_hash using org;
    keep := keep||jsonb_build_object(t.relname,keep_hash);
  end loop;
  -- Never output auth data or individual password/token hashes. Compare only a combined digest.
  for t in select c.oid,c.relname from pg_class c join pg_namespace s on s.oid=c.relnamespace
    where s.nspname='auth' and c.relkind='r' order by c.relname loop
    execute format('select md5(coalesce(string_agg(h,'''' order by h),'''')) from
      (select md5(to_jsonb(r)::text) h from auth.%I r) x',t.relname) into h;
    keep := keep||jsonb_build_object('auth.'||t.relname,h);
  end loop;
  select md5(coalesce(string_agg(to_jsonb(b)::text,'' order by b.id),'')) into h from storage.buckets b;
  keep := keep||jsonb_build_object('storage.buckets',h);
  for t in select schemaname,sequencename from pg_sequences where schemaname in ('public','prime_private') order by 1,2 loop
    execute format('select jsonb_build_object(''last_value'',last_value,''is_called'',is_called) from %I.%I',t.schemaname,t.sequencename) into result;
    counters := counters||jsonb_build_object(t.schemaname||'.'||t.sequencename,result);
  end loop;
  -- Infrastructure fingerprint excludes mutable statistics, but includes trigger enable state and ACLs.
  select jsonb_build_object(
    'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by c.oid)
      from pg_class c where c.relnamespace in ('public'::regnamespace,'prime_private'::regnamespace)),
    'columns',(select jsonb_agg(to_jsonb(a) order by a.attrelid,a.attnum) from pg_attribute a
      join pg_class c on c.oid=a.attrelid where c.relnamespace in ('public'::regnamespace,'prime_private'::regnamespace) and a.attnum>0),
    'constraints',(select jsonb_agg(to_jsonb(c) order by c.oid) from pg_constraint c where c.connamespace in ('public'::regnamespace,'prime_private'::regnamespace)),
    'triggers',(select jsonb_agg(to_jsonb(tr) order by tr.oid) from pg_trigger tr join pg_class c on c.oid=tr.tgrelid
      where c.relnamespace in ('public'::regnamespace,'prime_private'::regnamespace)),
    'functions',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p where p.pronamespace in ('public'::regnamespace,'prime_private'::regnamespace)),
    'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p),
    'indexes',(select jsonb_agg(to_jsonb(i) order by i.indexrelid) from pg_index i join pg_class c on c.oid=i.indrelid
      where c.relnamespace in ('public'::regnamespace,'prime_private'::regnamespace)),
    'types',(select jsonb_agg(to_jsonb(ty) order by ty.oid) from pg_type ty where ty.typnamespace in ('public'::regnamespace,'prime_private'::regnamespace))
  ) into schema_state;
  result := jsonb_build_object('organization',org,'database',current_database(),'counts',counts,
    'preserved_fingerprint',md5(keep::text||counters::text||schema_state::text),
    'reviewed_inventory',md5(contents::text||keep::text||counters::text||schema_state::text),
    'counters',counters);
  perform set_config('prime.handoff_inventory',result::text,true);
end $inventory$;
