# Worker Compensation and Ledger Refinements (0010)

## Manual Production Rollout

Implementation and QA use disposable/local databases only. Production was not migrated or modified.

1. Back up the production database and record the deployed application revision. Verify 0001 through 0009 are already applied. Do not rerun seeds or old migrations.
2. Pause application writes in a maintenance window. Review `supabase/migrations/0010_worker_compensation_audit_and_ledger_refinements.sql` against the approved release. It contains one transaction and must be applied once, as a whole.
3. Apply only 0010 using the established migration runner or Supabase SQL Editor. Stop on error; do not mark a failed migration applied. Record the successful migration in the normal deployment ledger.
4. Run `notify pgrst, 'reload schema';`. Confirm the new five-argument `update_work_assignment`, `save_worker_compensation_policy`, `record_worker_advance`, `allocate_worker_advance` and `record_worker_payment` RPCs are available. The renamed legacy helpers must remain inaccessible to authenticated/anonymous callers.
5. Deploy the matching application revision with the existing production environment. No local QA keys, passwords, scripts, screenshots or PDFs belong in the deployment. Migrations are not run by `pnpm build`.
6. Before accepting writes, verify existing work is FIXED, existing workers have no enabled percentage policy, and historical ledger row counts/amounts are unchanged. Check ADMIN catalog/settings access and CASHIER/INTAKE restrictions with the approved smoke-test accounts.
7. In staging, verify a 60% assignment on 1,000 AZN freezes at 600 AZN, a later 65% policy does not change it, and 300.50 AZN at 60% yields 180.30 AZN. In production, inspect real authorized records read-only unless a business-approved test transaction is explicitly authorized.
8. Verify worker advances, explicit allocations, settlement, audit before/after, customer quotation privacy, and PDF/Print routes. Reopen application traffic only after the role checks and smoke tests pass.

If deployment fails, keep writes paused and prefer a forward fix. Do not drop the new tables or down-migrate payroll/ledger history. A backup restore must be coordinated with the application revision and account for all writes after the backup.

## Financial Contract

- PostgreSQL NUMERIC stores policy percentages and money. The assignment snapshots the percentage; the customer line basis is quantity times unit price, rounded to qapik before percentage calculation.
- TODO/IN_PROGRESS percentage work has an expected cost. DONE, including completion inside a successful financial close, freezes basis, earning and time once. Later customer-price edits retain that earning and show an ADMIN reconciliation warning. There is no automatic payroll adjustment or rewriting of paid history.
- Work Queue sends INTAKE only eligibility and compensation mode, not percentages, line prices or worker money. CASHIER receives resulting cost/mode, never percentage policy or customer line basis. Existing intake quotation-entry capabilities are unchanged.
- A general advance is one real OUT row in `cash_transactions`. `worker_advances` associates it with the worker. `worker_advance_allocations` applies existing money to an explicitly selected, completed obligation of the same worker. It never creates another cash movement.
- Applied advances reduce remaining worker debt and are shown separately in finance reports. General unallocated amounts do not offset arbitrary jobs. Allocation retries are idempotent; over-allocation, cross-worker/org allocation and direct client writes are rejected.
- An allocated general advance cannot be voided, and its work cannot be reassigned or uncompleted. No automatic deallocation/undo workflow is included. Resolve an incorrect allocation through an approved audited forward correction, never direct historical-row deletion.
- Financial close atomically completes applicable active work, validates exact settlement, freezes percentage earning and writes its audit snapshot. Any failure rolls back completion and earnings. Only genuine payments move cash; repeated close adds neither payments nor earnings.
- Linked payments snapshot vehicle, work/part name and meaningful reference. Catalog rename creates a new active revision and archives the old identity, preserving historical names.

## Verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. DB tests apply the full migration chain in disposable PGlite; local browser QA uses a production Next.js build against local Supabase only.

QA covers ADMIN percentage configuration, INTAKE assignment/payload privacy, manual DONE, general advance/allocation, duplicate-purchase friendly errors and valid retry, generic worker payment, fixed/percentage financial close and rollback, audit field differences, linked payment orders, A4 overview PDF/Print, and desktop/mobile layouts. Machine-local QA scripts and generated artifacts are not application source and must not be committed.
