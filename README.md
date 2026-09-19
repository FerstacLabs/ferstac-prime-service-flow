# PRIME Flow

PRIME Flow is a single-user workshop management app for PRIME Tuning & Detailing. It covers vehicle intake, service cards, planned work, purchases, suppliers, workers, financial summaries, printable reports and downloadable PDFs.

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
5. Create the admin user from Supabase Auth dashboard.
6. Add these values to `.env.local` and Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
```

The data model uses UUID primary keys, keeps `vehicles.plate` as the visible unique business identifier per owner, and uses UUID foreign keys for jobs, purchases, suppliers, workers and work items. Private tables have RLS policies scoped to `auth.uid()`.

### Existing Production Database

Back up the existing database, then apply **only** `supabase/migrations/0002_workshop_finance.sql` before deploying the updated app. Do not rerun `0001` or reseed production. The new migration is transactional and forward-only, preserving historical rows, costs, budgets and master catalogs. Apply it once using the SQL Editor or your existing migration runner. This repository does not automatically apply remote migrations.

`0002` adds private custom catalogs, customer quote lines, required parts and an owner-scoped payment ledger. Existing supplier `paid_amount` values are backfilled once into the ledger; the purchase field subsequently becomes a compatibility mirror, never an extra payment. Historical non-supplier paid amounts are retained without inventing cash transactions. Existing `labor_cost` remains actual worker cost; unknown historical zero costs and missing line quotes remain explicitly unknown.

All normal application access uses the public Supabase key with the user's session and RLS. A service-role key is not required for these workflows and must never be exposed in client code.

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
- `/purchases/suppliers/[supplierId]`
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
- Kassa records receipts against specific quoted work/part lines, supplier payments against purchases, and worker payments against completed assigned work. Legacy jobs can receive payment against their existing budget.
- Customer receivable = quote minus customer receipts; supplier payable = supplier purchase cost minus supplier payments; worker payable = earned completed-work cost minus worker payments.
- Gross profit = customer quote minus actual part/worker costs, never cash received. Missing costs suppress a final margin and are explicitly flagged; legacy jobs do not invent per-line margins.
- Worker period filters select completed work by completion date and other work by planned date. Payments shown for those selected work items are all-time payments, so their remaining balance stays coherent. Kassa cash-period filters use the transaction date.
- Payments are immutable except for a reasoned audit void. Overpayments, cross-owner relations and duplicate submissions are checked on the server and in PostgreSQL. A settled purchase cannot be reassigned or voided until its payments are voided.
- Azerbaijan license plates normalize to `99-AA-999` via `normalizeAzPlate()` and validate with `isValidAzPlate()`.
- Suppliers are managed inside Satınalma with clickable history pages. Kassa is the sixth main panel.
- Worker productivity is derived from `job_work_items`, not duplicated counters.

### Archive and Worker Cash Desk

- Vehicles has a separate visibility filter: Active (default), Archive, or All. Archiving only sets the existing `service_jobs.archived_at`; the archived detail remains readable and its Restore action clears that field. Work, purchases and ledger history are never deleted by these actions.
- Kassa has Vehicles and Workers views. The Workers view supports worker, period and outstanding/fully-paid filters, with per-work cost entry and payments allocated through the existing `WORKER_WORK_ITEM` ledger. Customer quotes are read-only. These payments remain cash OUT and never change gross profit.
- Worker Print/PDF uses the same worker/period/debt selection as the screen. The selected work's paid totals and payment history cover all settlement dates; history columns explicitly label current earned/outstanding values rather than implying an immutable historical balance.
- Missing-cost warnings are omitted when both missing counters are zero. An explicitly known zero labor cost or a customer-provided part does not count as missing.
- Handover is visible in the vehicle detail's top action area. It is unavailable with an explanation before READY/DELIVERED; eligible archived jobs retain both Print and PDF access.
- These refinements reuse the existing schema and require no new migration. Migration `0002_workshop_finance.sql` remains a prerequisite on databases that have not yet applied it.

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
