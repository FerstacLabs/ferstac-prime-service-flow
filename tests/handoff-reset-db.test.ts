// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

let db: PGlite, org: string;
const admin = randomUUID(), cashier = randomUUID(), intake = randomUUID(), other = randomUUID();
const inventory = readFileSync("scripts/production-handoff-inventory.sql", "utf8");
type Snapshot = { reviewed_inventory: string; preserved_fingerprint: string; counts: Record<string, number> };
async function snapshot() {
  await db.exec(`begin; set local prime.handoff_org='${org}'; ${inventory}`);
  const result = (await db.query<{ v: Snapshot }>("select current_setting('prime.handoff_inventory')::jsonb v")).rows[0].v;
  await db.exec("commit");
  return result;
}
function sqlFile(name: string, variables: Record<string, string>): string {
  return readFileSync(`scripts/${name}`, "utf8")
    .replace(/^\\ir (.+)$/gm, (_, file) => sqlFile(file.trim(), variables))
    .replace(/^\\set .+$/gm, "")
    .replace(/\\gset\s*$/gm, ";")
    .replace(/:'([a-z_]+)'/g, (_, key) => {
      if (!(key in variables)) throw new Error(`Missing variable ${key}`);
      return `'${variables[key].replaceAll("'", "''")}'`;
    });
}
function reset(s: Snapshot, overrides: Record<string, string> = {}) {
  return sqlFile("production-handoff-reset.sql", {
    org, approval: `RESET BUSINESS DATA ${org}`, backup_verified: "yes", writes_stopped: "yes",
    expected_database: "postgres", reviewed_inventory: s.reviewed_inventory,
    admin_id: admin, cashier_id: cashier, intake_id: intake, ...overrides,
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key, encrypted_password text);
    insert into auth.users values('${admin}','untouched-admin'),('${cashier}','untouched-cashier'),('${intake}','untouched-intake');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('iat',extract(epoch from now())::bigint)$$;
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public,auth to authenticated,anon,service_role; set app.uid='${admin}';
    set prime.bootstrap_admin_id='${admin}';
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.buckets enable row level security; alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,service_role; grant select on storage.objects to authenticated;`);
  for (const file of readdirSync("supabase/migrations").sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8").replace('create extension if not exists "pgcrypto";', ""));
    if (file.startsWith("0001")) await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  }
  org = (await db.query<{ id: string }>("select id from organizations where slug='prime'")).rows[0].id;
  await db.exec(`update user_profiles set must_change_password=false;
    insert into user_profiles(auth_user_id,organization_id,username,display_name,role,must_change_password)
    values('${cashier}','${org}','kassa','Cashier','CASHIER',false),('${intake}','${org}','intake','Intake','INTAKE',false);
    insert into organizations(id,name,slug) values('${other}','Other tenant','other');
    insert into vehicles(owner_user_id,organization_id,plate,make,model) values('${admin}','${org}','10-QA-001','QA','A');
    insert into vehicles(owner_user_id,organization_id,plate,make,model) values('${admin}','${other}','10-QA-002','QA','B');`);
}, 30000);
afterAll(async () => { await db?.close(); });

it("preview executes read-only and exposes no credentials", async () => {
  const before = await snapshot();
  const results = await db.exec(sqlFile("production-handoff-preview.sql", { org }));
  expect(JSON.stringify(results)).not.toContain("untouched-admin");
  expect(await snapshot()).toEqual(before);
});
it("refuses absent approval and wrong role identities without changes", async () => {
  const before = await snapshot();
  const cases: Record<string, string>[] = [{ approval: "no" }, { cashier_id: intake }, { backup_verified: "no" }];
  for (const overrides of cases) {
    await expect(db.exec(reset(before, overrides))).rejects.toThrow();
    await db.exec("rollback");
    expect(await snapshot()).toEqual(before);
  }
});
it("rejects stale inventories", async () => {
  const before = await snapshot();
  await expect(db.exec(reset(before, { reviewed_inventory: "stale" }))).rejects.toThrow(/Inventory changed/);
  await db.exec("rollback");
  expect(await snapshot()).toEqual(before);
});
it("fails closed on unclassified business tables", async () => {
  await db.exec("begin; create table public.future_business(id uuid);");
  await expect(db.exec(`set local prime.handoff_org='${org}'; ${inventory}`)).rejects.toThrow(/Schema coverage/);
  await db.exec("rollback");
});
it("detects cross-tenant references before cascading can touch another tenant", async () => {
  const before = await snapshot();
  // Fixture deliberately bypasses the application relation trigger, NOT foreign keys.
  await db.exec(`begin; alter table service_jobs disable trigger user;
    insert into service_jobs(owner_user_id,organization_id,vehicle_id,job_no,funding_source)
    select '${admin}','${other}',id,'CROSS-ORG','CUSTOMER_FUNDED' from vehicles where organization_id='${org}';
    alter table service_jobs enable trigger user; commit;`);
  const cross = await snapshot();
  await expect(db.exec(reset(cross))).rejects.toThrow(/Cross-organization/);
  await db.exec("rollback");
  expect(await snapshot()).toEqual(cross);
  await db.exec(`delete from service_jobs where job_no='CROSS-ORG';`);
  expect((await snapshot()).counts.vehicles).toBe(before.counts.vehicles);
});
it("rolls back ALL deletes and trigger changes after a forced late failure", async () => {
  const before = await snapshot();
  const injected = reset(before).replace("delete from public.audit_logs where organization_id=org;",
    "delete from public.audit_logs where organization_id=org; raise exception 'forced late failure';");
  await expect(db.exec(injected)).rejects.toThrow(/forced late failure/);
  await db.exec("rollback");
  expect(await snapshot()).toEqual(before);
});
it("clears business rows, preserves auth/masters/other tenant/infrastructure and verifies zero sources", async () => {
  const before = await snapshot();
  await db.exec(reset(before));
  const after = await snapshot();
  expect(after.preserved_fingerprint).toBe(before.preserved_fingerprint);
  for (const [table, count] of Object.entries(after.counts)) {
    if (!["organizations", "user_profiles", "unit_catalog", "transaction_categories", "master_identities"].includes(table)) expect(count, table).toBe(0);
  }
  expect(after.counts.unit_catalog).toBeGreaterThan(0);
  expect(after.counts.transaction_categories).toBeGreaterThan(0);
  await db.exec(sqlFile("production-handoff-verify.sql", { org, preserved_fingerprint: before.preserved_fingerprint }));
});
it("verification refuses remaining signed Storage metadata", async () => {
  const before = await snapshot();
  await db.exec(`begin; insert into storage.objects(bucket_id,name) values('prime-reconciliations','${org}/remaining.pdf'); commit;`);
  await expect(db.exec(sqlFile("production-handoff-verify.sql", { org, preserved_fingerprint: before.preserved_fingerprint }))).rejects.toThrow(/Storage objects remain/);
  await db.exec("rollback");
});
