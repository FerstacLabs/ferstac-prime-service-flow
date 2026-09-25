# PRIME Flow

PRIME Flow is a shared-workspace workshop management app for PRIME Tuning & Detailing, with ADMIN, CASHIER and INTAKE staff roles. It covers vehicle intake, service cards, planned work, purchases, suppliers, workers, financial summaries, printable reports and downloadable PDFs.

## Stack

- Next.js App Router, TypeScript strict mode, React
- Tailwind CSS theme tokens with a dark PRIME visual system
- Supabase PostgreSQL/Auth with RLS-ready migrations
- Zod validation helpers and React Hook Form-ready schemas
- `@react-pdf/renderer` PDF route handlers
- Vitest unit tests for plate validation and financial calculations

## Local Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Configure Supabase before using operational pages. The proxy protects the operational routes and redirects unauthenticated users to `/login`; report APIs also require an authenticated session. No production signup is exposed.

## Supabase Setup

1. Create a Supabase project.
2. In SQL Editor, run `supabase/migrations/0001_prime_flow_schema.sql`.
3. Run `supabase/seed.sql` for master data.
4. Run `supabase/migrations/0002_workshop_finance.sql`.
5. Run `supabase/migrations/0003_worker_advances.sql`.
6. Run `supabase/migrations/0004_rbac_audit_security.sql`.
7. Add these values to `.env.local` and Vercel (the service-role key is server-only):

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
```

8. Run `node scripts/provision-prime-users.mjs` in a trusted operator environment; transfer the one-time temporary passwords securely. Disable public signup in Supabase Auth. Complete first-login password changes.

The data model uses UUID primary keys and organization-scoped RLS. The three staff users share the same records; historical `owner_user_id` values remain creator metadata. Plates are unique within the organization. See [Production Security](docs/PRODUCTION_SECURITY.md) for the role matrix, provisioning, migration safety, backups and production checklist.

### Existing Production Database

Back up the existing database, then apply only pending migrations in order through `supabase/migrations/0004_rbac_audit_security.sql` before deploying this version. If 0001-0003 are already applied, apply only 0004. Do not rerun 0001-0003 or reseed production. Use the SQL Editor or your existing migration runner. This repository does not automatically apply remote migrations. 0004 preserves original creator IDs, historical rows and balances, bootstraps the original owner as admin, and aborts rather than silently merging ambiguous legacy owners.

`0002` adds private custom catalogs, customer quote lines, required parts and an owner-scoped payment ledger. Existing supplier `paid_amount` values are backfilled once into the ledger; the purchase field subsequently becomes a compatibility mirror, never an extra payment. Historical non-supplier paid amounts are retained without inventing cash transactions. Existing `labor_cost` remains actual worker cost; unknown historical zero costs and missing line quotes remain explicitly unknown.

`0003` replaces two financial guard functions to allow worker advances for TODO/IN_PROGRESS work against known agreed cost. It creates no tables and rewrites no transactions. Apply it before using the new payment controls; `0002` alone still rejects active-work payments.

Normal workshop reads and writes use the public Supabase key with the user's session and RLS. The server-only service-role key is required for protected username lookup, password/security operations and operator provisioning; it must never be exposed in client code. Audit is append-only; only ADMIN can void payments, retaining the original and an immutable reversal reference.

## Vercel Deployment

1. Push this repository to GitHub.
2. Import the project in Vercel.
3. Set the environment variables listed above.
4. Deploy with the default Next.js build command: `pnpm build`.
5. Later, add `app.<client-domain>` in Vercel Domains and keep `NEXT_PUBLIC_APP_URL` aligned.

## Main Routes

- `/login`
- `/overview`
- `/vehicles`
- `/vehicles/new`
- `/vehicles/[jobId]`
- `/purchases`
- `/suppliers` and `/suppliers/[supplierId]` (old `/purchases/suppliers/[supplierId]` links remain supported)
- `/workers`
- `/workers/[workerId]`
- `/work`
- `/kassa`
- `/reports/[scope]/print`
- `/api/reports/[scope]/pdf`
- `/api/reports/vehicle/[jobId]/pdf`

## Domain Notes

- Agreed budget is never decremented or mutated by purchases/labor.
- `lib/workshop.ts` derives quote, actual cost, receivables, payables and margins in integer minor units; persisted money uses PostgreSQL numeric values.
- Intake uses compact searchable work and required-part rows, each with its own customer price and up to 250 characters of notes. New work, part and worker-role entries persist for the owner.
- Purchases consume required parts without retyping them. Customer price stays separate from actual purchase cost. Additional unquoted purchases remain available for legacy jobs.
- Work Queue handles assignment, notes and operational status only. All non-cancelled work completed makes a job ready; delivered and paused jobs are not reopened automatically.
- Kassa records customer receipts against the whole vehicle receivable, supplier payments against purchases, and worker payments against assigned TODO/IN_PROGRESS/DONE work with known cost. Legacy line allocations remain historical records. CASHIER reads whitelisted finance projections, never line quotes or profit.
- Customer receivable = quote minus customer receipts; supplier payable = supplier purchase cost minus supplier payments. For each work item, worker earned = known cost only when DONE, advance = max(paid - earned, 0), earned payable = max(earned - paid, 0), remaining agreed amount = max(cost - paid, 0). Worker/job summaries sum these per-allocation results; advances never offset another work item's earned debt.
- Gross profit = customer quote minus actual part/worker costs, never cash received. Missing costs suppress a final margin and are explicitly flagged; legacy jobs do not invent per-line margins.
- Worker period filters select completed work by completion date and other work by planned date. Payments shown for those selected work items are all-time payments, so their remaining balance stays coherent. Kassa cash-period filters use the transaction date.
- Payments are immutable except for a reasoned audit void. Overpayments, cross-owner relations and duplicate submissions are checked on the server and in PostgreSQL. A settled purchase cannot be reassigned or voided until its payments are voided.
- Azerbaijan license plates normalize to `99-AA-999` via `normalizeAzPlate()` and validate with `isValidAzPlate()`.
- Suppliers are managed in the separate Suppliers panel. ADMIN can archive/restore or permanently delete the master; purchase identity snapshots and immutable payments survive deletion.
- Worker productivity is derived from `job_work_items`, not duplicated counters.

### Archive and Worker Cash Desk

- Vehicles has a separate visibility filter: Active (default), Archive, or All. Archiving only sets the existing `service_jobs.archived_at`; the archived detail remains readable and its Restore action clears that field. Work, purchases and ledger history are never deleted by these actions.
- Kassa has Cash, Bank, Journal and Worker Settlement tabs. Actual cost is read-only here and defined by ADMIN in Purchasing. Customer receipts and multi-recipient settlement use vehicle-level dialogs. Fully prepaid active work counts as paid, not earned; advances never change gross profit.
- Worker Print/PDF uses the same worker/period/debt selection as the screen. The selected work's paid totals and payment history cover all settlement dates; history columns explicitly label current earned/outstanding values rather than implying an immutable historical balance.
- Missing-cost warnings are omitted when both missing counters are zero. An explicitly known zero labor cost or a customer-provided part does not count as missing.
- Handover is visible in the vehicle detail's top action area. It is unavailable with an explanation before READY/DELIVERED; eligible archived jobs retain both Print and PDF access.
- Unknown worker cost blocks payments until saved; explicit zero is a known cost with no payment control. The server serializes payments against the service-job row and rejects amounts above the remaining agreed cost, even for direct ledger inserts. Idempotency and reasoned audit voids are unchanged.
- Cancelling work with active worker payments remains blocked. Review and explicitly resolve incorrect payments through the audit-void flow; the app never silently reverses cash. Any existing cancelled-work payment history remains visible, with advances separate from earned debt and no new payment control. Completion never changes ledger dates or amounts.
- Archive/handover refinements need no schema changes; worker advances require the forward migration `0003_worker_advances.sql` after `0002`.

## Brand Assets

The app uses:

- `public/brand/prime-logo.png`
- `public/brand/prime-transformer-f30.png`

Replace those files with final brand exports if needed; filenames can remain unchanged.

## Quality Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Reports and Verification

- Print and PDF share `lib/reports/workshop-report.ts` and the active URL filters. Reports use the original PRIME logo and bundled Noto Sans Unicode fonts, without remote font requests.
- Customer quotations whitelist customer-facing prices and omit all internal costs, payments and margins. Internal reports include the financial breakdown.
- Ready/delivered jobs can generate an A4 handover act recreated from the supplied printed form. It fills only plate and current Baku date; handwritten names and signatures are not copied.
- Automated coverage includes real PostgreSQL execution through PGlite, forward migration/backfill, RLS ownership, duplicate/overpayment rejection, catalog/intake transactions, state propagation, money calculations, filters and PDF rendering.
- Optional `PRIME_REPORT_QA_DIR` exports PDF test artifacts to a chosen local folder for visual review. Machine-specific browser/database QA helpers are not part of the repository.
- After migration and deployment, sign in and smoke-test intake, purchase, work completion, Kassa settlement and PDF/Print against the configured Supabase project.

## Cash / Bank Ledger (0007)

- `cash_transactions` remains the sole source of money movements. Migration 0007 adds channel/account/category fields in place and backfills old rows as CASH without copying payments. Amounts remain NUMERIC; all accounts are AZN only.
- Balances include opening entries and transfers; business income, expense and net cashflow exclude both. Transfers create two linked movements atomically; voiding either reverses both. Only ADMIN can enter one live opening balance per source.
- ADMIN may correct costs or quotes without altering historical money. Negative allocation balances are overpayments requiring explicit reconciliation. Settlement shows outstanding obligations and credits separately, never offsets different recipients, and rejects closure while any allocation is unresolved.
- Closure requires known costs, every supplier/worker allocation exactly settled and customer due zero. Closed jobs reject financial mutations. ADMIN must reopen with a reason. The immutable audit records actor/time, individual cost and payment totals, customer remaining and reopening reason.
- Finance reports share filters and calculation code for PDF/Print: cash orders, bank documents, combined journal, daily/period source balances, vehicle, worker and supplier payments. Orders are internal documents, not asserted statutory forms.
- See [manual 0007 rollout](docs/finance-ledger-rollout.md). Production migration is never part of the build or deployment command.
