// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const admin = randomUUID(),
  cashier = randomUUID(),
  intake = randomUUID(),
  outsider = randomUUID();
let db: PGlite,
  org: string,
  otherOrg: string,
  job: string,
  work: string,
  part: string,
  worker: string,
  supplier: string,
  purchase: string,
  payment: string;
async function scalar<T = string>(sql: string, args: unknown[] = []) {
  return (await db.query<{ value: T }>(sql, args)).rows[0]?.value;
}
async function asUser(id: string) {
  await db.exec(`reset role; set app.uid='${id}'; set role authenticated;`);
}
const rpcJob = (key: string = randomUUID(), plate = "10-PR-030") =>
  scalar("select create_workshop_job($1,$2,$3,$4,$5) as value", [
    JSON.stringify({ plate, make: "BMW", model: "F30" }),
    JSON.stringify({ funding_source: "CUSTOMER_FUNDED", agreed_budget: 1400 }),
    JSON.stringify([{ catalogId: work, quotedPrice: 450, note: "Planned" }]),
    JSON.stringify([{ catalogId: part, quotedPrice: 950, note: "Required" }]),
    key,
  ]);
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${admin}'),('${cashier}'),('${intake}'),('${outsider}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('iat',coalesce(nullif(current_setting('app.jwt_iat',true),'')::bigint,extract(epoch from now())::bigint))$$;
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public,auth to authenticated,anon,service_role;
    set app.uid='${admin}';`);
  for (const file of [
    "0001_prime_flow_schema.sql",
    "0002_workshop_finance.sql",
    "0003_worker_advances.sql",
  ]) {
    await db.exec(
      readFileSync(`supabase/migrations/${file}`, "utf8").replace(
        'create extension if not exists "pgcrypto";',
        "",
      ),
    );
    if (file.startsWith("0001")) {
      await db.exec(readFileSync("supabase/seed.sql", "utf8"));
      await db.exec(
        `insert into vehicles(owner_user_id,plate,make,model) values('${admin}','10-AA-001','Legacy','Car');`,
      );
      await db.exec(`insert into service_jobs(owner_user_id,vehicle_id,job_no,agreed_budget) select '${admin}',id,'LEGACY',1000 from vehicles;
        insert into suppliers(owner_user_id,entity_type,company_name) values('${admin}','LEGAL_ENTITY','Legacy supplier');
        insert into purchases(owner_user_id,service_job_id,custom_item_name,quantity,unit_price,supplier_id,payment_status,paid_amount)
        select '${admin}',j.id,'Historical part',1,500,s.id,'PARTIAL',200 from service_jobs j cross join suppliers s;`);
    }
  }
  await db.exec(
    readFileSync("supabase/migrations/0004_rbac_audit_security.sql", "utf8"),
  );
  org = await scalar(
    "select id as value from organizations where slug='prime'",
  );
  otherOrg = await scalar(
    "insert into organizations(name,slug) values('Other','other') returning id as value",
  );
  await db.exec(`update user_profiles set must_change_password=false where auth_user_id='${admin}';
    insert into user_profiles(auth_user_id,organization_id,username,display_name,role,must_change_password) values
    ('${cashier}','${org}','kassa','Kassir','CASHIER',false),('${intake}','${org}','qeydiyyat','Intake','INTAKE',false),('${outsider}','${otherOrg}','other','Other','ADMIN',false);`);
}, 60000);
afterAll(async () => {
  await db?.close();
});

describe.sequential(
  "organization RBAC and immutable audit in PostgreSQL",
  () => {
    it("preserves legacy rows and creator, bootstraps the original admin", async () => {
      expect(
        await scalar(
          "select owner_user_id as value from vehicles where plate='10-AA-001'",
        ),
      ).toBe(admin);
      expect(
        await scalar(
          "select organization_id as value from vehicles where plate='10-AA-001'",
        ),
      ).toBe(org);
      expect(
        await scalar(
          "select username as value from user_profiles where auth_user_id=$1",
          [admin],
        ),
      ).toBe("admin");
      expect(
        Number(
          await scalar("select sum(amount) as value from cash_transactions"),
        ),
      ).toBe(200);
      expect(
        Number(await scalar("select sum(paid_amount) as value from purchases")),
      ).toBe(200);
    });
    it("intake creates shared catalogs, vehicle, quoted work and part atomically", async () => {
      await asUser(intake);
      work = (
        await scalar<{ id: string }>(
          "select create_catalog_entry('work','Geometry') as value",
        )
      ).id;
      part = (
        await scalar<{ id: string }>(
          "select create_catalog_entry('part','Right wing') as value",
        )
      ).id;
      job = await rpcJob();
      expect(await rpcJob(job)).toBe(job);
      expect(
        await scalar(
          "select count(*)::int as value from service_jobs where id=$1",
          [job],
        ),
      ).toBe(1);
      const safe = await scalar<Record<string, unknown>>(
        "select intake_work_items($1) as value",
        [job],
      );
      expect(safe.quoted_price).toBe(450);
      expect(safe).not.toHaveProperty("labor_cost");
      expect(safe).not.toHaveProperty("workers");
      for (const table of [
        "job_work_items",
        "purchases",
        "workers",
        "suppliers",
        "cash_transactions",
        "audit_logs",
      ]) {
        expect(
          await scalar(`select count(*)::int as value from ${table}`),
        ).toBe(0);
      }
    });
    it("intake cannot bypass column, role, profile or financial permissions", async () => {
      await expect(
        scalar("select create_catalog_entry('role','Admin role') as value"),
      ).rejects.toThrow();
      await expect(
        db.exec(
          "update user_profiles set role='ADMIN' where username='qeydiyyat'",
        ),
      ).rejects.toThrow();
      await expect(
        scalar(
          "select update_vehicle_intake($1,'{}','{\"status\":\"DELIVERED\"}') as value",
          [job],
        ),
      ).rejects.toThrow();
      await expect(
        scalar(
          "select record_cash_payment($1,'CUSTOMER_BUDGET',null,200,current_date,null,$2) as value",
          [job, randomUUID()],
        ),
      ).rejects.toThrow();
      await expect(
        scalar("select set_worker_cost($1,1) as value", [randomUUID()]),
      ).rejects.toThrow();
      await expect(
        db.exec(
          `insert into workers(owner_user_id,first_name,last_name,role_id) values('${intake}','Bad','Actor','${randomUUID()}')`,
        ),
      ).rejects.toThrow();
      await expect(
        scalar("select save_workshop_purchase('{}',$1) as value", [
          randomUUID(),
        ]),
      ).rejects.toThrow();
      await db.query("update service_jobs set archived_at=now() where id=$1", [
        job,
      ]);
      expect(
        await scalar(
          "select archived_at as value from service_jobs where id=$1",
          [job],
        ),
      ).toBeNull();
    });
    it("intake updates safe fields and quotations, without changing original creator", async () => {
      await scalar(
        'select update_vehicle_intake($1,\'{"color":"Black"}\',\'{"customer_name":"Customer"}\') as value',
        [job],
      );
      await scalar(
        "select save_quote_line($1,'work',$2,450,'Updated quote') as value",
        [job, work],
      );
      await asUser(admin);
      expect(
        await scalar(
          "select customer_name as value from service_jobs where id=$1",
          [job],
        ),
      ).toBe("Customer");
      expect(
        await scalar(
          "select owner_user_id as value from service_jobs where id=$1",
          [job],
        ),
      ).toBe(intake);
      const role = (
        await scalar<{ id: string }>(
          "select create_catalog_entry('role','Technician') as value",
        )
      ).id;
      worker = await scalar(
        "insert into workers(owner_user_id,first_name,last_name,role_id) values($1,'Rauf','Aliyev',$2) returning id as value",
        [admin, role],
      );
      const workId = await scalar(
        "select id as value from job_work_items where service_job_id=$1",
        [job],
      );
      work = workId;
      part = await scalar(
        "select id as value from job_required_parts where service_job_id=$1",
        [job],
      );
      await db.query(
        "update job_work_items set assigned_worker_id=$1,status='IN_PROGRESS' where id=$2",
        [worker, work],
      );
      supplier = await scalar(
        "insert into suppliers(owner_user_id,entity_type,company_name) values($1,'LEGAL_ENTITY','Parts') returning id as value",
        [admin],
      );
      purchase = await scalar("select save_workshop_purchase($1,$2) as value", [
        JSON.stringify({
          service_job_id: job,
          required_part_id: part,
          quantity: 1,
          unit_price: 500,
          source_type: "SUPPLIER",
          supplier_id: supplier,
          purchased_by_admin: true,
          payment_status: "UNPAID",
          paid_amount: 0,
          purchase_date: "2026-09-21",
        }),
        randomUUID(),
      ]);
    });
    it("cashier reads the SAME job, sets cost and records three payment types", async () => {
      await asUser(cashier);
      expect(
        await scalar(
          "select owner_user_id as value from service_jobs where id=$1",
          [job],
        ),
      ).toBe(intake);
      await scalar("select set_worker_cost($1,300) as value", [work]);
      payment = await scalar(
        "select record_cash_payment($1,'CUSTOMER_WORK',$2,200,current_date,null,$3) as value",
        [job, work, randomUUID()],
      );
      await scalar(
        "select record_cash_payment($1,'WORKER_WORK_ITEM',$2,100,current_date,null,$3) as value",
        [job, work, randomUUID()],
      );
      await scalar(
        "select record_cash_payment($1,'SUPPLIER_PURCHASE',$2,100,current_date,null,$3) as value",
        [job, purchase, randomUUID()],
      );
      expect(
        Number(
          await scalar(
            "select paid_amount as value from purchases where id=$1",
            [purchase],
          ),
        ),
      ).toBe(100);
      await expect(
        scalar("select void_cash_payment($1,'Bad') as value", [payment]),
      ).rejects.toThrow();
    });
    it("cashier cannot mutate operational data or forge a raw ledger entry", async () => {
      await expect(rpcJob()).rejects.toThrow();
      await expect(
        scalar("select create_catalog_entry('work','Bad') as value"),
      ).rejects.toThrow();
      await db.query(
        "update job_work_items set status='DONE',quoted_price=1 where id=$1",
        [work],
      );
      expect(
        await scalar("select status as value from job_work_items where id=$1", [
          work,
        ]),
      ).toBe("IN_PROGRESS");
      await expect(
        db.query(
          "insert into cash_transactions(owner_user_id,service_job_id,allocation_type,work_item_id,amount,idempotency_key) values($1,$2,'CUSTOMER_WORK',$3,1,$4)",
          [cashier, job, work, randomUUID()],
        ),
      ).rejects.toThrow();
      await expect(
        db.query("delete from cash_transactions where id=$1", [payment]),
      ).rejects.toThrow();
      expect(
        await scalar("select count(*)::int as value from audit_logs"),
      ).toBe(0);
    });
    it("admin void preserves original and one immutable opposite-direction reversal", async () => {
      await asUser(admin);
      const reversal = await scalar(
        "select void_cash_payment($1,'Correction') as value",
        [payment],
      );
      expect(
        await scalar("select void_cash_payment($1,'Correction') as value", [
          payment,
        ]),
      ).toBe(reversal);
      expect(
        await scalar(
          "select void_reason as value from cash_transactions where id=$1",
          [payment],
        ),
      ).toBe("Correction");
      expect(
        await scalar(
          "select direction as value from cash_reversals where id=$1",
          [reversal],
        ),
      ).toBe("OUT");
      expect(
        await scalar(
          "select count(*)::int as value from cash_reversals where transaction_id=$1",
          [payment],
        ),
      ).toBe(1);
      for (const table of [
        "audit_logs",
        "cash_transactions",
        "cash_reversals",
      ]) {
        await expect(db.exec(`delete from ${table}`)).rejects.toThrow();
      }
      await expect(
        db.exec("update audit_logs set summary='Forgery'"),
      ).rejects.toThrow();
    });
    it("audit attributes real intake, admin and cashier actors with amount/reference and no PII copies", async () => {
      expect(
        await scalar(
          "select actor_username_snapshot as value from audit_logs where action='VEHICLE_CREATED' and plate='10-PR-030'",
        ),
      ).toBe("qeydiyyat");
      expect(
        await scalar(
          "select actor_username_snapshot as value from audit_logs where action='WORK_STATUS_CHANGED' and service_job_id=$1 limit 1",
          [job],
        ),
      ).toBe("admin");
      const event = await scalar<{
        actor_role_snapshot: string;
        metadata: { amount: number };
        changes: unknown;
      }>(
        "select to_jsonb(a) as value from audit_logs a where action='CUSTOMER_PAYMENT_CREATED' and entity_id=$1",
        [payment],
      );
      expect(event.actor_role_snapshot).toBe("CASHIER");
      expect(event.metadata.amount).toBe(200);
      expect(
        await scalar(
          "select count(*)::int as value from audit_logs where action='PAYMENT_REVERSED' and service_job_id=$1",
          [job],
        ),
      ).toBe(1);
      expect(JSON.stringify(event)).not.toMatch(/password|token|Customer/);
    });
    it("another organization cannot read or link PRIME IDs, including definer RPCs", async () => {
      await asUser(outsider);
      expect(
        await scalar("select count(*)::int as value from service_jobs"),
      ).toBe(0);
      await expect(
        scalar("select set_worker_cost($1,1) as value", [work]),
      ).rejects.toThrow();
      await expect(
        scalar("select void_cash_payment($1,'Bad') as value", [payment]),
      ).rejects.toThrow();
      await expect(
        scalar("select update_vehicle_intake($1,'{}','{}') as value", [job]),
      ).rejects.toThrow();
      await expect(
        scalar(
          "select record_cash_payment($1,'CUSTOMER_WORK',$2,1,current_date,null,$3) as value",
          [job, work, randomUUID()],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          "insert into job_work_items(owner_user_id,service_job_id,work_catalog_id,quoted_price) values($1,$2,$3,1)",
          [outsider, job, randomUUID()],
        ),
      ).rejects.toThrow();
      expect(
        await scalar("select count(*)::int as value from audit_logs"),
      ).toBe(0);
    });
    it("disabled and force-change accounts lose database access with existing sessions", async () => {
      await db.exec(
        `reset role; update user_profiles set is_active=false where auth_user_id='${cashier}';`,
      );
      await asUser(cashier);
      expect(
        await scalar("select count(*)::int as value from service_jobs"),
      ).toBe(0);
      await expect(
        scalar("select set_worker_cost($1,1) as value", [work]),
      ).rejects.toThrow();
      await db.exec(
        `reset role; update user_profiles set must_change_password=true where auth_user_id='${intake}';`,
      );
      await asUser(intake);
      expect(
        await scalar("select count(*)::int as value from service_jobs"),
      ).toBe(0);
      await expect(
        scalar("select intake_work_items($1) as value", [job]),
      ).rejects.toThrow();
      expect(
        (
          await scalar<{ must_change_password: boolean }>(
            "select get_access_profile() as value",
          )
        ).must_change_password,
      ).toBe(true);
    });
    it("security RPCs cannot be forged by authenticated users, admin cannot be disabled", async () => {
      await asUser(admin);
      await expect(
        scalar("select record_security_event($1,'PASSWORD_CHANGED') as value", [
          intake,
        ]),
      ).rejects.toThrow();
      await expect(
        scalar("select manage_staff_account($1,$2,'enable') as value", [
          admin,
          cashier,
        ]),
      ).rejects.toThrow();
      await db.exec("reset role; set role service_role;");
      await expect(
        scalar("select manage_staff_account($1,$1,'disable') as value", [
          admin,
        ]),
      ).rejects.toThrow();
      await scalar("select manage_staff_account($1,$2,'enable') as value", [
        admin,
        cashier,
      ]);
      await scalar("select manage_staff_account($1,$2,'reset') as value", [
        admin,
        cashier,
      ]);
      await db.exec("reset role;");
      expect(
        await scalar(
          "select must_change_password as value from user_profiles where auth_user_id=$1",
          [cashier],
        ),
      ).toBe(true);
      expect(
        await scalar(
          "select actor_username_snapshot as value from audit_logs where action='PASSWORD_RESET_REQUESTED' limit 1",
        ),
      ).toBe("admin");
      await expect(db.exec("delete from audit_logs")).rejects.toThrow();
    });
    it("old JWT issue times cannot outlive a password change", async () => {
      await db.exec(
        `reset role; update user_profiles set must_change_password=false,session_not_before=now()-interval '1 hour' where auth_user_id='${cashier}'; set app.jwt_iat='1';`,
      );
      await asUser(cashier);
      expect(
        (
          await scalar<{ session_valid: boolean }>(
            "select get_access_profile() as value",
          )
        ).session_valid,
      ).toBe(false);
      expect(
        await scalar("select count(*)::int as value from cash_transactions"),
      ).toBe(0);
      await expect(
        scalar("select set_worker_cost($1,1) as value", [work]),
      ).rejects.toThrow();
      await db.exec("reset role; set app.jwt_iat='';");
    });
  },
);
