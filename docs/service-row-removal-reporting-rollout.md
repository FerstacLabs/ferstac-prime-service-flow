# Service Row Removal and Directory Reports (0011)

## Manual Production Rollout

Production was not changed. Local PostgreSQL and disposable test databases are the only migration targets used during implementation.

1. Back up the production database and record the deployed revision. Verify migrations 0001 through 0010 are already applied; do not rerun them or any seeds.
2. Pause application writes in a maintenance window. Review `supabase/migrations/0011_safe_service_row_removal.sql` from the approved release.
3. Apply only 0011 once, as its complete transaction, through the established migration runner or SQL Editor. Stop on any error and record success in the normal migration ledger only after commit.
4. Run `notify pgrst, 'reload schema';`. Verify `remove_service_row(uuid,text,uuid)` exists. Authenticated clients must have no direct DELETE privilege on `job_work_items` or `job_required_parts`; the RPC must reject CASHIER and cross-organization requests.
5. Deploy the matching application revision with the existing production environment. Build does not apply migrations. Never deploy QA credentials, local scripts, screenshots or generated reports.
6. Verify ADMIN worker header actions and payment-policy separation; INTAKE operational access; CASHIER restrictions; and read-only worker/supplier PDF and Print exports. Compare supplier totals in the summary with the individual supplier page. Check partial profit with incomplete cost data.
7. In staging, check safe ADMIN/INTAKE work/part removal, retained catalogs, recalculated quotes, Work Queue and readable removal audit. Check rejection of started/completed/paid work, allocated advances, purchased parts, inactive/closed cards and customer overpayment after removal. Do not create or delete production records merely for QA without business authorization.
8. Resume writes only after smoke tests pass. If deployment fails, keep writes paused and prefer a forward fix. A backup restore requires coordinated application rollback and reconciliation of all post-backup writes.

## Data Rules

- Removal affects only a service-card row, never its shared catalog. No existing data is deleted by applying the migration.
- Safe work must still be TODO, never started/completed/finalized, and have no cash history (including voided payments) or advance allocation. Parts must have no purchase or payment history, including voided history.
- The RPC locks the organization's finance stream and parent card. Deletion, derived status, receivable validation and audit are atomic. Removing a row may not reduce the receivable below existing customer receipts.
- Profit uses the existing revenue-minus-cost calculation, independently of payment dates. Partial total includes only cards with complete profit data, explicitly labeled as partial. No estimated profit is invented for incomplete cards.
- Supplier summary, detail page and purchase-report totals share `supplierFinance`. Periods select purchases; payments include all history for those selected purchases so balances reconcile. Supplier debt filtering is applied after aggregation, never as a vehicle-debt filter.
- Worker periods select work, and settlement includes its full payment/allocation history. Unallocated general advances are current worker-level amounts, not arbitrary job payments. Reports distinguish payments from explicitly recorded advances; applied advances are not new cash movements.
- Main Workers exports remain summaries even when a worker filter is selected. Individual exports use the explicit `detail=worker` context. Percentage policies remain on Worker detail; no duplicate Security configuration exists.

## Verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Validate real local browser behavior at 1920, 1366 and 390 pixels, plus rendered A4 reports. Local QA files and credentials must remain outside the commit.
