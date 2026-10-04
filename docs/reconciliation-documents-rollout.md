# Reconciliation Documents: Manual Rollout

## Scope

Apply only `supabase/migrations/0013_reconciliation_documents.sql`, after migrations 0001-0012. No production database or production Storage objects were changed by this implementation. Do not create a second migration for this delivery or replay older migrations.

The migration adds durable supplier identities, party-period reconciliation documents, immutable source/report snapshots, relational source links, lifecycle audit events, change detection, history indexes, and the private `prime-reconciliations` bucket. Financial transactions remain in the existing ledger; saving, uploading, confirming, or revising a document creates no cash movement.

## Preflight

1. Schedule a short finance maintenance window. Take and verify the normal database backup/PITR recovery point. Retain the existing Storage backup procedure; database backups alone do not contain uploaded PDF bytes.
2. Verify the target project and confirm migrations 0001-0012 are already applied. Review the complete 0013 file. It uses one transaction and must run once, as the database owner through the approved migration runner or Supabase SQL Editor.
3. Verify server-only `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the exact public HTTPS `NEXT_PUBLIC_APP_URL`. The last value is the trusted upload Origin, not an internal reverse-proxy address. Do not expose the service key to the browser or logs.
4. Rehearse the rollout on a staging copy. For self-hosted Storage, verify its JWT/JWKS configuration matches Auth. Managed Supabase handles this infrastructure; do not copy local QA keys or containers into production.

## Apply And Deploy

1. Apply the complete `0013_reconciliation_documents.sql` file once. Do not apply local QA delta scripts: those only upgraded the development test instance while 0013 was unshipped.
2. Confirm the migration committed successfully and record its application in the deployment migration registry. Do not run `db reset`, a seed, or an unreviewed broad migration push.
3. Verify `reconciliation_documents` and `reconciliation_sources` have RLS enabled. Verify `prime-reconciliations` has `public = false`, a 10 MiB limit, and only `application/pdf` as its MIME allowlist. Check the five restrictive object-boundary policies as well as the finance read policies.
4. Deploy the reviewed application commit. Keep the service-role key server-only. The service client is narrowly used to seal the server-generated report once and to store validated PDF bytes; normal document reads, source capture, confirmation and downloads retain the user's authorization context.
5. Check the journal and an existing party-period preview without changing money. Using an approved internal reconciliation, verify save, numbered PDF/Print, signed-file upload, authenticated download, explicit confirmation and history lookup. Confirm the PDF and page show the same document number.
6. Verify ADMIN and CASHIER access. Verify INTAKE and an account from another organization cannot read the document, download/upload its file, or confirm it. Public object URLs must fail. Check readable lifecycle Audit entries.
7. Resume finance use only after these checks pass. Backdated-transaction and revision stress tests belong in staging, not on customer production balances.

## Operating Rules

- A new document is a draft. Uploading a signed PDF does not confirm it. Confirmation requires a separate checked confirmation action.
- Source data is captured in the database. The trusted server seals the canonical report once. A stored financial report never reloads amounts from current mutable finance data; only lifecycle display metadata may change.
- Opening balances use pre-period history. Worker earnings use completion dates; cash uses transaction dates. General advances, work debt, bonuses and non-cash allocations remain separate.
- Journal balances use the full chronology of each individual account, including transfer legs and excluding voided amounts. Party/date filters do not redefine account balances.
- A changed period marks an existing document outdated. Earlier account activity can also invalidate a stored payment's account balance. An outdated draft cannot be confirmed or accept a new signed file; create a new version.
- Confirmed financial snapshots, source links and signed files are not normally editable/deletable. A revision preserves its predecessor. Confirmation of a revision marks earlier confirmed versions superseded; creating a draft alone does not.
- Signed files use generated organization/document/UUID paths. Maximum size is 10 MiB. MIME, PDF header/trailer and size are checked before server-side upload. Replacements before confirmation get a new path; confirmed files are never overwritten.
- No automatic document or file retention purge is installed. Set a reviewed business retention/backup policy before any future cleanup tooling.

## Verification Coverage

- Automated database tests cover the existing intake, costing, RBAC, archive/restore/safe-removal and accounting invariants, plus draft creation, durable/deleted supplier identities, source links, trusted sealing, signed attachment, confirmation, immutable records, cross-organization denial, backdated changes and superseding revisions.
- Storage tests include an unrelated permissive read policy to prove the reconciliation restrictive boundary still denies INTAKE and cross-organization access.
- Pure/report tests cover account partitioning, 1000 + 500 - 200 = 1300 under an expense-only filter, transfer/reversal handling, frozen account balances, period-end general advances and PDF validation.
- Local browser QA covers ADMIN and CASHIER save/upload/download/confirm, invalid/oversized files and hostile Origin rejection, confirmed-file replacement rejection, searchable history, period-change warning, v2 and retained v1, supplier reconciliation, and SQL comparison of filtered cash/bank/transfer row balances.
- Visual QA uses the actual A4 worker/supplier PDFs and Print views. Responsive checks cover 1920, 1366 and 390 pixels. Wide financial tables scroll within their container.
- Existing automated CRUD/accounting coverage is combined with live page smoke checks for Vehicles, Purchases, Suppliers, Workers, Work Queue, Overview, Cash/Bank, Audit and Security. This is not a claim of exhaustive manual testing of every legacy control.

## Findings Addressed

- Mixed-account journals previously omitted account balances; they now partition the complete chronology by account.
- Worker opening debt could net one work's overpayment against another work's unpaid debt. It now preserves per-work obligations, matching closing-debt semantics.
- General advances now use allocations through the selected period end, not today's remaining value.
- Supplier master deletion no longer prevents a historical reconciliation from being saved.
- Period reports and today's operational settlement controls are separated on screen.
- Upload Origin validation uses the configured public app origin; stale drafts and confirmed files reject uploads.
- History detects an existing confirmed period even while a newer draft exists. Confirmation actor names are snapshotted.
- Supplier chronology keeps credit, refund, payment and payable columns separate; dense pagination and document date formatting were verified visually.
- Audit resolves missing creation-time totals from the same immutable document snapshot in one batched query, not one query per row.

## Rollback

If deployment smoke checks fail, stop new reconciliation operations and roll back the application deployment to the previous reviewed commit. Preserve 0013, every document/source row and all uploaded files. Do not drop tables, delete the bucket, rewrite a confirmed snapshot, or reset the database. Investigate and issue a reviewed forward fix after protecting both database and object backups.

## Non-Critical Follow-Up

Define organizational retention and recovery drills for signed financial documents. Malware scanning can be added to the upload pipeline if the deployment threat model requires it; files currently receive structural byte/type checks and are delivered as authenticated PDF attachments, not executed or previewed as arbitrary HTML.
