# Customer acceptance, drafts and discounts

## Approval gate

No production access, migration, deployment or merge is authorized by this change.
Wait for the exact human approval `PRODUCTION DEPLOYMENT APPROVED` and arrange a
customer maintenance window. This document is a plan, not an execution record.

Branch: `codex/customer-handover-drafts-discounts`.

## Behavior and boundaries

- ADMIN and INTAKE can print the original, complete two-section paper act at
  reception. Both legal sections and all four blank signature fields are always
  retained; the second section is signed only on actual return. Only the vehicle
  plate and document date are substituted. Document generation never writes job
  status. The control is explicitly labeled PDF / Print, not delivery confirmation.
  CASHIER document permissions,
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
- Sidebar module links remember the last local route and allowlisted query
  parameters, scroll and expanded details using the same scoped session storage.
  An adjacent list icon opens the root route explicitly. Save/discard clears the
  workflow pointer; editing again remembers the new draft. No automatic redirect
  is introduced. Deleted/inaccessible record URLs still enforce existing server
  permissions/404; the list icon provides a way out without resurrecting records.
- New cash movements and labor costing forms now use the same draft mechanism.
  Cash movement dialogs restore their entered fields and open/closed state.
  Settlement/reversal confirmations remain explicit and are not auto-submitted.
  Restoring any draft never sends a purchase, payment or vehicle mutation.
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

### Paper template and navigation follow-up (2026-10-22)

Final local gates: lint PASS, typecheck PASS, **493/493 tests in 45 files PASS**,
production build PASS. No authenticated staging or production request was made
by this follow-up. Browser navigation used synthetic local fixtures and real
components with mocked server actions/router. `0017` ran only in isolated PGlite.

The prior acceptance branch condition incorrectly replaced Section 2 and added
customer/job/work details. Those changes are removed. The restored PDF text was
compared against the supplied original reference, differing only in dynamic plate;
both PDF and Chrome Print are one A4 page. The PDF layout matches the reference.
Navigation previously preserved form values but sidebar links always used module
roots. The current sidebar restores the workflow URL as well as draft state.
Real Chrome component tests cover actual sidebar/new-vehicle/purchase/cash forms,
refresh, query restoration, scroll, explicit list navigation, discard and no submit.
Server actions and router are mocked in that harness, not live staging E2E.

The final delayed-save follow-up adds seven regression cases using real
ActionForm/DraftSession/WorkflowNavigation components and deferred mock actions.
A vehicle save finishing after navigation to Kassa clears only its source draft
and route. Kassa values, route/query and refresh restoration remain intact;
returned errors and rejected requests preserve both drafts. Explicit discard
and user/organization switches remain isolated. Completion now checks the
existing draft operation key before clearing: a late response cannot delete a
replacement draft created after discarding the original workflow. Focused tests:
26/26 PASS. The earlier PDF visual and browser harness checks were not repeated
for this storage-only change. Authenticated staging HTTP E2E remains required.

Forward-only `0017_guard_vehicle_delivery.sql` adds a validation trigger only.
The app has no final-delivery confirmation button; printing remains available
before READY. For actual DB delivery transitions, ADMIN and an active READY card
with no unfinished work are required. A delivery timestamp alone cannot bypass
the status check. All-DONE/CANCELLED is the existing readiness rule; no new payment
or worker-debt condition is added. No existing rows are rewritten. Apply 0017 only
in approved staging/production rollout after preceding migrations, never silently.

Local ESLint, TypeScript, Vitest and optimized Next.js build are required gates.
Previous local verification on 2026-10-21: `pnpm lint` PASS, `pnpm typecheck`
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
PDF renderer and Chrome print output: original two-section act and discounted
quotation. Visual PNG review covers Unicode, totals and pagination.
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

### Terminal delivery state follow-up (2026-10-23)

The operator confirmed 0017 is already installed on permanent staging. Do not
edit or reapply it as a fix. Its guard checked the destination status or a changed
timestamp, so DELIVERED -> WAITING with an unchanged timestamp skipped validation.
It also allowed rewriting a completed delivery timestamp.

Forward-only `0018_guard_delivered_state.sql` replaces only the existing private
trigger function. Unchanged delivery fields still permit unrelated authorized
edits; any status/timestamp change from DELIVERED is rejected. Existing ADMIN,
organization, readiness, unfinished-work, insert and active-card checks remain.
The trigger identity, grants, RLS and existing rows are preserved. No historical
data is repaired or rewritten, and PDF/Print remains separate from final delivery.

Local gates: lint PASS, typecheck PASS, **527/527 tests in 46 files PASS**, build
PASS and `git diff --check` PASS. The original 493 tests are retained. New coverage
adds 28 PostgreSQL cases with BEGIN/ROLLBACK and savepoints, plus six real PDF/Print
handler tests with a read-only mocked Supabase boundary. All migrations run in
order on isolated PGlite; before/after 0018 checks confirm installed 0017's trigger
identity/security settings and existing records are unchanged. The original
staging bypass was reproduced locally before adding 0018 and rejected afterward.

0018 has NOT been applied to permanent staging or production. Separate approval
and real staging verification are still required. No commit, push, merge or
deployment was performed. 0017 and the pre-existing local configuration are
unchanged. Existing uncommitted work and external QA artifacts are preserved.

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
   reviewed 0015/0016/0017/0018 checksums, and check the target database identity privately.
   Confirm expected RPCs/columns and which of 0015/0016/0017/0018 have already been applied.
   Confirm no long-running writers, sufficient disk space and a tested restore.
   Do not rerun this migration blindly: renamed RPC wrappers make it non-idempotent.
   Apply only unapplied 0015, 0016, 0017, then 0018 with ON_ERROR_STOP through the established secure local-to-VPS
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
