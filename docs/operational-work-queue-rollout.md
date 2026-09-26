# Operational work queue and readable audit (0008)

## Manual Rollout

1. Back up production and confirm migrations 0001 through 0007 are already applied. Do not rerun old migrations or seed production.
2. Apply only `supabase/migrations/0008_operational_work_queue.sql` through the existing migration runner or SQL Editor, before deploying this application version.
3. Confirm PostgREST has refreshed its schema cache. If necessary, run `notify pgrst, 'reload schema';`.
4. Deploy the application. Sign in as INTAKE and verify `/work`, assignment, status, notes and the work PDF/Print. Verify Kassa, Audit, worker costing and finance reports remain forbidden for INTAKE.
5. Sign in as ADMIN and check localized Kassa categories, readable audit changes, PRIME-only branding and work/audit reports.

Production is not migrated by the build or by these tests. No production database was changed during implementation.

## Security Boundary

- `work_queue_data(text)` returns allowlisted operational fields for ADMIN/INTAKE in the current organization. It never returns quotes, costs, balances, payment records or worker contact information.
- `update_work_assignment(uuid,uuid,text,text)` accepts only worker, status and operational notes. It locks the service job before the work item, checks organization membership, session validity and active worker membership, and preserves existing paid-work and financial-closure guards.
- No direct INTAKE table-write policy, financial permission or cashier permission is broadened. Existing additional work permits operational updates only; its source and financial fields remain protected.
- Audit records remain immutable. Display-only lookups resolve related names within the organization. Missing historical values are explicitly marked unavailable, and the present reversal state is labeled as current rather than rewritten into history.

## Report Scope

Work reports contain no financial fields for either role. Work notes are shortened only in reports; the stored note remains unchanged. Audit exports retain the existing selected 50-record page and filters, explicitly showing matching total, page and exported count. Neither report exports raw JSON, technical entity names or UUIDs.

## Verification

Run `pnpm lint`, `pnpm typecheck`, `pnpm exec vitest run --maxWorkers=2` and a build configured against local/test Supabase. The limited worker count avoids resource contention between PostgreSQL and PDF render tests on Windows.

The database suite applies the forward migration and covers INTAKE assignment, financial-free projections, cashier denial, organization isolation, additional work, paid assignment/cancellation guards, financial closure and disabled/stale/first-login sessions. Rendering tests cover localized audit details, secret-field exclusion, brand cleanup and multi-page Unicode PDF output.
