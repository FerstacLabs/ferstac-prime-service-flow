# PRIME handoff: one-time business-data reset

**Production has NOT been reset. These tools are not migrations, application endpoints,
or deployment hooks. A separate human approval is required for production execution.**

## Mandatory Runbook

1. Stop ALL business writes, background jobs, uploads, login/token-refresh traffic and
   integrations. Use a maintenance window; stop the app and Auth writers where possible.
2. Take a FULL production database backup and a separate backup of Storage file bytes
   and metadata. A SQL dump contains Storage metadata, **not the uploaded file bytes**.
3. Verify backup files exist, their size/checksum, encryption, access permissions and location.
4. Restore the backup into an isolated environment and test it. Resolve ownership/role/
   extension privileges there first. Do not discover restore failures after deleting data.
5. Run the read-only preview with the intended organization UUID and an owner connection.
6. Export the preview and Storage dry-run manifest to a private directory OUTSIDE Git.
7. Review every DELETE/PRESERVE count, the actual foreign keys, all buckets and unknown paths.
8. Select the exact existing ADMIN, CASHIER and INTAKE UUIDs; confirm same credentials,
   organization, active roles and successful pre-reset login. Then freeze login traffic again.
9. Obtain separate explicit approval for this organization, this inventory and both backups.
   Only then run the database reset manually in a new `psql -X ... -f` process.
10. Run the separately approved Storage API cleanup using the original reviewed manifest.
11. Run verification SQL **before any new login, smoke test or business write**.
12. Login with each of the three original accounts; verify role restrictions server-side.
13. Smoke-test the clean application. Login creates new audit/session data; this is normal,
   not old history. Production smoke writes must be explicitly approved and real intended
   setup records; use the isolated clone for disposable sample business records.
14. Resume writes only after every gate passes. Otherwise keep maintenance active.

Never `supabase db reset`, `TRUNCATE CASCADE`, delete Auth users, reset passwords,
change organization IDs, delete bucket definitions, or edit migrations 0001-0014.
No migration 0015 is needed. Do not deploy this as an automatic startup script.

## Actual Schema / Scope

Verified against migrations 0001-0014 and the local PostgreSQL catalog: **28 public tables**.
The complete scoped deletion order is:

| Order | Table | Contents removed |
| --- | --- | --- |
| 1 | reconciliation_sources | All saved source links |
| 2 | reconciliation_documents | Draft/confirmed snapshots, versions, signatures, replacement links |
| 3 | supplier_credit_allocations | Credit applications, including VAT components |
| 4 | supplier_refunds | Refund-to-return ledger links |
| 5 | worker_advance_allocations | Advance applications |
| 6 | worker_advances | General worker advance registrations |
| 7 | vat_ledger | Openings, inflows, outflows, adjustments, reversals |
| 8 | cash_reversals | Reversal references |
| 9 | cash_transactions | All cash/bank/payment/bonus/advance/transfer/opening history |
| 10 | purchase_returns | Returns, exchange references, credit sources |
| 11 | purchases | Purchases and replacement purchases |
| 12 | job_work_items | Planned/assigned/executed work, earnings and compensation snapshots |
| 13 | job_required_parts | Quoted/required parts |
| 14 | worker_compensation_policies | Worker-specific compensation rules |
| 15 | service_jobs | Service cards, embedded customer contacts, prices and VAT flags |
| 16 | vehicles | Intake/vehicle identities |
| 17 | workers | Worker masters |
| 18 | suppliers | Supplier masters |
| 19 | financial_accounts | All business bank accounts |
| 20 | work_catalog | Work/service catalog |
| 21 | part_catalog | Part/material catalog |
| 22 | worker_roles | Business trade/specialty catalog; NOT application RBAC roles |
| 23 | master_identities | Worker/account/supplier historical identities only |
| 24 | audit_logs | All target-organization audit history; no required bootstrap rows found |

