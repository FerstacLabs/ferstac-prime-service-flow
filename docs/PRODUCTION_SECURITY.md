# PRIME Flow Production Security

## Deployment Status

`0004_rbac_audit_security.sql` is a forward migration. It is not automatically
applied to hosted Supabase by the application or provisioning script. Production
rollout requires a database backup, reviewed migration, staff provisioning and
the staging checks below. A successful app build does not mean production Auth,
MFA, public-signup settings or backups have been configured.

## Permission Matrix

| Feature | ADMIN | CASHIER | INTAKE |
| --- | --- | --- | --- |
| Vehicles / service cards | Full | Context inside Kassa only | Registration and customer quote |
| Purchases / suppliers | Full | Read context, pay existing purchases | No |
| Workers / work queue | Full | Accounting context only | Work status and quote only |
| Overview | Yes | No | No |
| Customer / supplier / worker payments | Yes | Yes | No |
| Worker cost | Yes | Dedicated cost RPC | No |
| Internal cost / profit | Yes | Kassa context | No, including direct database reads |
| Customer quotation PDF / print | Yes | No | Yes |
| Kassa / worker accounting PDF / print | Yes | Yes | No |
| Vehicle finance / handover / other reports | Yes | No | No |
| Archive / restore | Yes | No | No |
| Void / reversal | Yes | No | No |
| Audit / audit PDF / print | Read only | No | No |
| Staff account management | Non-admin accounts | No | No |

Roles are fixed. There is no public registration or dynamic permission builder.
Authorization never relies on editable Auth `user_metadata`, local storage or
navigation visibility. The server checks the protected membership for every
request/action; database policies repeat those checks.

## Shared Organization and Migration

The migration creates the `prime` organization and adds non-null
`organization_id` to all business/catalog tables. Existing `owner_user_id` values
remain unchanged as creator/legacy-owner metadata. All three staff identities
operate on the same rows, not copied datasets. Existing cost, quote, advance and
payment calculations are retained.

The original legacy owner becomes the `admin` member. For safety the migration
ABORTS transactionally if multiple distinct legacy owners are found: review their
tenant mapping rather than combining unrelated businesses. With no business rows,
a sole Auth user is selected; with several Auth users, set the transaction-local
`prime.bootstrap_admin_id` to the reviewed original user's UUID or link the
reviewed identity through the provisioning environment variable below. With no
Auth users, the script creates the three identities after migration.

Do not modify or rerun migrations 0001-0003 on production. Apply 0004 once via
the normal migration tooling or Supabase SQL Editor. The migration preserves
legacy catalog IDs and financial history, backfills historical void references
with no invented historical actor, and removes Auth-user cascade deletion from
business history. The migration briefly disables existing table triggers only
inside the organization-backfill transaction, before enabling all old guards.

## Staff Provisioning

Run from a trusted operator terminal, never a public endpoint or build hook:

```text
node scripts/provision-prime-users.mjs
```

