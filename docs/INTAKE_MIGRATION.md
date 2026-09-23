# Intake, Decimal Pricing and Report Rollout

## Manual Production Order

The application never applies `0005_intake_units_money_reports.sql` automatically.
Only isolated local databases are used for automated and browser QA.

1. Back up the production database and verify migrations 0001 through 0004 are already applied. Do not rerun or edit them.
2. Pause intake/quotation writes and hold automatic deployment promotion while reviewing the new migration.
3. Run `supabase/migrations/0005_intake_units_money_reports.sql` once, through the normal migration tooling or the Supabase SQL Editor. It is a single transaction; do not execute selected fragments. A failure rolls back the transaction and must be investigated before retrying.
4. Verify the checks below, then deploy/promote the application commit. **Migration must precede use of the new application**, which reads the new columns and unit catalog. If pushing main has already auto-deployed the app, restrict use until this manual migration is complete, or keep serving the previous deployment during the rollout.
5. Check ADMIN, CASHIER and INTAKE sign-in, a decimal quotation, an existing card, a payment, a custom unit and a customer PDF. Resume intake writes after these checks.

No production credentials, account provisioning, reset, table deletion or financial-history rewrite is part of this migration. Unit seeding is included; no separate seed/provisioning run is required.

## Schema and Compatibility

- `unit_catalog`: UUID id, organization_id, name, short_name, generated normalized_name, is_active, created_by, created_at, updated_at. Organization/name uniqueness, tenant RLS and role-checked create/manage RPCs.
- `job_work_items` and `job_required_parts`: `quantity NUMERIC`, `unit_id UUID`, `customer_unit_price NUMERIC`, `cost_note TEXT` (250 characters). Quantity permits three decimals; unit price permits two. Quote triggers compute the rounded two-decimal `quoted_price` line total.
- Existing work/part rows receive quantity 1, their original quoted price as unit price, and the organization's default work/part unit. Existing null work quotes remain unknown rather than being turned into free work.
- `service_jobs.deleted_at TIMESTAMPTZ`: a deleted card must also be archived. ADMIN soft deletion and restore preserve accounting history and append explicit audit events.
- Default units: Ədəd, Dəst, Xidmət, Saat, Gün, Metr, Santimetr, Kvadrat metr, Litr, Millilitr, Kiloqram, Qram. New organizations receive the same defaults.
- Existing `agreed_budget` values are preserved. New quotes use itemized totals. New actual-purchase entries keep quantity 1 so the entered actual total is not multiplied by customer quotation quantity; existing actual-purchase quantities retain their original unit-cost meaning.
- New quote RPC parameters have defaults for older clients. Existing payment, reversal and worker-advance RPCs and RLS protections remain in place. Catalog deactivation does not invalidate historical rows.

## Post-Migration Checks

Record pre-migration work/part quoted totals and counts plus payment/reversal history counts. Compare them after migration. Verify every migrated quote has quantity 1, unit price equal to its prior quote (including null work prices), and the correct organization unit. Check that every organization has the 12 seeded defaults and no normalized duplicates.

Test `2.5 × 100.40 = 251.00`, comma/dot entry equivalence, custom-unit reuse, ADMIN-only deactivation and soft deletion, and restore. Make sure CASHIER and INTAKE cannot invoke deletion directly. Confirm that a quotation contains customer prices and public notes only; internal cost notes, purchases, worker costs and ledger data must not be present.

The old migrations and financial ledgers are not rollback targets. If application rollback is necessary, retain the additive schema and use the previous application deployment while investigating. Do not drop new columns or restore a database backup over newer financial transactions without an explicit recovery plan.