Preserve ALL rows in `organizations`, `user_profiles`, `unit_catalog`,
`transaction_categories`, and `master_identities WHERE kind='category'`, including
archived/deleted designation identities needed by the designation directory.
Preserve every Auth table (users, identities, sessions, MFA/security metadata), all
other organizations' data, schema/RPC/functions/RLS/indexes/triggers/types and buckets.
No auth user is removed, even if not one of the three selected accounts. Extra users
are **OPTIONAL AUTH CLEANUP**, requiring separate review/approval. Names alone cannot
establish that someone is a test user. The preview prints identity/role/org, never credentials.

There is no separate customer, work-queue, bank-balance or report-cache table in this
schema. Those views are calculated from the tables above. Persisted report snapshots
live in `reconciliation_documents`. Worker bonuses/customer advances/transfers are
ledger allocations, not separate tables. Deleting all their source rows gives zero
customer/supplier/worker debts and zero cash/bank/VAT balances. No mandatory physical
cash account row exists; all `financial_accounts` may be cleared. New worker specialties
can be created through the worker form after reset.

## Safety Mechanism

- `production-handoff-inventory.sql` is shared by preview/reset/verify. It is read-only:
  only transaction-local settings are set; no persistent helper objects are created.
- Preview and verify use repeatable-read, read-only transactions. Full owner visibility
  is required, including Auth. Do not use the anonymous/authenticated app connection.
- Reset requires exact organization approval, database name, backup/write-freeze
  acknowledgments, three selected active role UUIDs and the reviewed inventory fingerprint.
- Before deleting anything, all public tables are exclusively locked and all Auth tables
  share-locked, blocking writes/logins. Lock timeout is 10 seconds; statement timeout is
  120 seconds. A timeout is a failed reset, not permission to bypass the gate.
- Unknown public/private tables or incoming external FKs fail closed. All incoming
  business FKs are inspected for cross-organization rows, including self-references.
- The script enumerates and temporarily disables each named **application** trigger on
  the business tables. This bypasses immutable history/deletion guards and avoids creating
  fresh audit/history while deleting. **Internal/FK triggers stay active throughout.**
  No `session_replication_role`, blanket FK suspension, DROP or cascade command is used.
- Child tables are deleted first. Same-table version/reversal/replacement links are
  removed in one organization-wide DELETE, so immediate FKs see no surviving child.
- Exact trigger enable states are restored inside the same transaction. Any SQL error
  rolls back deletions AND trigger state when the standalone psql process exits.
- Before COMMIT, fingerprints compare all preserved rows, all Auth rows, all other
  organizations, counters and infrastructure (including trigger state/ACLs/RLS). Empty
  business tables are asserted. A mismatch rolls back everything.
- Fingerprints are accidental-change checks, not backups, signatures or authorization.
  Keep the preview private. Never approve an inventory that was not actually reviewed.
- Storage is a separate, non-transactional service. DB success does not mean Storage
  success. Maintain the write freeze until both stages and verification finish.

## Counters

Preserve without `setval` or restart:

- `public.reconciliation_document_number`: human-facing historical document numbering.
- `public.reconciliation_sources_id_seq`: internal saved source IDs.
- `public.vat_ledger_posting_order_seq`: stable VAT posting chronology.

UUID generation remains unchanged. Service job/purchase identifiers are generated by
existing application logic, not a resettable business sequence. No counter needs restarting;
reusing previous identifiers could make old exported documents ambiguous.

## Commands (Manual Operator Only)

Use a separately configured libpq service and protected password file, never a password
in command arguments. These PowerShell examples contain placeholders, not credentials.
Run from the repository root. The relative `\ir` includes resolve next to the SQL file.

```powershell
$connection = 'service=prime-production'
$org = '<reviewed organization UUID>'
$private = '<absolute private backup/review directory outside Git>'

# First: stop writes and take/restore-verify FULL DB + Storage backups as above.
# Use provider-supported backup/restore tooling and sufficient ownership privileges.
pg_dump $connection --format=custom --file="$private/before.dump"
if ($LASTEXITCODE -ne 0) { throw 'Backup failed: STOP' }

psql -X $connection -v ON_ERROR_STOP=1 -v "org=$org" `
  -L "$private/preview.txt" -f scripts/production-handoff-preview.sql
