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

Without Supabase environment variables the app runs in demo-preview mode with seeded in-repo data. After Supabase is configured, middleware protects the operational routes and redirects unauthenticated users to `/login`.

## Supabase Setup

1. Create a Supabase project.
2. In SQL Editor, run `supabase/migrations/0001_prime_flow_schema.sql`.
3. Run `supabase/seed.sql` for master data.
4. Create the admin user from Supabase Auth dashboard.
5. Add these values to `.env.local` and Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
```

The data model uses UUID primary keys, keeps `vehicles.plate` as the visible unique business identifier per owner, and uses UUID foreign keys for jobs, purchases, suppliers, workers and work items. Private tables have RLS policies scoped to `auth.uid()`.

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
- `/workers`
- `/work`
- `/api/reports/[scope]/pdf`
- `/api/reports/vehicle/[jobId]/pdf`

## Domain Notes

- Agreed budget is never decremented or mutated by purchases/labor.
- Parts cost, labor cost, total cost, remaining budget, estimated profit and unpaid supplier amounts are derived every time.
- Azerbaijan license plates normalize to `99-AA-999` via `normalizeAzPlate()` and validate with `isValidAzPlate()`.
- Suppliers are managed inside Satınalma, not as a sixth main panel.
- Worker productivity is derived from `job_work_items`, not duplicated counters.

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

## Assumptions

- Production signup is intentionally not exposed; create the admin in Supabase.
- Current preview uses realistic local demo data so the client can review the workflow before connecting Supabase.
- PDF generation uses a print-safe white report layout; custom Unicode font embedding can be added if a target PDF viewer fails Azerbaijani glyph rendering.
