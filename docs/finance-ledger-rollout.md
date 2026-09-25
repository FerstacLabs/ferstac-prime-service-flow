# Finance Ledger 0007 Rollout

Production must be migrated manually by the database operator. The implementation
and QA apply SQL only to local/test databases, never to production.

## Ordered Deployment

1. Schedule a maintenance window. Pause application writes and automatic main-branch deployment until database and application versions can be switched together. Keep the current release available for diagnosis.
2. Confirm production already has migrations 0001 through 0006. Do not rerun or edit them. Confirm 0007 has not been applied.
3. Take a restorable database backup and verify the recovery procedure. Export a baseline of ledger IDs, amounts, allocation targets, void state, row count and signed active balance; record purchase paid totals and supplier count. Keep these exports private.
4. On a staging copy of that backup, run the exact `supabase/migrations/0007_finance_cash_bank_ledger.sql` from the release commit. It is a single transaction. If it fails, stop and investigate; do not bypass constraints or triggers.
5. Verify the before/after ledger IDs, amounts, targets, void states and row count are identical, all historical rows have channel CASH, cash balance matches the baseline, bank balances are zero and supplier-backed purchases have identity snapshots. Inspect role tests and reports on staging.
6. While production writes remain paused, apply that same SQL file once using the approved Supabase SQL/migration workflow. If migration history is managed by CLI, record it through that workflow; never run a blanket reset or replay older migrations.
7. Reload the API schema cache (`NOTIFY pgrst, 'reload schema';`). Repeat the baseline comparisons on production without creating artificial financial transactions.
8. Deploy the matching application commit with the existing production environment configuration. Run `pnpm build` through the normal deployment pipeline; no build script performs a migration. Never copy QA credentials, local environment files or service keys.
9. Smoke-test ADMIN, CASHIER and INTAKE: Cashier sees vehicle receivables but no line quotes/profit or cost editor; Intake cannot open finance; Admin retains costing and reporting. Verify archive/history, bank/category permissions, PDF and Print filters. Use staging for destructive or money-writing acceptance tests.
10. ADMIN creates actual AZN bank accounts. Enter opening balances only if independently reconciled, with the agreed cutover date and purpose. Do not import historic payments again or fabricate an opening entry to duplicate existing cash.
11. Reconcile cash, bank and total balances, then reopen writes and automatic deployment. Monitor application errors and the immutable financial audit.

## Safety and Corrections

- Do not reverse the schema or restore only some finance tables after new payments exist. If deployment fails, leave writes paused and fix forward. A full backup restoration requires an approved recovery plan that accounts for all money movements since backup.
- Financial corrections never rewrite old transaction amounts. Cost decreases can create credits/overpayments; the settlement screen displays these explicitly and refuses closure until reconciled. Audit voids require ADMIN and a reason; they are not a substitute for recording a real-world refund.
- Historical worker advances and legacy line receipts remain in the same ledger. Completion changes earned cost, not payment dates or amounts. Internal transfers and opening balances are not operating income or profit.
- Permanent supplier deletion requires explicit `SİL` confirmation and ADMIN. Only the master disappears; immutable purchase snapshots and ledger counterparty identities remain reportable, including any unpaid historical obligation.
- Keep existing application secrets unchanged. No production host, credentials or machine-specific QA paths belong in this document or repository.
