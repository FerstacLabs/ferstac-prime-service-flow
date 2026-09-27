# Master Data, Filters and Document Names (0009)

## Manual Production Rollout

No production migration or data mutation was performed during implementation.

1. Back up the production database and record the current application version. Confirm migrations 0001 through 0008 are applied. Do not rerun seeds or older migrations.
2. Schedule a short maintenance window and pause application traffic/writes. Migration 0009 repoints worker/account/category foreign keys to durable identities; old application versions that embed the former PostgREST relationships must not serve traffic afterward.
3. Apply only `supabase/migrations/0009_master_data_and_workflow_refinements.sql` with the established migration runner or SQL Editor. It is transactional. Stop on any error; do not mark a failed migration applied.
4. Refresh PostgREST metadata with `notify pgrst, 'reload schema';`. Confirm `master_directory`, `manage_master_lifecycle`, `work_queue_data` and `finance_data` are available and the migration is recorded by the normal deployment process.
5. Deploy this application revision before reopening traffic. Build with the existing production environment configuration; do not copy local QA credentials.
6. As ADMIN, create disposable worker/account/category records and check archive, restore and safe deletion. Verify an active worker and a nonzero account cannot be deleted. Check historical names, an old bank order/IBAN and a worker report. Do not delete real master data for smoke testing.
7. As CASHIER, verify transactions accept active accounts/categories but master mutations are denied. As INTAKE, verify work assignment changes TODO to IN_PROGRESS without financial access. Check disabled/stale-session restrictions remain effective.
8. Verify Kassa report filters/reset do not change the settlement selection; purchase-history filters/reset retain the operational purchase card. Download a filtered PDF and check its name, contents and Print title. Reopen traffic only after these checks pass.

Do not down-migrate the identity registry or restore the old application independently after master deletions. Prefer a forward fix. Any emergency database restore must be coordinated with the application version and must account for writes after the backup.

## History and Security

- `master_identities` preserves the master identity, organization and final snapshot. Operational master rows are truly deleted; immutable ledger/work identifiers remain unchanged. There is no financial cascade deletion.
- The registry has RLS and no direct authenticated/anonymous privileges. `master_directory` is organization-scoped and role checked. Worker details are ADMIN-only; the INTAKE work-queue projection exposes only operational identity fields.
- Lifecycle mutations require ADMIN and explicit permanent-delete confirmation. Active TODO/IN_PROGRESS assignments block worker deletion. Nonzero balances or incomplete/unbalanced transfer groups block bank deletion. Mandatory customer/supplier/worker categories are protected.
- Completed-worker payments, purchase buyer names, category labels, account names and IBANs remain resolvable after deletion. Archived/deleted identities are excluded from new operation choices, but remain available as historical report filters.
- Automatic work status changes occur in the assignment mutation. Existing paid-work, financial-closure, organization and audit-immutability protections remain in force.

## URL and Report Contract

- Kassa `job` is a journal/report filter. Only `view=settlement&settlementJob=...` selects the operational vehicle settlement.
- Purchases `job` filters history; `purchaseJob` selects the purchase card and `costingJob` selects labor costing. Filter reset/pagination preserve both operation keys.
- Kassa general report actions live under Reports; transaction orders retain their own PDF/Print actions.
- Both PDF route families use `document-filename.ts`: resolved context, optional period, Baku date/time, random suffix, ASCII transliteration and a 180-character limit. Both emit attachment headers with filename and filename*. Both Print route families supply meaningful server metadata titles.

## Verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. DB tests apply 0009 only in disposable PostgreSQL. Local browser QA covers lifecycle controls, filter URL/visible-state reset, independent selections, automatic INTAKE status, historical reports, actual PDF download names and desktop/mobile layouts.

Browser scripts, screenshots, generated PDFs and local database credentials are external QA artifacts, not application source or deployable assets.
