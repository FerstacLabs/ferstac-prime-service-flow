\set ON_ERROR_STOP on
begin isolation level repeatable read read only;
set local row_security=off;
select set_config('prime.handoff_org', :'org', true) as scope \gset
\ir production-handoff-inventory.sql
select current_database() as database, current_setting('prime.handoff_org') as organization,
  current_setting('prime.handoff_inventory')::jsonb->>'reviewed_inventory' as reviewed_inventory,
  current_setting('prime.handoff_inventory')::jsonb->>'preserved_fingerprint' as preserved_fingerprint;
select key as dataset, case when key in ('organizations','user_profiles','unit_catalog','transaction_categories') then 'PRESERVE'
  when key='master_identities' then 'DELETE except category identities' else 'DELETE scoped rows' end as action, value as row_count
from jsonb_each(current_setting('prime.handoff_inventory')::jsonb->'counts') order by key;
select kind,count(*) from public.master_identities where organization_id=:'org'::uuid group by kind order by kind;
-- Review identities privately. No email credentials, hashes, sessions or tokens are printed.
select u.id as auth_user_id,p.username,p.display_name,p.role,p.organization_id,p.is_active,
  case when p.organization_id=:'org'::uuid and p.role in ('ADMIN','CASHIER','INTAKE') then 'PRESERVE: select required handoff identity'
    else 'OPTIONAL AUTH CLEANUP: manual review only; PRESERVED' end as action,
  'UNKNOWN: do not infer test-only status from a name' as test_only
from auth.users u left join public.user_profiles p on p.auth_user_id=u.id order by p.role,p.username,u.id;
select conrelid::regclass as child,confrelid::regclass as parent,pg_get_constraintdef(oid) as foreign_key
from pg_constraint where contype='f' and (connamespace='public'::regnamespace or confrelid in
  (select oid from pg_class where relnamespace='public'::regnamespace)) order by 1,2;
select current_setting('prime.handoff_inventory')::jsonb->'counters' as counters_preserve_without_restart;
select b.id,b.public,count(o.id) as objects from storage.buckets b left join storage.objects o on o.bucket_id=b.id group by b.id,b.public;
select bucket_id,name as storage_object,'REVIEW API manifest; SQL will NOT delete Storage metadata' as action
from storage.objects where name like :'org'||'/%' order by bucket_id,name;
commit;
