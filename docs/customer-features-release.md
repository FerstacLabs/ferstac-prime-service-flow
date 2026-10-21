# Customer acceptance, drafts and discounts

## Approval gate

No production access, migration, deployment or merge is authorized by this change.
Wait for the exact human approval `PRODUCTION DEPLOYMENT APPROVED` and arrange a
customer maintenance window. This document is a plan, not an execution record.

Branch: `codex/customer-handover-drafts-discounts`.

## Behavior and boundaries

- ADMIN and INTAKE can view, download and print acceptance immediately. Only a
  DELIVERED card with an actual delivery date includes the return attestation.
  Document generation never writes job status. CASHIER document permissions,
  INTAKE purchasing restrictions, role hosts and RLS are unchanged.
- New/edit vehicle, supplier, new worker and purchase forms use versioned,
  eight-hour sessionStorage drafts. Keys include organization, user, role,
  last-sign-in identity and form/entity identity. Controlled quote rows, funding,
  dates, VAT and discount are restored. Passwords, tokens, files and server-owned
  hidden IDs are excluded. Successful save/discard clears and remounts the form;
  errors retain input and the retry key. Discard is disabled during submission.
  Storage failures show a warning; drafts are not a server backup.
- Tabs normally have independent sessionStorage. Browser duplicate-tab may copy
  the same draft/retry key: both represent the same logical create operation;
  existing server idempotency prevents a second insert. Start a fresh draft for
  an intentionally different record. BroadcastChannel logout clears other tabs.
- Filters already use URL query parameters. Financial movement/settlement dialogs
  remain explicit, non-persistent confirmations; restoring a draft never sends
  a purchase, payment or vehicle mutation. Financial dialog draft persistence is
  deliberately not added.
- NONE, PERCENT (0-100) and AMOUNT (AZN) apply to the **VAT-exclusive contract
  quote**, including additional quoted work/parts. Round the discount half-up to
  two decimals, subtract once, then calculate 18% VAT. Fixed discounts are net
  AZN, not VAT-inclusive. This matches the existing net quote/VAT model.
- Costs, worker percentage bases, earned-versus-advance rules, supplier debt and
  actual cash movements are unchanged. Total profit uses discounted net revenue.
  Work/parts aggregate margins allocate the discount proportionally with the
  residual cent assigned to parts. Original individual line margins are labeled
  as before-discount where a discounted contract is shown.
- Existing active customer payments freeze discount/pricing edits, even when
  unpaid debt remains. Use the existing authorized reversal process first;
  closed/archived/deleted cards must also be reopened through existing controls.
  Reversal preserves history, then the new quote/debt is recalculated. There is
  no new customer refund feature or fake cash entry for a discount.
- Discounted customer quotations include all quoted additions so their total
  matches the contract. Undiscounted initial quotation scope remains unchanged.
  Legacy cards default to NONE/0. Immutable confirmed reconciliation snapshots
  are not rewritten and never gain internal cash/bank balances.

## Migration 0015

`supabase/migrations/0015_customer_discounts.sql` is transactional and additive:
two service_jobs columns and constraints, private pricing/validation helpers,
pricing guards and authenticated RPC wrappers. Existing 0001-0014 are unchanged.
No destructive DDL, data deletion, seed, auth modification or RLS relaxation.
Old RPC implementations are retained internally but execution is revoked from
public/anon/authenticated; new wrappers retain the existing role checks.

The new columns default existing rows to NONE/0 without changing quote, purchase,
payment, VAT ledger or worker compensation values. ALTER TABLE still requires a
lock and constraint validation: production duration is not measured. The full
schema, legacy fixtures, permissions and financial flows run in isolated PGlite
PostgreSQL tests, not against production.

## Validation record and limitations

### Worker selection follow-up

Labor cost save now requires a real worker selection. The client displays
"Usta seçilməyib. Maya dəyərini yadda saxlamaq üçün əvvəlcə işi görəcək ustanı seçin."
before submitting and preserves the cost, percentage checkbox and other inputs.
The Server Action rejects missing/malformed worker IDs before calling the RPC.
Forward-only `0016_require_costing_worker.sql` additionally rejects null,
nonexistent and foreign-organization workers inside `set_work_compensation`
before any assignment/cost update. Existing function grants and underlying
assignment, completion, compensation and debt logic are unchanged.
No existing rows are rewritten. Apply 0016 after 0015 during the approved window;
never edit/replay previously applied migrations. Both migrations remain unapplied
to production. Include an authenticated missing-worker RPC rejection and a valid
cost save in isolated staging, using synthetic data and separate credentials.
Keep staging on a private network, with no production integrations or customer
data; verify all three role portals and ADMIN/INTAKE PDF/Print there before release.

Local ESLint, TypeScript, Vitest and optimized Next.js build are required gates.
Final local verification on 2026-10-21: `pnpm lint` PASS, `pnpm typecheck`
PASS, `pnpm test` **481/481 tests in 44 files PASS**, and `pnpm build` PASS.
The full suite includes 28 VAT/discount/worker-validation database tests using isolated PGlite.
The follow-up adds 11 cases: three UI tests, seven Server Action tests and one
atomic database regression. Existing worker-finance and draft tests still pass.
The final Cashier dialog test verifies original net quote, discount, final gross,
received payments and remaining debt, preserves the payment cap, and performs no
transaction. Build-time Supabase configuration was overridden with local dummy
values; no production database was used. Changed-file credential-pattern scan:
9 follow-up files, zero matches (pattern scanning is not an exhaustive security audit).
`git diff --check` passed. No remote CI run is claimed; final commits remain local.
Feature tests: customer-discount, form-draft, customer-documents-render and the
0015 group in vat-db. Existing security, VAT, ledger, worker advance, privacy,
payment linkage and report tests are retained.