Provide `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and
`SUPABASE_SERVICE_ROLE_KEY` through the operator's secret manager/environment.
Optional initial passwords: `PRIME_ADMIN_INITIAL_PASSWORD`,
`PRIME_CASHIER_INITIAL_PASSWORD`, `PRIME_INTAKE_INITIAL_PASSWORD`. Omitted values
are generated with cryptographically secure randomness. Minimum 12 characters,
uppercase, lowercase and a digit; generated values are longer.

The script provisions `admin` / ADMIN / Administrator, `kassa` / CASHIER / Kassir,
and `qeydiyyat` / INTAKE / initial registration. New accounts require a password
change. Newly created temporary passwords print ONCE. Do not run under terminal
recording, CI logs or shared command transcripts. Deliver through an approved
one-time secret channel; do not place them in tickets or source control.

The original admin Auth identity/email is retained. For an empty workshop with
multiple Auth users, set `PRIME_ADMIN_AUTH_USER_ID` to the reviewed original ID.
The script refuses to silently replace an ambiguous administrator. Rerunning it
retains existing passwords, active states, roles and password-change flags; role
conflicts fail for operator review. An existing Auth alias without a membership
is linked without resetting its password. If interrupted after Auth creation,
reuse the one-time password output or use the controlled operator reset process.
Run only one provisioning process at a time.

## Login, Passwords and Sessions

The UI accepts only username and password. The server normalizes the username
and uses a server-only service client to resolve the protected membership to its
Auth identity. Supabase Auth verifies the password. Invalid credentials receive
one generic error; a disabled-account message appears only after password
verification. Normal UI does not expose internal email aliases.

Temporary-password sessions can only reach `/change-password` and logout. The
database also refuses business access while `must_change_password` is true.
Changing a password requires the current authenticated session, current password,
matching confirmation, 12-128 characters and uppercase/lowercase/digit. Auth stores
the password; the application never stores plaintext or hashes in profile rows.
Successful change clears the protected flag through a server-only RPC, invalidates
old JWT issue times and requires a fresh login. Global Auth logout invalidates
refresh sessions. `session_not_before` protects against previously issued tokens.

An admin can enable/disable or issue a random temporary password to CASHIER and
INTAKE in `/security`. Passwords are shown once in that response, not retrievable
later. A reset first marks the account as requiring a change and invalidates old
JWTs, then updates Auth; Auth failure leaves a restricted account, never silently
restores access. Retry reset to recover. ADMIN cannot be disabled or demoted by
the UI or membership trigger. The administrator changes their own password using
the authenticated change-password screen.

For a lost ADMIN password, an authorized Supabase project owner must use Auth
administration from a trusted operator environment to set a strong temporary
password for the SAME Auth UUID, mark that profile `must_change_password=true`,
advance `session_not_before`, and record the operator incident. Never create a
new owner or delete the original Auth user to recover access.

Disable **Allow new users to sign up** in Supabase Authentication settings before
production. Do not disable email/password login. Configure Supabase password
strength/leaked-password protection where supported, and review Auth rate limits.
The app uses Auth's existing login limits and does not create a spam-prone failed
login audit table. Because logins are server-side, also configure hosting/WAF
rate limits for POST requests to `/login` to protect the username lookup and
avoid a shared server IP exhausting Auth limits. Do not trust arbitrary forwarded
IP headers. Test the hosting provider's trusted proxy configuration.

## Database Enforcement

RLS is enabled for organizations, memberships, business tables, audit and
reversals. Policies validate active membership, password-change status, JWT issue
time, organization and role. Catalogs belong to the organization too. Signup
without a protected membership grants no workshop access.

ADMIN can insert/update ordinary business rows. CASHIER gets financial-context
SELECT but no generic operational UPDATE or INSERT. Payments and worker cost
use narrow authenticated RPCs with explicit role and organization checks. INTAKE
cannot SELECT the underlying `job_work_items` finance-bearing rows; the
`intake_work_items` RPC returns an explicit safe projection with quote/status but
no cost, worker identity, payments or profit. Other finance tables return no rows
to INTAKE. Intake writes are allowlisted registration/quote RPCs, not broad table
UPDATE grants. Trigger checks validate all referenced IDs against the same
organization even inside privileged functions. The original financial guards,
allocation caps, row locks and idempotency behavior remain active.

The internal `prime_private` schema is not exposed through PostgREST. Do not add
it to exposed schemas. Internal functions have explicit execute grants; the
public schema disallows untrusted object creation. Definer functions have pinned
search paths (empty with qualified references, or `public, pg_temp` for the
existing typed workshop routines). Never grant untrusted CREATE on public or
private schemas. Normal business actions use the user's Supabase client, not
service-role credentials.

## Audit and Financial Corrections

Database triggers append organization, actor UUID, username/role snapshots, time,
event, entity/job/vehicle references, plate and allowlisted diffs. Customer contact
fields record a changed marker instead of duplicating PII. Financial events include
amount, allocation, date, target and relevant work/worker references. Security
events are server-only RPCs after Auth verification. No passwords, password hashes,
JWTs, cookies or keys enter the audit payload.

ADMIN can read/filter the journal but cannot insert, update or delete its rows
through the app credentials. UPDATE/DELETE triggers additionally protect history.
Audits have tenant/time, actor, action, entity, job, vehicle and plate indexes.
UI and exports use 50-row pages with matching filters and explicit page/total
counts. Each exported PDF/print corresponds to the visible filtered page; export
successive pages for longer histories. No unbounded audit payload is loaded in
the browser. Human-readable Azerbaijani descriptions are primary; raw event codes
remain available for investigation. Audit PDF/print uses A4 landscape, repeated
table headings and page numbers, with footer space reserved outside the content.
Keep financial audit history long term; no automatic purge runs.

Only ADMIN can void payments. A transaction remains in `cash_transactions` with
reason/time and an immutable `cash_reversals` row references it with the opposite
direction, amount, actor and reason. Repeated voids return the same reversal.
Existing reports/calculations continue excluding voided originals; do NOT also
subtract reversal amounts, which would double-count the correction. Both void and
reversal are audited. Clients cannot physically delete posted ledger entries or
rewrite their amounts. Database/project owners remain privileged operators and
must be separately controlled; application audit is not protection against a
database superuser rewriting backups or disabling triggers.

## Headers, Secrets and MFA

The app adds nosniff, strict-origin referrer policy, denied camera/microphone/
geolocation, DENY framing plus CSP `frame-ancestors`, `base-uri` and `object-src`.
Production enables one-year HSTS; serve production only through HTTPS. This is
not a full script CSP: a strict nonce-based policy needs separate Next.js/PDF
compatibility testing. Do not add `unsafe-inline` as a claimed CSP hardening fix.

The service-role key is used only in `lib/supabase/admin.ts` (server-only) and the
operator provisioning script. Never prefix it with `NEXT_PUBLIC_`, expose it via
API output, or add it to a client component. Keep all keys in the deployment
secret store. Public URL/anon keys are not authorization boundaries: RLS must work
when clients call the database directly. Rotate any actual secret found in Git,
logs or artifacts before deleting the leaked copy. Do not print it during review.

**App MFA is not enabled by this change.** The installed Supabase SDK supports
TOTP enrollment/challenge/verification and assurance levels. A follow-up rollout
must add enrollment QR, verified-factor management, sign-in challenge, recovery
and `aal2` enforcement on both server and RLS, with audited recovery and lockout
testing. Do not enable an MFA-required policy before a tested enrollment/recovery
flow exists. Strongly recommend MFA for ADMIN and CASHIER; INTAKE can be optional.
Enable MFA now for Supabase/GitHub/deployment administrator accounts independently
of application staff MFA.

## Backup and Recovery Policy

Owner: PRIME's appointed system administrator; name a second recovery operator.
Review backup success daily and document restore evidence monthly.

- Daily database backup, retain 7-14 days according to the plan and policy.
- Weekly encrypted off-platform copy, retain 4-8 weeks, separate credentials.
- Monthly restore test into an isolated project, never over the live database.
- Verify memberships, historical creators, row counts, payment/advance balances,
  reversals, audits, quotation Unicode, PDF/print and all three roles after restore.
- Define required recovery point/time with PRIME and alert on missed backups.
- Back up external assets/storage independently: a database dump is not a file backup.

Review Supabase **Database > Backups** and PITR settings/retention for the purchased
plan. Do not assume backups exist because the application is deployed. For an
optional operator-managed export, use a secure connection service/password file
with restricted filesystem permissions and run `pg_dump` in custom format. Keep
credentials out of command history and Git; encrypt the dump before off-platform
transfer. Include schema, RLS/functions, data, Auth and audit history, and retain
role/grant restoration instructions appropriate to Supabase. Test restores with
`pg_restore` in an isolated compatible environment; never use destructive clean
or reset flags against production. Preserve original backups until validated.

## Incident Response

Disable compromised non-admin accounts in `/security`, rotate their password,
and preserve audit/Auth logs. Revoke exposed service-role/deployment/database
secrets at the provider, replace secret-store values, and redeploy. A compromised
service role can bypass RLS: treat all affected data as potentially exposed.
Investigate actor/time/entity/amount references and Auth logs; do not erase the
evidence or fix finances by direct SQL deletion. Restore a copy for analysis,
reconcile balances, document the incident and notify the designated data owner.

## Exact Production Checklist

1. Confirm the original Auth UUID and single legacy owner; compare row counts and
   financial totals. Take and verify a restorable backup. Schedule maintenance.
2. Review and apply `supabase/migrations/0004_rbac_audit_security.sql` once. If it
   rejects ambiguous ownership, stop and review; never bypass by deleting rows.
3. Configure server-only `SUPABASE_SERVICE_ROLE_KEY` and existing public Supabase
   URL/anon key in the app deployment. Set `NEXT_PUBLIC_APP_URL` to the production
   HTTPS URL. Do not set a public service-key variable.
4. Run `node scripts/provision-prime-users.mjs` in the secured operator environment.
   Run again to confirm idempotency. Transfer newly generated credentials securely.
5. Disable public signup; verify Auth rate limits, password policy and WAF login
   throttling. Confirm production HTTPS, cookie handling and security headers.
6. Deploy the matching main commit. Until migration/provisioning/configuration are
   complete, new code intentionally fails closed instead of using legacy owner access.
7. Use three separate browser contexts; complete forced password change. Verify
   ADMIN all panels/audit/security, CASHIER only Kassa, INTAKE only vehicles/quote.
8. INTAKE creates a card/work/part; ADMIN sees the same IDs and assigns work;
   CASHIER sees the same job, sets cost and pays. Check all actors in Audit.
9. Test direct disallowed URLs, PDF/print and forged server actions; test raw
   REST/RPC under each user plus a separate test organization. INTAKE must not read
   costs even with `select=*`; neither lower role can modify operational fields.
10. Test 200 AZN payment and ADMIN void: original + one reversal + audit remain.
    Disable CASHIER with a session already open and verify immediate denial.
11. Verify first-login/stale-session denial and admin reset delivery. Do not
    declare MFA active; complete the separate MFA enrollment/enforcement rollout.
12. Confirm daily/weekly backups, encryption, retention, recovery owner and restore
    test. Reopen staff access after evidence is recorded.

## Primary References

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database functions and execution security](https://supabase.com/docs/guides/database/functions)
- [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [Database backups](https://supabase.com/docs/guides/platform/backups)
- [Backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
