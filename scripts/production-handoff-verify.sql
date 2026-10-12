\set ON_ERROR_STOP on
begin isolation level repeatable read read only;
set local row_security=off;
select set_config('prime.handoff_org', :'org', true),
  set_config('prime.handoff_expected', :'preserved_fingerprint', true);
\ir production-handoff-inventory.sql
do $verify$
declare t record; org uuid:=current_setting('prime.handoff_org')::uuid;
begin
  if current_setting('prime.handoff_expected')<>current_setting('prime.handoff_inventory')::jsonb->>'preserved_fingerprint' then
    raise exception 'Preserved baseline differs: verify BEFORE login/smoke writes; investigate, do not bypass';
  end if;
  for t in select key,value from jsonb_each_text(current_setting('prime.handoff_inventory')::jsonb->'counts')
    where key not in ('organizations','user_profiles','unit_catalog','transaction_categories','master_identities') loop
    if t.value::bigint<>0 then raise exception 'Business rows remain: %',t.key; end if;
  end loop;
  if exists(select 1 from public.master_identities where organization_id=org and kind<>'category') then raise exception 'Business identity remains'; end if;
  if not exists(select 1 from public.unit_catalog where organization_id=org) or
    not exists(select 1 from public.transaction_categories where organization_id=org) then raise exception 'Preserved masters missing'; end if;
  if (select count(distinct role) from public.user_profiles where organization_id=org and is_active
    and not must_change_password and role in ('ADMIN','CASHIER','INTAKE'))<>3 then raise exception 'Handoff roles missing'; end if;
  if exists(select 1 from storage.objects where bucket_id='prime-reconciliations' and name like org::text||'/%') then
    raise exception 'Organization Storage objects remain; review and execute API cleanup, never SQL metadata deletion';
  end if;
end $verify$;
select current_setting('prime.handoff_inventory')::jsonb->'counts' as verified_counts;
select 'Cash / bank / VAT / customer / supplier / worker debt / worker advance' as balances,
  0.00::numeric as amount_azn,'All source business tables verified EMPTY (not merely netting to zero)' as evidence;
select 'PASS: preserved baseline, infrastructure, counters and empty business tables / scoped reconciliation Storage' as result;
commit;
