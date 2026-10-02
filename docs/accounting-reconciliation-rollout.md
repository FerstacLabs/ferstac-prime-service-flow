# Accounting Reconciliation Rollout

Migration: `supabase/migrations/0012_accounting_reconciliation.sql`.
Migrations 0001-0011 remain unchanged. This migration is forward-only and runs
inside one transaction. Development verification does not authorize a production
database change.

## Manual Production Steps

1. Schedule a finance maintenance window. Stop financial writes and coordinate
   application deployment so code requiring 0012 is not activated before the SQL.
2. Take a fresh database backup and confirm the restore procedure. Record the
   current app release, migration list, purchase count, ledger count, and separate
   cash/bank balances. Keep credentials and exported financial data private.
3. Confirm migrations 0001-0011 are present and 0012 has not already been applied.
   Review the shipped 0012 SQL against the approved commit.
4. An authorized operator applies ONLY `0012_accounting_reconciliation.sql` in the
   production Supabase SQL editor or the established migration pipeline. Do not
   reset the database, rerun seeds, replay old migrations, or copy local QA data.
5. Reload the PostgREST schema cache (`NOTIFY pgrst, 'reload schema';`) and activate
   the matching application release.
6. Verify existing purchase and ledger counts and every account balance are
   unchanged. Migration creates no historical payment, return, credit, or refund.
7. Check ADMIN/CASHIER report access, INTAKE denial, opening-balance history,
   supplier/worker reconciliation and generated PDF/Print documents. Perform any
   approved financial smoke transaction only with real business documentation;
   do not invent production transactions for testing.
8. Reopen financial writes after reconciliation. On failure, keep writes stopped
   and investigate; do not delete history or apply an improvised down migration.

## Accounting Rules

- Returns preserve original quantity, price and payments. Full return closes the
  operational purchase slot; its historical row remains visible.
- Unpaid value cancels the payable. Previously settled value becomes supplier
  credit. Choosing an actual refund atomically records real cash/bank income.
- Exchanges create a linked replacement. Credit from that exchange is applied
  only to its replacement; any remainder stays refundable. Other credit is
  allocated only through an explicit ADMIN action.
- Credit creation and allocation never generate cash movements. A cashier may
  receive an actual refund but cannot change purchase costing or allocate credit.
- Worker bonus is final expenditure, not an advance or payment against a work
  obligation. Earned work in period reports uses `completed_at` in Baku time.
- Supplier reconciliation includes opening obligations and period activity.
  Purchase-directory period totals describe purchases selected by purchase date;
  the separate reconciliation panel uses the exact PDF reconciliation builder.
- Generic ledger reports contain only matching transactions and totals. Account
  running balances use complete history of one cash or bank account and are
  omitted for mixed-account reports.
- Payments underpinning return/credit history cannot be silently voided. Refunds
  may be reasonfully reversed using the existing ledger mechanism, restoring the
  available credit. Never hard-delete posted financial events.

## Verification

Use `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` in the normal
environment. Database tests run the migration chain in isolated PGlite. Browser
QA must use a local/test Supabase instance, never production credentials.