if ($LASTEXITCODE -ne 0) { throw 'Preview failed: STOP' }
```

Review output, copy `reviewed_inventory` and `preserved_fingerprint`, and select three
existing UUIDs. Every additional identity stays preserved, even if the role is also ADMIN.
Review Storage dry run before DB reset; it still works after document rows are removed,
because it lists API objects rather than depending on deleted metadata.

```powershell
# Inject these through a secure process environment. DO NOT put values in source/history.
# HANDOFF_SUPABASE_URL; HANDOFF_SERVICE_ROLE_KEY
node scripts/production-handoff-storage-cleanup.mjs --allow-remote `
  --org $org --manifest "$private/storage-manifest.json"
if ($LASTEXITCODE -ne 0) { throw 'Storage inventory failed: STOP' }
```

Remote access always requires `--allow-remote` and HTTPS; local testing uses loopback.
The CLI does not load `.env.local`. Dry run only writes the external review manifest,
never Storage. It inventories all bucket definitions and the target organization's
prefix in the actual `prime-reconciliations` private bucket. Only exact app-generated
`ORG/reconciliations/DOCUMENT_UUID/FILE_UUID.pdf` paths qualify. Static assets, other
orgs and buckets are not deleted. Unknown target-prefix paths block execution and must
be manually classified, never silently swept. Inspect the SQL preview's other buckets;
if unexpected business uploads exist elsewhere, stop and extend/re-test the plan first.
The repo's logo/static assets are in `public/brand`, not this private business bucket.

**Only after separate explicit production approval:**

```powershell
$reviewed = '<reviewed_inventory from unchanged preview>'
$preserved = '<preserved_fingerprint from that preview>'
$admin = '<existing ADMIN UUID>'
$cashier = '<existing CASHIER UUID>'
$intake = '<existing INTAKE UUID>'
$database = '<exact current_database() from preview>'

psql -X $connection -v ON_ERROR_STOP=1 -v "org=$org" `
  -v "approval=RESET BUSINESS DATA $org" -v backup_verified=yes -v writes_stopped=yes `
  -v "expected_database=$database" -v "reviewed_inventory=$reviewed" `
  -v "admin_id=$admin" -v "cashier_id=$cashier" -v "intake_id=$intake" `
  -L "$private/reset.txt" -f scripts/production-handoff-reset.sql
if ($LASTEXITCODE -ne 0) { throw 'Reset failed: KEEP WRITES STOPPED' }

$env:HANDOFF_APPROVAL = "RESET BUSINESS DATA $org"
$env:HANDOFF_BACKUP_VERIFIED = 'yes'
$env:HANDOFF_WRITES_STOPPED = 'yes'
node scripts/production-handoff-storage-cleanup.mjs --allow-remote --execute `
  --org $org --manifest "$private/storage-manifest.json" `
  --confirm '<SHA256 confirmation from reviewed Storage dry run>'
if ($LASTEXITCODE -ne 0) { throw 'Storage failed: KEEP WRITES STOPPED' }

psql -X $connection -v ON_ERROR_STOP=1 -v "org=$org" `
  -v "preserved_fingerprint=$preserved" -L "$private/verify.txt" `
  -f scripts/production-handoff-verify.sql
if ($LASTEXITCODE -ne 0) { throw 'Verification failed: KEEP WRITES STOPPED' }
```

Do not rerun reset by inventing a new fingerprint after a failure. Inspect the failure,
re-preview and obtain review again. For partially completed Storage deletion, retain the
original manifest/backup, inventory the remaining objects into a NEW manifest, and
reapprove those exact remaining paths. API batches are not atomic. Never delete rows
from `storage.objects` directly; that can orphan file bytes. Restore both DB and files
from the matching backups if rollback is needed; do not drop/reset production infrastructure.

