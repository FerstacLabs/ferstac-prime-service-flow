# Payment linkage and date input rollout

Code-only deployment on migration baseline 0001-0014. No migration or historical
backfill is included. Never apply QA scripts or fixtures to production.

## Canonical relationships

- An economic payment is one `cash_transactions` row. `id` identifies that row;
  `idempotency_key` prevents replay. Money is not copied into a customer table.
- All entity/report joins use `organization_id` and `service_job_id`, plus
  `purchase_id` or `work_item_id` for the allocated obligation. Plate, job number,
  purpose and reference strings are display/search fields, not join keys.
- New customer advance/payment categories resolve server-side to
  `CUSTOMER_VEHICLE`, using the existing `record_financial_transaction` RPC.
  Historical `GENERAL_IN` remains generic income, even if linked to a job.
- Customer received and receivable are gross settlement amounts. Internal
  cash/bank running balances use net operating amounts; VAT uses `vat_ledger`.
- Purchase save uses the existing unpaid purchase RPC, then the existing atomic
  supplier-payment RPC with a separate deterministic idempotency key. Payment
  failure leaves an unpaid purchase, explicitly reported to the user. It does
  not leave partial cash, supplier payment or VAT entries. Retrying the same
  submission does not duplicate either the purchase or payment. The two RPCs
  are not a single database transaction. To change saved purchase details after
  a failed payment, reopen that purchase; do not resubmit a changed creation
  request with its old idempotency key.
- An existing paid amount cannot be reduced by editing payment status. Use the
  audited reversal workflow, subject to period and VAT balance restrictions.

## Integration audit boundaries

| Flow | Persisted relationship and consumers |
| --- | --- |
| Customer payment / advance | Cash row + job UUID; jobFinance, vehicleSettlement, filterLedger and vehicle/finance reports |
| Supplier payment | Purchase UUID + job UUID; existing RPC checks ownership and remaining gross debt |
| Supplier refund | GENERAL_IN with payment_kind SUPPLIER_REFUND and return/purchase/supplier IDs; existing trigger validates job identity |
| Return / exchange | purchase_returns and replacement_of preserve purchase/job IDs; supplier position drives payable |
| Supplier credit | supplier_credit_allocations joins purchase and return; no fabricated cash movement |
| Worker payment / job advance | Existing worker RPC resolves work_item_id to its job and rejects mismatches |
| General worker advance | Worker identity, optional job; allocation to work is separate, not another cash payment |
| Worker bonus | Worker identity and optional job; remains distinct from payment of earned work |
| Vehicle extra expense | VEHICLE_EXPENSE + job UUID; journal and vehicle cost selectors use that UUID |
| Customer refund | No new refund feature introduced; existing audited reversal remains authoritative |

Additional inconsistency fixed: vehicle settlement labelled customer receipts
were using net operating amounts, while customer debt and workshop totals were
gross. Receipts now agree; internal operating account balances are unchanged.
No missing-row ID-filter bug was reproduced for a correctly persisted job UUID.
Missing historical links require evidence, not plate matching or guessed repair.

## Read-only historical diagnostic

An authorized operator may run this read-only query, with `org_id` bound to the
intended organization UUID. It identifies review candidates, not proven errors.
Category names can have changed since the original transaction.

```sql
BEGIN READ ONLY;
SELECT t.id, t.service_job_id, t.allocation_type, t.category_id,
       t.amount, t.net_amount, t.vat_amount, t.occurred_at,
       t.reference_number,
       CASE
         WHEN t.service_job_id IS NOT NULL AND j.id IS NULL
           THEN 'Missing or cross-organization job'
         WHEN t.allocation_type LIKE 'CUSTOMER_%' AND t.service_job_id IS NULL
           THEN 'Customer settlement without job'
         WHEN t.allocation_type = 'GENERAL_IN'
           THEN 'Review historic customer-category generic income'
       END AS review_reason
FROM public.cash_transactions t
LEFT JOIN public.service_jobs j
  ON j.id = t.service_job_id AND j.organization_id = t.organization_id
LEFT JOIN public.transaction_categories c
  ON c.id = t.category_id AND c.organization_id = t.organization_id
WHERE t.organization_id = :'org_id'::uuid AND t.voided_at IS NULL
  AND ((t.service_job_id IS NOT NULL AND j.id IS NULL)
    OR (t.allocation_type LIKE 'CUSTOMER_%' AND t.service_job_id IS NULL)
    OR (t.allocation_type = 'GENERAL_IN'
      AND c.name IN ('Müştəri avansı', 'Müştəri ödənişi')))
ORDER BY t.occurred_at, t.id;
ROLLBACK;
```

For each candidate, verify the original receipt, actual party, job UUID, amount,
channel, date and original intent with the cashier. Do not infer them from plate
or reference text. Rehearse an ADMIN-authorized reversal and corrected canonical
entry on a restored test database, preserving original references and a reason.
Check net cash, VAT, party debt, locked/confirmed reconciliation periods and
Audit before approving any production repair. Stop for review if chronology or
VAT protection blocks it. Never bypass triggers, edit immutable ledger rows,
bulk backfill, silently reopen periods or record another payment without the
matching approved correction. This code deployment performs none of that work.

## Deployment

1. Confirm production schema is already at 0014 and keep a verified backup.
2. Deploy the tested code commit with the existing production configuration.
   Do not run SQL migrations for this release.
3. Read-only smoke check existing ADMIN/CASHIER/INTAKE access, known account
   balances, customer debts, vehicle filters and a known PDF/Print report.
4. Exercise new writes in staging first. Confirm VAT modes preserve purchase
   payment choices and that insufficient VAT leaves the purchase unpaid.
5. Review historical diagnostic candidates separately. Do not promise this
   deployment will repair previously misclassified transactions.
6. If verification fails, stop financial writes and investigate. Do not reset
   or drop data. Reverting code also restores the old input defect, so it is not
   permission to resume financial writes without review.