Real Chrome component harness (local fixtures, mocked server actions): navigation
away/back, four actual quote rows, dates, insurance, percentage/VAT totals,
purchase draft, one submit, clearing, separate tabs/logout and 390/1366px layout.
PDF renderer and Chrome print output: acceptance, delivered, discounted quotation
and long acceptance. Visual PNG review covers Unicode, totals and pagination.
Local artifacts/harness: `D:/prime-customer-features-qa/` (not committed).
These machine-specific harness scripts and generated PDFs/screenshots are not
runtime or build dependencies. Portable regression coverage is committed in
`tests/form-draft.test.tsx`, `tests/customer-documents-render.test.tsx` and the
discount/database tests. The local harness is retained, not deleted; its absolute
Chrome/package paths and mocked actions are not a portable staging E2E suite.

**Unexecuted:** real Next.js login -> Auth -> PostgREST -> PostgreSQL browser E2E,
including authenticated PDF downloads as both ADMIN and INTAKE. Local Docker's
Linux engine was unavailable; no production endpoint was used as a substitute.
Role/path unit tests and database authorization tests are not a claim that this
live HTTP integration ran. Complete these tests in an isolated staging stack
before production approval. Cross-tab logout uses same-origin BroadcastChannel;
role-specific portals intentionally have independent origin storage.

## Deployment after approval only

1. Complete isolated staging E2E, review PR/CI, confirm all gates and customer
   approval. Merge only after approval. Build the immutable main commit image
   through the existing CI/GHCR workflow; do not deploy feature-branch tags.
2. Schedule roughly 15-30 minutes for maintenance, backup verification, migration,
   image switch and read-only smoke checks. This is a planning allowance, not a
   measured VPS downtime. Notify users, finish pending saves, stop all writers
   including integrations, and close/reload old browser tabs before reopening.
3. Record the current image SHA and deployed migration list. Obtain a fresh full
   PostgreSQL backup (including auth, public/private schemas and roles/grants as
   needed) and Storage backup. Verify restore in an isolated database, not merely
   dump size. Record baseline row counts and financial totals privately.
4. Preflight: verify 0001-0014 in the deployment migration registry, match the
   reviewed 0015/0016 checksums, and check the target database identity privately.
   Confirm expected RPCs/columns and which of 0015/0016 have already been applied.
   Confirm no long-running writers, sufficient disk space and a tested restore.
   Do not rerun this migration blindly: renamed RPC wrappers make it non-idempotent.
   Apply only unapplied 0015 then 0016 with ON_ERROR_STOP through the established secure local-to-VPS
   administrative procedure, with bounded lock/statement timeouts. If a timeout
   occurs, abort and investigate; do not disable constraints/triggers or rerun
   old migrations. Reload the PostgREST schema cache after commit.
5. Switch to the exact approved GHCR SHA using the existing source-free deploy
   script: `sudo /opt/ferstaclabs-prime-flow/tools/deploy.sh <40-character-git-sha>`.
   The reviewed source is `deploy/deploy.sh`: it pulls the SHA-tagged GHCR AMD64
   image, uses the existing private `supabase_default` network and root-owned
   environment file, and binds the app to `127.0.0.1:3001` behind Nginx.
   No application checkout, build, database port exposure or secret copying is
   needed on the VPS. Transfer only the reviewed migration via the established
   secure admin procedure; the deploy script does not apply SQL.
   Do not restart unrelated services. Check all role portals and health,
   session/role-host enforcement, existing records and read-only report totals.
   Do not create test vehicles/payments in production.
   Compare pre/post counts and existing quote, customer debt, supplier debt,
   worker earnings, cash/bank and VAT totals. Confirm existing cards are NONE/0,
   audit history is intact and signed reports contain no internal balances.
6. Reopen writes only after verification. Discount creation requires the new
   schema AND image. Announce completion only after actual deployment checks.

## Recovery

- Migration failure before COMMIT rolls back atomically; keep the old image and
  writers stopped until the cause is understood.
- The standalone script can restore the previous container on failed health/login
  checks, but this never reverses SQL. An interrupted script or failed `docker run`
  may require operator recovery; inspect state before retrying, keep writes blocked,
  and do not treat a reachable login page as proof of financial compatibility.
- After successful migration but **before any discounted card is written**, an
  image rollback can retain additive columns; verify NONE/0 records and totals
  before reopening. Old callers omit discount fields and are supported.
- **After discounted cards exist, old-image rollback alone is unsafe:** older
  application calculations omit discounts although DB functions include them.
  Stop writers, preserve a new backup and audit trail, and deploy a reviewed
  compatible forward fix. Do not clear discounts or drop columns to force an
  old image to work.
- Full backup restoration is a separately approved disaster recovery decision.
  It loses writes after the backup unless reconciled. Never restore over live
  customer data casually, reset/seed, or erase transaction history.

Production readiness is conditional on staging HTTP E2E, approved maintenance,
backup verification and deployment approval. Passing local tests is not a
production deployment or proof of live environment compatibility.