## Verification / Local Evidence

The verification script asserts unchanged preserved masters/Auth/org/roles/infrastructure/
counters, all business source tables empty, no non-category business identities and no
target-organization objects remaining in the reconciliation bucket. It proves balances
are zero by emptiness of all source tables, not by allowing opposing entries to cancel.
Run before login, because normal login legitimately changes Auth sessions/audit metadata.

Local PostgreSQL backup was restored into `prime_handoff_verified_restore`, then preview
and reset ran successfully there. The actual isolated local app DB was subsequently reset;
Storage API dry run, backup/download, removal and SQL verification passed. Production
connections and production Storage were never used.

Actual LOCAL before -> after counts (not claimed as production inventory):

| Dataset | Before | After |
| --- | ---: | ---: |
| vehicles / service_jobs | 34 / 35 | 0 / 0 |
| job_work_items / job_required_parts | 54 / 41 | 0 / 0 |
| workers / worker_roles / worker_compensation_policies | 6 / 20 / 1 | 0 / 0 / 0 |
| worker_advances / worker_advance_allocations | 3 / 1 | 0 / 0 |
| suppliers / purchases / purchase_returns | 7 / 31 / 8 | 0 / 0 / 0 |
| supplier_credit_allocations / supplier_refunds | 4 / 2 | 0 / 0 |
| cash_transactions / cash_reversals / financial_accounts | 65 / 2 / 2 | 0 / 0 / 0 |
| vat_ledger | 18 | 0 |
| reconciliation_documents / reconciliation_sources | 4 / 65 | 0 / 0 |
| audit_logs | 1476 | 0 |
| work_catalog / part_catalog | 144 / 211 | 0 / 0 |
| master_identities | 56 | 28 category identities preserved |
| unit_catalog / transaction_categories | 14 / 23 | 14 / 23 unchanged |
| organizations / user_profiles / auth.users | 1 / 3 / 3 | 1 / 3 / 3 unchanged |
| signed Storage files / private buckets | 4 / 1 | 0 / 1 unchanged |

Automated tests cover read-only preview, missing approvals, incorrect role selection,
stale inventory, future tables, cross-organization references, rollback after a late
failure, unchanged preserved fingerprints, empty sources and remaining Storage rejection.
Storage tests cover exact path allowlisting, dry-run non-deletion, manifest drift and
reviewed-only API deletion with bucket preservation.

After verification, inspect empty Vehicles, Purchases, Suppliers, Workers, Work Queue,
Kassa journal/accounts/VAT/reconciliations; verify units/designations still selectable.
ADMIN must create Work, Part, Worker (with new specialty), Supplier and Vehicle/service
card. CASHIER must access Kassa but not ADMIN settings; INTAKE must access intake but
not Kassa, finance PDFs or ADMIN settings. Use existing credentials unchanged. Keep
screenshots, QA logs, manifests, backups and temporary credentials outside the repo.

Local browser verification completed: all three original accounts logged in; empty
pages rendered without database errors. ADMIN created one Work catalog entry, one Part
entry, a Worker with a new specialty, a Supplier and a Vehicle/service card using the
preserved `Xidmet` measurement unit (localized label in the UI). CASHIER reached Kassa
but not Security; INTAKE reached intake but not Kassa/Security, and its finance PDF
request returned 403. Direct authenticated RPC calls returned permission-denied 42501
for ADMIN-only mutations by CASHIER/INTAKE and for VAT posting by INTAKE. New local
smoke records are not production fixtures and are never included in the committed tools.

The local smoke records were then removed with a second preview/reset/verify cycle;
the local database finished empty again, with 14 units, 23 designations, 28 designation
identities and all three original users preserved. Final gates: `pnpm lint`,
`pnpm typecheck`, `pnpm test` (414/414, 36 files), and `pnpm build` passed.
Migrations 0001-0014 are unchanged; no 0015 exists. The pre-existing `.gitignore`
change is intentionally excluded from this delivery.
