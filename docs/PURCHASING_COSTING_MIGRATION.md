# Purchasing and Worker Costing Rollout

## Manual Production Order

1. Back up production. Confirm migrations 0001 through 0005 have been applied; do not edit or rerun them.
2. Pause operational writes and hold automatic deployment promotion. Keep serving the previous application until the migration is ready.
3. Apply `supabase/migrations/0006_purchasing_work_costing.sql` once as a complete transaction using normal migration tooling or the Supabase SQL Editor. Do not run individual fragments. Investigate a failed transaction before retrying.
4. Compare purchase counts, actual costs, worker assignments/agreed costs, cash transactions and balances with the pre-migration snapshot. Existing work/required-part rows must have `is_additional = false`.
5. Deploy/promote the new application. Migration must precede use of the new application. If a main push has already auto-deployed it, restrict use until migration is complete or retain the previous deployment.
6. Smoke-test ADMIN operational costing, CASHIER payment/advance handling, INTAKE quotation privacy, additional work/purchase creation, supplier archive/restore and all three purchase reports. Resume writes after the checks pass.

Production migration is manual. The application does not run migrations, provision accounts or reset data. No additional seed is needed.

## Compatibility and Semantics

- Existing supplier `active`, purchase `purchased_by_admin` and `purchased_by_worker_id` fields are reused. No duplicate buyer-name or supplier-lifecycle system is introduced.
- New administrator purchases clear the employee reference. Worker purchases require an employee reference. Existing records are not rewritten during migration.
- Archiving a supplier only changes `active`; historical purchases, payments and outstanding debt remain. New purchases cannot choose an archived supplier. Existing linked purchases remain editable and payable.
- Worker assignment continues to use `job_work_items.assigned_worker_id`. Costing updates share the existing job lock and paid-work guards. Changing a paid worker or reducing cost below payments remains forbidden.
- Both old and new cost RPCs require ADMIN. CASHIER retains payment capability but cannot define operational cost, including through direct RPC calls. RLS, tenant checks and immutable ledgers/audit remain in force.
- Additional work/parts use an immutable `is_additional` discriminator. Historical quoted rows default to original; earlier unlinked purchases remain recognizable as outside the required-part list. New additional purchases create a linked additional required-part row transactionally.
- Initial customer quotations exclude additional rows. Final/internal finances include their customer amounts and real costs. A legacy budget is preserved and only later additional quoted amounts are added; the original budget payment allocation retains its original cap.
- New actual purchase inputs remain total-cost entries (`purchases.quantity = 1`). Customer quantity/unit and customer unit price are stored separately on the linked quote row. Existing actual unit-cost purchase records keep their original quantity/unit-cost meaning.
- Additional purchase customer price defaults visibly to zero for an internal-only purchase and can be supplied when chargeable. Additional items remain visible to Kassa for their respective payment allocations, without exposing actual cost in customer quotations.
- Existing audit events continue. Supplier archive/restore and additional work/purchase creation add explicit events. Cost notes are not copied into audit text or customer documents.

Do not roll back by deleting new records or financial history. If the application must be rolled back, retain the additive schema and investigate with writes paused. The old CASHIER cost UI will be rejected by the new ADMIN-only RPC guard.
