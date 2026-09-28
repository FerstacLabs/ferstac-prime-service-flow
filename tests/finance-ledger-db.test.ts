// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
let db: PGlite;
const admin = randomUUID(),
  cashier = randomUUID(),
  intake = randomUUID(),
  other = randomUUID();
let org: string,
  job: string,
  work: string,
  purchase: string,
  supplier: string,
  worker: string,
  account: string,
  category: string;
let legacyPayment: string;
async function value<T = string>(sql: string, args: unknown[] = []) {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
async function user(id: string) {
  await db.exec(`reset role;set app.uid='${id}';set role authenticated;`);
}
const post = (data: Record<string, unknown>, key = randomUUID()) =>
  value("select record_financial_transaction($1,$2) v", [
    JSON.stringify({ channel: "CASH", purpose: "QA", ...data }),
    key,
  ]);
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${admin}'),('${cashier}'),('${intake}'),('${other}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('iat',extract(epoch from now())::bigint)$$;
 create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to authenticated,anon,service_role;set app.uid='${admin}';`);
  for (const file of readdirSync("supabase/migrations").sort()) {
    if (file.startsWith("0007")) break;
    await db.exec(
      readFileSync("supabase/migrations/" + file, "utf8").replace(
        'create extension if not exists "pgcrypto";',
        "",
      ),
    );
    if (file.startsWith("0001")) {
      await db.exec(readFileSync("supabase/seed.sql", "utf8"));
      await db.exec(
        `insert into vehicles(owner_user_id,plate,make,model) values('${admin}','10-AB-123','BMW','F30');`,
      );
    }
  }
  org = await value("select id v from organizations where slug='prime'");
  await db.exec(`update user_profiles set must_change_password=false;insert into user_profiles(auth_user_id,organization_id,username,display_name,role,must_change_password) values('${cashier}','${org}','kassa','Cashier','CASHIER',false),('${intake}','${org}','intake','Intake','INTAKE',false);
 insert into organizations(name,slug) values('Other','other');insert into user_profiles(auth_user_id,organization_id,username,display_name,role,must_change_password) select '${other}',id,'other','Other','ADMIN',false from organizations where slug='other';`);
  await user(admin);
  const legacyJob = await value(
    "insert into service_jobs(owner_user_id,vehicle_id,job_no,funding_source,agreed_budget) select auth.uid(),id,'LEGACY-001','CUSTOMER_FUNDED',100 from vehicles limit 1 returning id v",
  );
  legacyPayment = await value(
    "select record_cash_payment($1,'CUSTOMER_BUDGET',null,25.50,current_date,null,$2) v",
    [legacyJob, randomUUID()],
  );
  await db.exec("reset role");
  await db.exec(
    readFileSync(
      "supabase/migrations/0007_finance_cash_bank_ledger.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync("supabase/migrations/0008_operational_work_queue.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/0009_master_data_and_workflow_refinements.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/0010_worker_compensation_audit_and_ledger_refinements.sql",
      "utf8",
    ),
  );
  await user(admin);
  const wc = (
    await value<{ id: string }>(
      "select create_catalog_entry('work','QA work') v",
    )
  ).id;
  const pc = (
    await value<{ id: string }>(
      "select create_catalog_entry('part','QA part') v",
    )
  ).id;
  const unit = await value(
    "select id v from unit_catalog where name='Ədəd' limit 1",
  );
  job = await value("select create_workshop_job($1,$2,$3,$4,$5) v", [
    JSON.stringify({ plate: "99-FN-707", make: "BMW", model: "F30" }),
    JSON.stringify({
      funding_source: "CUSTOMER_FUNDED",
      customer_name: "Customer",
    }),
    JSON.stringify([
      { catalogId: wc, quotedPrice: "800.75", quantity: 1, unitId: unit },
    ]),
    JSON.stringify([
      { catalogId: pc, quotedPrice: "1200", quantity: 1, unitId: unit },
    ]),
    randomUUID(),
  ]);
  work = await value(
    "select id v from job_work_items where service_job_id=$1",
    [job],
  );
  worker = await value(
    "insert into workers(owner_user_id,first_name,last_name,role_id) select auth.uid(),'Rauf','QA',id from worker_roles limit 1 returning id v",
  );
  supplier = await value(
    "insert into suppliers(owner_user_id,entity_type,company_name) values(auth.uid(),'LEGAL_ENTITY','Permanent history supplier') returning id v",
  );
  const part = await value(
    "select id v from job_required_parts where service_job_id=$1",
    [job],
  );
  purchase = await value("select save_workshop_purchase($1,$2) v", [
    JSON.stringify({
      service_job_id: job,
      required_part_id: part,
      quantity: 1,
      unit_price: 700,
      source_type: "SUPPLIER",
      supplier_id: supplier,
      purchased_by_admin: true,
      payment_status: "UNPAID",
      purchase_date: "2026-09-25",
    }),
    randomUUID(),
  ]);
  await value("select set_work_costing($1,$2,500) v", [work, worker]);
  account = await value("select save_financial_master('account',$1) v", [
    JSON.stringify({ name: "QA Bank", bank_name: "Bank", iban: "AZTEST" }),
  ]);
  category = await value(
    "select id v from transaction_categories where name='Bank komissiyası' and organization_id=$1",
    [org],
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});

describe("0010 traceability and catalog revisions", () => {
  it("records exact notes/name/date changes, excludes unchanged fields and secrets", async () => {
    await user(admin);
    await db.query(
      "update service_jobs set customer_name='Updated customer',notes='Specific note',received_at='2026-09-28' where id=$1",
      [job],
    );
    const changes = await value<
      Record<string, { before: unknown; after: unknown }>
    >(
      "select changes v from audit_logs where entity_id=$1 and action='SERVICE_JOB_UPDATED' order by created_at desc,id desc limit 1",
      [job],
    );
    expect(changes.customer_name).toEqual({
      before: "Customer",
      after: "Updated customer",
    });
    expect(changes.notes.after).toBe("Specific note");
    expect(changes.received_at.after).toContain("2026-09-28");
    expect(changes.funding_source).toBeUndefined();
    await db.exec("reset role");
    const safe = await value(
      'select prime_private.business_diff(\'{"token":"old","notes":null}\', \'{"token":"secret","password":"secret","notes":"new"}\') v',
    );
    expect(safe).toEqual({ notes: { before: null, after: "new" } });
    await user(admin);
  });
  it("renames future catalog choices without changing existing work, part or unit labels", async () => {
    for (const kind of ["work", "part", "unit"]) {
      const id = await value(
        kind === "work"
          ? "select work_catalog_id v from job_work_items where id=$1"
          : kind === "part"
            ? "select part_catalog_id v from purchases where id=$1"
            : "select unit_id v from job_work_items where id=$1",
        [kind === "part" ? purchase : work],
      );
      const oldName = await value(
        `select name v from ${kind}_catalog where id=$1`,
        [id],
      );
      const newId = await value("select manage_catalog($1,$2,'rename',$3) v", [
        kind,
        id,
        `New ${kind} revision`,
      ]);
      expect(newId).not.toBe(id);
      expect(
        await value(`select name v from ${kind}_catalog where id=$1`, [id]),
      ).toBe(oldName);
      expect(
        await value(
          `select ${kind === "unit" ? "is_active" : "active"} v from ${kind}_catalog where id=$1`,
          [id],
        ),
      ).toBe(false);
      await expect(
        value("select manage_catalog($1,$2,'delete',null,'','SİL') v", [
          kind,
          id,
        ]),
      ).rejects.toThrow(/tarixçədə/);
      await value("select manage_catalog($1,$2,'restore') v", [kind, id]);
      await value("select manage_catalog($1,$2,'delete',null,'','SİL') v", [
        kind,
        newId,
      ]);
      await expect(
        db.query(
          `update ${kind}_catalog set name='Rewrite history' where id=$1`,
          [id],
        ),
      ).rejects.toThrow(kind === "unit" ? /permission denied/ : /kataloqları/);
    }
  });
  it("denies global catalog mutation to INTAKE/CASHIER and inline restoration to INTAKE", async () => {
    const id = (
      await value<{ id: string }>(
        "select create_catalog_entry('work','Archived revision') v",
      )
    ).id;
    await value("select manage_catalog('work',$1,'archive') v", [id]);
    for (const actor of [intake, cashier, other]) {
      await user(actor);
      await expect(
        value("select manage_catalog('work',$1,'rename','Forbidden') v", [id]),
      ).rejects.toThrow();
    }
    await user(intake);
    await expect(
      value("select create_catalog_entry('work','Archived revision') v"),
    ).rejects.toThrow(/arxivdədir/);
    expect(
      (
        await value<{ id: string }>(
          "select create_catalog_entry('work','New intake catalog') v",
        )
      ).id,
    ).toBeTruthy();
    await user(admin);
  });
  it("rejects duplicate additional purchase with a domain message and no partial inserts", async () => {
    const catalog = await value(
      "select part_catalog_id v from purchases where id=$1",
      [purchase],
    );
    const count = await value("select count(*)::int v from purchases");
    await expect(
      value("select save_workshop_purchase($1,$2) v", [
        JSON.stringify({
          service_job_id: job,
          part_catalog_id: catalog,
          additional: true,
        }),
        randomUUID(),
      ]),
    ).rejects.toThrow(/Bu detal bu servis kartında artıq mövcuddur/);
    expect(await value("select count(*)::int v from purchases")).toBe(count);
  });
  it("closes unfinished additional work atomically for CASHIER without inventing payments", async () => {
    await db.exec("begin");
    const catalog = (
      await value<{ id: string }>(
        "select create_catalog_entry('work','Close workflow QA') v",
      )
    ).id;
    const unit = await value(
      "select id v from unit_catalog where is_active limit 1",
    );
    const initialCatalog = (
      await value<{ id: string }>(
        "select create_catalog_entry('work','Initial close QA') v",
      )
    ).id;
    const jid = await value("select create_workshop_job($1,$2,$3,'[]',$4) v", [
      JSON.stringify({ plate: "99-CL-010", make: "BMW", model: "X5" }),
      JSON.stringify({
        funding_source: "CUSTOMER_FUNDED",
        customer_name: "Close QA",
      }),
      JSON.stringify([
        {
          catalogId: initialCatalog,
          quotedPrice: 0,
          quantity: 1,
          unitId: unit,
        },
      ]),
      randomUUID(),
    ]);
    const initialWork = await value(
      "select id v from job_work_items where service_job_id=$1",
      [jid],
    );
    await value("select set_work_costing($1,$2,0) v", [initialWork, worker]);
    const wid = await value("select create_additional_work($1,$2) v", [
      JSON.stringify({
        service_job_id: jid,
        catalog_id: catalog,
        quantity: 1,
        unit_id: unit,
        customer_unit_price: 100,
        worker_id: worker,
        labor_cost: 0,
      }),
      randomUUID(),
    ]);
    await user(cashier);
    await db.exec("savepoint rejected_close");
    await expect(
      value("select set_vehicle_financial_state($1,true) v", [jid]),
    ).rejects.toThrow(/borcu/);
    await db.exec("rollback to savepoint rejected_close");
    await user(admin);
    expect(
      await value("select status v from job_work_items where id=$1", [wid]),
    ).toBe("IN_PROGRESS");
    expect(
      await value("select completed_at v from job_work_items where id=$1", [
        wid,
      ]),
    ).toBeNull();
    await user(cashier);
    await post({
      allocation_type: "CUSTOMER_VEHICLE",
      service_job_id: jid,
      amount: 100,
    });
    await value("select set_vehicle_financial_state($1,true) v", [jid]);
    await value("select set_vehicle_financial_state($1,true) v", [jid]);
    await user(admin);
    expect(
      await value("select status v from job_work_items where id=$1", [wid]),
    ).toBe("DONE");
    expect(
      await value(
        "select completed_at is not null v from job_work_items where id=$1",
        [wid],
      ),
    ).toBe(true);
    expect(
      await value("select status v from service_jobs where id=$1", [jid]),
    ).toBe("READY");
    expect(
      await value(
        "select count(*)::int v from cash_transactions where service_job_id=$1 and direction='OUT'",
        [jid],
      ),
    ).toBe(0);
    expect(
      await value(
        "select count(*)::int v from audit_logs where entity_id=$1 and action='VEHICLE_WORK_COMPLETED'",
        [jid],
      ),
    ).toBe(1);
    await db.exec("rollback");
  });
});

describe("0010 percentage compensation", () => {
  let percentageWorker: string,
    percentageJob: string,
    percentageWork: string,
    percentageCatalog: string,
    percentageUnit: string;
  const policy = (percent: number, eligible = true) =>
    value("select save_worker_compensation_policy($1,$2,$3) v", [
      percentageWorker,
      eligible,
      percent,
    ]);
  it("defaults existing work to FIXED and restricts policies to ADMIN", async () => {
    await user(admin);
    expect(
      await value(
        "select compensation_mode v from job_work_items where id=$1",
        [work],
      ),
    ).toBe("FIXED");
    percentageWorker = await value(
      "insert into workers(owner_user_id,first_name,last_name,role_id) select auth.uid(),'Percentage','QA',id from worker_roles limit 1 returning id v",
    );
    for (const actor of [intake, cashier, other]) {
      await user(actor);
      await expect(policy(60)).rejects.toThrow();
    }
    await user(admin);
    for (const percent of [0, 100, -1, 60.001])
      await expect(policy(percent)).rejects.toThrow(/Usta payı/);
    await policy(60);
    percentageCatalog = (
      await value<{ id: string }>(
        "select create_catalog_entry('work','Percentage QA work') v",
      )
    ).id;
    percentageUnit = await value(
      "select id v from unit_catalog where is_active limit 1",
    );
    percentageJob = await value(
      "select create_workshop_job($1,$2,$3,'[]',$4) v",
      [
        JSON.stringify({ plate: "99-PC-010", make: "BMW", model: "X5" }),
        JSON.stringify({
          funding_source: "CUSTOMER_FUNDED",
          customer_name: "Percentage QA",
        }),
        JSON.stringify([
          {
            catalogId: percentageCatalog,
            quotedPrice: 1000,
            quantity: 1,
            unitId: percentageUnit,
          },
        ]),
        randomUUID(),
      ],
    );
    percentageWork = await value(
      "select id v from job_work_items where service_job_id=$1",
      [percentageJob],
    );
  });
  it("lets INTAKE choose percentage mode without receiving percentages or money", async () => {
    await user(intake);
    await value(
      "select update_work_assignment($1,$2,'IN_PROGRESS',null,true) v",
      [percentageWork, percentageWorker],
    );
    const queue = await value<Record<string, unknown>>(
      "select r v from work_queue_data('work') r where r->>'id'=$1",
      [percentageWork],
    );
    expect(queue.compensation_mode).toBe("PERCENTAGE");
    for (const key of [
      "worker_percentage_snapshot",
      "earning_snapshot",
      "labor_cost",
      "quoted_price",
      "customer_unit_price",
    ])
      expect(queue).not.toHaveProperty(key);
    const eligible = await value<Record<string, unknown>>(
      "select r v from work_queue_data('workers') r where r->>'id'=$1",
      [percentageWorker],
    );
    expect(eligible.percentage_eligible).toBe(true);
    expect(eligible).not.toHaveProperty("worker_percentage");
    expect(
      await value("select count(*)::int v from worker_compensation_policies"),
    ).toBe(0);
    await user(admin);
    expect(
      await value("select labor_cost::text v from job_work_items where id=$1", [
        percentageWork,
      ]),
    ).toBe("600.00");
  });
  it("keeps the assignment snapshot when worker defaults change", async () => {
    await policy(65);
    await value(
      "select update_work_assignment($1,$2,'IN_PROGRESS','Same agreement',true) v",
      [percentageWork, percentageWorker],
    );
    expect(
      await value(
        "select worker_percentage_snapshot::text v from job_work_items where id=$1",
        [percentageWork],
      ),
    ).toBe("60.00");
  });
  it("freezes earning once at DONE and never changes it on later price edits", async () => {
    await user(intake);
    await value("select update_work_assignment($1,$2,'DONE',null,true) v", [
      percentageWork,
      percentageWorker,
    ]);
    await user(admin);
    const frozen = await value<Record<string, unknown>>(
      "select jsonb_build_object('basis',earning_basis_snapshot,'earning',earning_snapshot,'at',earning_finalized_at) v from job_work_items where id=$1",
      [percentageWork],
    );
    expect(frozen.basis).toBe(1000);
    expect(frozen.earning).toBe(600);
    await value("select update_work_assignment($1,$2,'DONE',null,true) v", [
      percentageWork,
      percentageWorker,
    ]);
    await db.query(
      "update job_work_items set customer_unit_price=1200 where id=$1",
      [percentageWork],
    );
    const after = await value<Record<string, unknown>>(
      "select jsonb_build_object('basis',earning_basis_snapshot,'earning',earning_snapshot,'at',earning_finalized_at) v from job_work_items where id=$1",
      [percentageWork],
    );
    expect(after).toEqual(frozen);
    expect(
      await value("select labor_cost::text v from job_work_items where id=$1", [
        percentageWork,
      ]),
    ).toBe("600.00");
    await expect(
      value("select update_work_assignment($1,$2,'IN_PROGRESS',null,true) v", [
        percentageWork,
        percentageWorker,
      ]),
    ).rejects.toThrow(/sabitlənib/);
    await expect(
      value("select set_work_compensation($1,$2,false,500) v", [
        percentageWork,
        percentageWorker,
      ]),
    ).rejects.toThrow(/sabitlənib/);
  });
  it("exposes only the resulting cost and mode to CASHIER", async () => {
    await user(cashier);
    const projection = await value<Record<string, unknown>>(
      "select r v from finance_data('work',$1) r where r->>'id'=$2",
      [percentageJob, percentageWork],
    );
    expect(projection.labor_cost).toBe(600);
    expect(projection.compensation_mode).toBe("PERCENTAGE");
    for (const key of [
      "worker_percentage_snapshot",
      "earning_basis_snapshot",
      "quoted_price",
      "customer_unit_price",
    ])
      expect(projection).not.toHaveProperty(key);
    expect(
      await value("select count(*)::int v from worker_compensation_policies"),
    ).toBe(0);
    await user(admin);
  });
  it("supports percentage additional work with decimal rounding and one-time creation", async () => {
    const catalog = (
      await value<{ id: string }>(
        "select create_catalog_entry('work','Percentage additional QA') v",
      )
    ).id;
    const key = randomUUID();
    const payload = JSON.stringify({
      service_job_id: percentageJob,
      catalog_id: catalog,
      quantity: 0.333,
      unit_id: percentageUnit,
      customer_unit_price: 10.01,
      worker_id: percentageWorker,
      percentage: true,
    });
    const id = await value("select create_additional_work($1,$2) v", [
      payload,
      key,
    ]);
    expect(
      await value("select create_additional_work($1,$2) v", [payload, key]),
    ).toBe(id);
    await user(intake);
    await value("select update_work_assignment($1,$2,'DONE',null,true) v", [
      id,
      percentageWorker,
    ]);
    await user(admin);
    expect(
      await value(
        "select earning_basis_snapshot::text v from job_work_items where id=$1",
        [id],
      ),
    ).toBe("3.33");
    expect(
      await value(
        "select earning_snapshot::text v from job_work_items where id=$1",
        [id],
      ),
    ).toBe("2.16");
    expect(
      await value(
        "select worker_percentage_snapshot::text v from job_work_items where id=$1",
        [id],
      ),
    ).toBe("65.00");
  });
});

describe("0010 percentage financial close", () => {
  it("rolls back completion and earning on failure, then finalizes once on paid close", async () => {
    await user(admin);
    await db.exec("begin");
    try {
      await value("select save_worker_compensation_policy($1,true,60) v", [
        worker,
      ]);
      const catalog = (
        await value<{ id: string }>(
          "select create_catalog_entry('work','Percentage close QA') v",
        )
      ).id;
      const unit = await value(
        "select id v from unit_catalog where is_active limit 1",
      );
      const jid = await value(
        "select create_workshop_job($1,$2,$3,'[]',$4) v",
        [
          JSON.stringify({ plate: "99-PC-011", make: "BMW", model: "X5" }),
          JSON.stringify({
            funding_source: "CUSTOMER_FUNDED",
            customer_name: "Close QA",
          }),
          JSON.stringify([
            {
              catalogId: catalog,
              quotedPrice: 1000,
              quantity: 1,
              unitId: unit,
            },
          ]),
          randomUUID(),
        ],
      );
      const wid = await value(
        "select id v from job_work_items where service_job_id=$1",
        [jid],
      );
      await value(
        "select update_work_assignment($1,$2,'IN_PROGRESS',null,true) v",
        [wid, worker],
      );
      await user(cashier);
      await db.exec("savepoint failed_close");
      await expect(
        value("select set_vehicle_financial_state($1,true) v", [jid]),
      ).rejects.toThrow();
      await db.exec("rollback to savepoint failed_close");
      await user(admin);
      expect(
        await value("select status v from job_work_items where id=$1", [wid]),
      ).toBe("IN_PROGRESS");
      expect(
        await value(
          "select earning_finalized_at v from job_work_items where id=$1",
          [wid],
        ),
      ).toBeNull();
      expect(
        await value(
          "select earning_snapshot v from job_work_items where id=$1",
          [wid],
        ),
      ).toBeNull();
      await user(cashier);
      await post({
        allocation_type: "CUSTOMER_VEHICLE",
        service_job_id: jid,
        amount: 1000,
      });
      await post({
        allocation_type: "WORKER_WORK_ITEM",
        service_job_id: jid,
        target_id: wid,
        amount: 600,
      });
      const count = await value(
        "select count(*)::int v from cash_transactions",
      );
      await value("select set_vehicle_financial_state($1,true) v", [jid]);
      await user(admin);
      const frozen = await value(
        "select jsonb_build_object('status',status,'earning',earning_snapshot,'basis',earning_basis_snapshot,'at',earning_finalized_at) v from job_work_items where id=$1",
        [wid],
      );
      expect(frozen).toMatchObject({
        status: "DONE",
        earning: 600,
        basis: 1000,
      });
      await value("select set_vehicle_financial_state($1,true) v", [jid]);
      expect(
        await value(
          "select jsonb_build_object('status',status,'earning',earning_snapshot,'basis',earning_basis_snapshot,'at',earning_finalized_at) v from job_work_items where id=$1",
          [wid],
        ),
      ).toEqual(frozen);
      expect(await value("select count(*)::int v from cash_transactions")).toBe(
        count,
      );
      expect(
        await value("select status v from service_jobs where id=$1", [jid]),
      ).toBe("READY");
      expect(
        await value(
          "select count(*)::int v from audit_logs where entity_id=$1 and action='VEHICLE_FINANCE_CLOSED'",
          [jid],
        ),
      ).toBe(1);
    } finally {
      await db.exec("rollback");
      await user(admin);
    }
  });
});

describe("0010 general worker advance allocation", () => {
  it("records one real OUT, allocates explicitly once, protects boundaries and closes with applied money", async () => {
    await user(admin);
    await db.exec("begin");
    const reject = async (operation: () => Promise<unknown>) => {
      await db.exec("savepoint rejection");
      await expect(operation()).rejects.toThrow();
      await db.exec("rollback to savepoint rejection");
    };
    try {
      const catalog = (
        await value<{ id: string }>(
          "select create_catalog_entry('work','Advance allocation QA') v",
        )
      ).id;
      const unit = await value(
        "select id v from unit_catalog where is_active limit 1",
      );
      const jid = await value(
        "select create_workshop_job($1,$2,$3,'[]',$4) v",
        [
          JSON.stringify({ plate: "99-AV-010", make: "BMW", model: "X5" }),
          JSON.stringify({
            funding_source: "CUSTOMER_FUNDED",
            customer_name: "Advance QA",
          }),
          JSON.stringify([
            { catalogId: catalog, quotedPrice: 200, quantity: 1, unitId: unit },
          ]),
          randomUUID(),
        ],
      );
      const wid = await value(
        "select id v from job_work_items where service_job_id=$1",
        [jid],
      );
      await value("select set_work_costing($1,$2,100) v", [wid, worker]);
      const key = randomUUID(),
        payload = JSON.stringify({
          amount: 10,
          channel: "CASH",
          purpose: "Usta avansı",
        });
      await user(intake);
      await reject(() =>
        value("select record_worker_advance($1,$2,$3) v", [
          worker,
          payload,
          key,
        ]),
      );
      expect(await value("select count(*)::int v from worker_advances")).toBe(
        0,
      );
      await user(cashier);
      const before = await value<number>(
        "select count(*)::int v from cash_transactions",
      );
      const advance = await value("select record_worker_advance($1,$2,$3) v", [
        worker,
        payload,
        key,
      ]);
      expect(
        await value("select record_worker_advance($1,$2,$3) v", [
          worker,
          payload,
          key,
        ]),
      ).toBe(advance);
      expect(await value("select count(*)::int v from cash_transactions")).toBe(
        before + 1,
      );
      expect(
        await value("select direction v from cash_transactions where id=$1", [
          advance,
        ]),
      ).toBe("OUT");
      expect(
        await value(
          "select r->>'remaining' v from finance_data('advances') r where r->>'id'=$1",
          [advance],
        ),
      ).toBe("10.00");
      await reject(() =>
        value("select allocate_worker_advance($1,$2,10,$3) v", [
          advance,
          wid,
          randomUUID(),
        ]),
      );
      await user(admin);
      await value("select update_work_assignment($1,$2,'DONE',null) v", [
        wid,
        worker,
      ]);
      await user(cashier);
      const allocKey = randomUUID();
      await value("select allocate_worker_advance($1,$2,10,$3) v", [
        advance,
        wid,
        allocKey,
      ]);
      await value("select allocate_worker_advance($1,$2,10,$3) v", [
        advance,
        wid,
        allocKey,
      ]);
      expect(await value("select count(*)::int v from cash_transactions")).toBe(
        before + 1,
      );
      expect(
        await value(
          "select r->>'remaining' v from finance_data('advances') r where r->>'id'=$1",
          [advance],
        ),
      ).toBe("0.00");
      expect(
        await value(
          "select (r->>'applied_advance')::numeric v from finance_data('work',$1) r where r->>'id'=$2",
          [jid, wid],
        ),
      ).toBe("10.00");
      await reject(() =>
        value("select allocate_worker_advance($1,$2,1,$3) v", [
          advance,
          wid,
          randomUUID(),
        ]),
      );
      await reject(() =>
        post({
          allocation_type: "WORKER_WORK_ITEM",
          service_job_id: jid,
          target_id: wid,
          amount: 91,
        }),
      );
      await post({
        allocation_type: "WORKER_WORK_ITEM",
        service_job_id: jid,
        target_id: wid,
        amount: 90,
      });
      await post({
        allocation_type: "CUSTOMER_VEHICLE",
        service_job_id: jid,
        amount: 200,
      });
      await value("select set_vehicle_financial_state($1,true) v", [jid]);
      await user(admin);
      expect(
        await value("select status v from service_jobs where id=$1", [jid]),
      ).toBe("READY");
      await reject(() =>
        value("select void_cash_payment($1,'QA reversal') v", [advance]),
      );
      expect(
        await value(
          "select count(*)::int v from audit_logs where entity_id=$1 and action='WORKER_ADVANCE_CREATED'",
          [advance],
        ),
      ).toBe(1);
      expect(
        await value(
          "select count(*)::int v from audit_logs where entity_id=$1 and action='WORKER_ADVANCE_ALLOCATED'",
          [wid],
        ),
      ).toBe(1);
    } finally {
      await db.exec("rollback");
      await user(admin);
    }
  });
});

describe("0009 master lifecycle and automatic assignment", () => {
  const lifecycle = (
    kind: string,
    id: string,
    action: string,
    confirmation = "SİL",
  ) =>
    value("select manage_master_lifecycle($1,$2,$3,$4) v", [
      kind,
      id,
      action,
      confirmation,
    ]);
  const directory = (kind: string, id: string) =>
    value<Record<string, unknown>>(
      "select v from master_directory($1) v where v->>'id'=$2",
      [kind, id],
    );
  const newWorker = () =>
    value(
      "insert into workers(owner_user_id,first_name,last_name,role_id) select auth.uid(),'Historical','Master',id from worker_roles limit 1 returning id v",
    );
  const master = (kind: string, data: Record<string, unknown>) =>
    value("select save_financial_master($1,$2) v", [
      kind,
      JSON.stringify(data),
    ]);
  let historicalWorker: string,
    historicalWork: string,
    historicalJob: string,
    historyPayment: string;
  it("archives/restores/deletes unused workers and requires explicit confirmation", async () => {
    await user(admin);
    const id = await newWorker();
    await lifecycle("worker", id, "archive");
    expect((await directory("worker", id)).active).toBe(false);
    await lifecycle("worker", id, "restore");
    expect((await directory("worker", id)).active).toBe(true);
    await expect(lifecycle("worker", id, "delete", "")).rejects.toThrow(/SİL/);
    await lifecycle("worker", id, "delete");
    expect((await directory("worker", id)).deleted_at).toBeTruthy();
    expect(
      await value("select count(*)::int v from workers where id=$1", [id]),
    ).toBe(0);
    expect((await directory("worker", id)).worker_roles).toBeTruthy();
  });
  it("automatically starts TODO on ADMIN costing assignment and blocks active worker deletion", async () => {
    historicalWorker = await newWorker();
    const catalog = (
      await value<{ id: string }>(
        "select create_catalog_entry('work','Lifecycle work') v",
      )
    ).id;
    const unit = await value("select id v from unit_catalog limit 1");
    historicalJob = await value(
      "select create_workshop_job($1,$2,$3,$4,$5) v",
      [
        JSON.stringify({ plate: "99-MD-909", make: "BMW", model: "X5" }),
        JSON.stringify({
          funding_source: "CUSTOMER_FUNDED",
          customer_name: "Master QA",
        }),
        JSON.stringify([
          { catalogId: catalog, quotedPrice: 200, quantity: 1, unitId: unit },
        ]),
        "[]",
        randomUUID(),
      ],
    );
    historicalWork = await value(
      "select id v from job_work_items where service_job_id=$1",
      [historicalJob],
    );
    await value("select set_work_costing($1,$2,100) v", [
      historicalWork,
      historicalWorker,
    ]);
    expect(
      await value("select status v from job_work_items where id=$1", [
        historicalWork,
      ]),
    ).toBe("IN_PROGRESS");
    expect(
      await value("select started_at v from job_work_items where id=$1", [
        historicalWork,
      ]),
    ).toBeTruthy();
    expect(
      await value("select status v from service_jobs where id=$1", [
        historicalJob,
      ]),
    ).toBe("IN_PROGRESS");
    await expect(
      lifecycle("worker", historicalWorker, "delete"),
    ).rejects.toThrow(/aktiv işlər/);
    await lifecycle("worker", historicalWorker, "archive");
    await lifecycle("worker", historicalWorker, "restore");
    historyPayment = await post({
      allocation_type: "WORKER_WORK_ITEM",
      service_job_id: historicalJob,
      target_id: historicalWork,
      amount: 25,
    });
    await value("select update_work_assignment($1,$2,'DONE',null) v", [
      historicalWork,
      historicalWorker,
    ]);
  });
  it("deletes a completed worker without mutating work/payment history and resolves future settlement", async () => {
    const before = await value(
      "select to_jsonb(t) v from cash_transactions t where id=$1",
      [historyPayment],
    );
    await lifecycle("worker", historicalWorker, "delete");
    expect(
      await value("select to_jsonb(t) v from cash_transactions t where id=$1", [
        historyPayment,
      ]),
    ).toEqual(before);
    expect(
      await value(
        "select assigned_worker_id v from job_work_items where id=$1",
        [historicalWork],
      ),
    ).toBe(historicalWorker);
    expect(
      await value(
        "select v->>'worker' v from finance_data('work',$1) v where v->>'id'=$2",
        [historicalJob, historicalWork],
      ),
    ).toBe("Historical Master");
    const payment = await post({
      allocation_type: "WORKER_WORK_ITEM",
      service_job_id: historicalJob,
      target_id: historicalWork,
      amount: 25,
    });
    expect(
      await value(
        "select counterparty_name_snapshot v from cash_transactions where id=$1",
        [payment],
      ),
    ).toBe("Historical Master");
    expect(
      await value(
        "select count(*)::int v from audit_logs where action='WORKER_PERMANENTLY_DELETED' and entity_id=$1",
        [historicalWorker],
      ),
    ).toBe(1);
  });
  it("starts TODO for INTAKE and leaves ongoing/terminal work unchanged on reassignment", async () => {
    const first = await newWorker(),
      second = await newWorker();
    const catalog = (
      await value<{ id: string }>(
        "select create_catalog_entry('work','Intake lifecycle work') v",
      )
    ).id;
    const id = await value(
      "insert into job_work_items(owner_user_id,service_job_id,work_catalog_id,quoted_price) values(auth.uid(),$1,$2,10) returning id v",
      [historicalJob, catalog],
    );
    await lifecycle("worker", first, "archive");
    await user(intake);
    await expect(
      value("select update_work_assignment($1,$2,'TODO',null) v", [id, first]),
    ).rejects.toThrow();
    await value("select update_work_assignment($1,$2,'TODO',null) v", [
      id,
      second,
    ]);
    expect(
      await value(
        "select v->>'status' v from work_queue_data('work') v where v->>'id'=$1",
        [id],
      ),
    ).toBe("IN_PROGRESS");
    await user(admin);
    await lifecycle("worker", first, "restore");
    await db.query(
      "update job_work_items set assigned_worker_id=$1 where id=$2",
      [first, id],
    );
    expect(
      await value("select status v from job_work_items where id=$1", [id]),
    ).toBe("IN_PROGRESS");
    await db.query(
      "update job_work_items set assigned_worker_id=null where id=$1",
      [id],
    );
    expect(
      await value("select status v from job_work_items where id=$1", [id]),
    ).toBe("IN_PROGRESS");
    await db.query("update job_work_items set status='DONE' where id=$1", [id]);
    await db.query(
      "update job_work_items set assigned_worker_id=$1 where id=$2",
      [second, id],
    );
    expect(
      await value("select status v from job_work_items where id=$1", [id]),
    ).toBe("DONE");
    expect(
      await value(
        "select count(*)::int v from audit_logs where entity_id=$1 and actor_user_id=$2 and action='WORK_STATUS_CHANGED'",
        [id, intake],
      ),
    ).toBeGreaterThan(0);
  });
  it("manages bank accounts, blocks nonzero balances, preserves zero-balanced history and IBAN", async () => {
    const id = await master("account", {
      name: "Lifecycle Bank",
      iban: "AZLIFECYCLE",
      bank_name: "QA Bank",
    });
    await master("account", {
      id,
      name: "Edited Bank",
      iban: "AZLIFECYCLE",
      bank_name: "QA Bank",
    });
    await lifecycle("account", id, "archive");
    expect((await directory("account", id)).active).toBe(false);
    await lifecycle("account", id, "restore");
    const inCategory = await master("category", {
      name: "Lifecycle bank income",
      direction: "IN",
    });
    const outCategory = await master("category", {
      name: "Lifecycle bank expense",
      direction: "OUT",
    });
    const incoming = await post({
      channel: "BANK",
      financial_account_id: id,
      payment_method: "TRANSFER",
      allocation_type: "GENERAL_IN",
      category_id: inCategory,
      amount: 10,
    });
    await expect(lifecycle("account", id, "delete")).rejects.toThrow(
      /qalığı sıfır/,
    );
    await post({
      channel: "BANK",
      financial_account_id: id,
      payment_method: "TRANSFER",
      allocation_type: "GENERAL_OUT",
      category_id: outCategory,
      amount: 10,
    });
    await lifecycle("account", id, "delete");
    expect((await directory("account", id)).iban).toBe("AZLIFECYCLE");
    expect((await directory("account", id)).name).toBe("Edited Bank");
    expect(
      await value(
        "select financial_account_id v from cash_transactions where id=$1",
        [incoming],
      ),
    ).toBe(id);
    await expect(
      post({
        channel: "BANK",
        financial_account_id: id,
        payment_method: "TRANSFER",
        allocation_type: "GENERAL_IN",
        amount: 1,
      }),
    ).rejects.toThrow();
    const unused = await master("account", { name: "Unused bank" });
    await lifecycle("account", unused, "delete");
    expect(
      await value(
        "select count(*)::int v from financial_accounts where id=$1",
        [unused],
      ),
    ).toBe(0);
  });
  it("manages custom categories, preserves used labels and protects system categories", async () => {
    const id = await master("category", {
      name: "Lifecycle expense",
      direction: "OUT",
    });
    await master("category", { id, name: "Edited expense", direction: "OUT" });
    await lifecycle("category", id, "archive");
    await expect(
      post({ allocation_type: "GENERAL_OUT", category_id: id, amount: 1 }),
    ).rejects.toThrow();
    await lifecycle("category", id, "restore");
    const movement = await post({
      allocation_type: "GENERAL_OUT",
      category_id: id,
      amount: 1,
    });
    await expect(
      master("category", { id, name: "Edited expense", direction: "IN" }),
    ).rejects.toThrow();
    await lifecycle("category", id, "delete");
    expect((await directory("category", id)).name).toBe("Edited expense");
    expect(
      await value("select category_id v from cash_transactions where id=$1", [
        movement,
      ]),
    ).toBe(id);
    const system = await value(
      "select id v from transaction_categories where is_system limit 1",
    );
    for (const action of ["archive", "restore", "delete"])
      await expect(lifecycle("category", system, action)).rejects.toThrow(
        /Sistem/,
      );
    await expect(
      master("category", { id: system, name: "Overwrite", direction: "IN" }),
    ).rejects.toThrow(/Sistem/);
    const unused = await master("category", {
      name: "Unused category",
      direction: "IN",
    });
    await lifecycle("category", unused, "delete");
  });
  it("enforces master RBAC, private snapshots and organization isolation", async () => {
    for (const actor of [cashier, intake, other]) {
      await user(actor);
      for (const kind of ["worker", "account", "category"])
        await expect(
          lifecycle(kind, historicalWorker, "delete"),
        ).rejects.toThrow();
      await expect(
        value("select count(*) v from master_identities"),
      ).rejects.toThrow();
      if (actor !== other)
        await expect(
          master("category", { name: "Unauthorized", direction: "IN" }),
        ).rejects.toThrow();
    }
    await user(intake);
    for (const kind of ["worker", "account", "category"])
      await expect(directory(kind, historicalWorker)).rejects.toThrow();
    await user(cashier);
    await expect(directory("worker", historicalWorker)).rejects.toThrow();
    await user(other);
    expect(await directory("worker", historicalWorker)).toBeUndefined();
    await user(admin);
  });
});
describe.sequential("unified cash and bank ledger", () => {
  it("exposes only operational fields to intake and restricts assignment mutations", async () => {
    await user(intake);
    const projection = (
      await db.query<{ v: Record<string, unknown> }>(
        "select work_queue_data('work') v",
      )
    ).rows.map((r) => r.v);
    expect(projection.find((w) => w.id === work)).toBeTruthy();
    for (const kind of ["jobs", "work", "workers"]) {
      const payload = JSON.stringify(
        (await db.query("select work_queue_data($1) v", [kind])).rows,
      );
      for (const key of [
        "labor_cost",
        "quoted_price",
        "agreed_budget",
        "paid_amount",
        "customer_phone",
        "phone",
        "profit",
      ]) {
        expect(payload).not.toContain(key);
      }
    }
    await value(
      "select update_work_assignment($1,$2,'IN_PROGRESS','İcra olunur') v",
      [work, worker],
    );
    expect(
      (await db.query("select * from job_work_items where id=$1", [work])).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "update job_work_items set labor_cost=1 where id=$1 returning id",
        [work],
      ),
    ).resolves.toMatchObject({ rows: [] });
    await expect(
      value("select update_work_assignment($1,$2,'INVALID',null) v", [
        work,
        worker,
      ]),
    ).rejects.toThrow();
    await expect(
      value("select update_work_assignment($1,$2,'TODO',$3) v", [
        work,
        worker,
        "x".repeat(251),
      ]),
    ).rejects.toThrow();
    await user(cashier);
    await expect(value("select work_queue_data('work') v")).rejects.toThrow();
    await expect(
      value("select update_work_assignment($1,$2,'TODO',null) v", [
        work,
        worker,
      ]),
    ).rejects.toThrow();
    await user(other);
    expect(
      (await db.query("select work_queue_data('work')")).rows,
    ).toHaveLength(0);
    await expect(
      value("select update_work_assignment($1,$2,'TODO',null) v", [
        work,
        worker,
      ]),
    ).rejects.toThrow();
    await user(admin);
    expect(
      Number(
        await value("select labor_cost v from job_work_items where id=$1", [
          work,
        ]),
      ),
    ).toBe(500);
    await value("select update_work_assignment($1,$2,'TODO',null) v", [
      work,
      worker,
    ]);
  });
  it("backfills the same legacy payment ID as CASH without duplicates", async () => {
    expect(
      await value("select channel v from cash_transactions where id=$1", [
        legacyPayment,
      ]),
    ).toBe("CASH");
    expect(
      await value("select amount v from cash_transactions where id=$1", [
        legacyPayment,
      ]),
    ).toBe("25.50");
    expect(
      await value("select count(*)::int v from cash_transactions where id=$1", [
        legacyPayment,
      ]),
    ).toBe(1);
  });
  it("does not expose line prices to CASHIER but returns aggregate receivables", async () => {
    await user(cashier);
    expect(
      await value<number>("select count(*)::int v from job_work_items"),
    ).toBe(0);
    expect(
      await value<number>("select count(*)::int v from job_required_parts"),
    ).toBe(0);
    const rows = await value<object>(
      "select jsonb_agg(x) v from finance_data('work') x",
    );
    expect(JSON.stringify(rows)).not.toMatch(
      /quoted_price|customer_unit_price|profit/,
    );
    expect(
      await value<number>(
        "select (x->>'customer_due')::numeric v from finance_data('jobs',$1) x",
        [job],
      ),
    ).toBe("2000.75");
  });
  it("records cash and bank vehicle receipts once, preserving qapik", async () => {
    const key = randomUUID();
    const d = {
      allocation_type: "CUSTOMER_VEHICLE",
      service_job_id: job,
      amount: "500.50",
    };
    expect(await post(d, key)).toBe(await post(d, key));
    await post({
      ...d,
      amount: "1000.25",
      channel: "BANK",
      financial_account_id: account,
      payment_method: "POS",
      bank_reference: "TEST-BANK-001",
    });
    expect(
      await value(
        "select (x->>'customer_due')::numeric v from finance_data('jobs',$1) x",
        [job],
      ),
    ).toBe("500.00");
  });
  it("records worker cash advance and supplier bank payment", async () => {
    await post({
      allocation_type: "WORKER_WORK_ITEM",
      service_job_id: job,
      target_id: work,
      amount: 200,
    });
    await post({
      allocation_type: "SUPPLIER_PURCHASE",
      service_job_id: job,
      target_id: purchase,
      amount: 300,
      channel: "BANK",
      financial_account_id: account,
      payment_method: "TRANSFER",
    });
    expect(
      await value("select paid_amount v from purchases where id=$1", [
        purchase,
      ]),
    ).toBe("300.00");
  });
  it("corrects costs and quotes without rewriting historical paid amounts", async () => {
    await user(admin);
    const before = await value(
      "select jsonb_agg(to_jsonb(t) order by id) v from cash_transactions t",
    );
    await db.query("update purchases set unit_price=750 where id=$1", [
      purchase,
    ]);
    await value("select set_work_costing($1,$2,550) v", [work, worker]);
    await db.query(
      "update job_work_items set customer_unit_price=850.75 where id=$1",
      [work],
    );
    expect(
      await value(
        "select total_price-paid_amount v from purchases where id=$1",
        [purchase],
      ),
    ).toBe("450.00");
    expect(
      await value(
        "select labor_cost-(select sum(amount) from cash_transactions where work_item_id=$1) v from job_work_items where id=$1",
        [work],
      ),
    ).toBe("350.00");
    expect(
      await value(
        "select (x->>'customer_due')::numeric v from finance_data('jobs',$1) x",
        [job],
      ),
    ).toBe("550.00");
    expect(
      await value(
        "select jsonb_agg(to_jsonb(t) order by id) v from cash_transactions t",
      ),
    ).toEqual(before);
    await db.query("update purchases set unit_price=700 where id=$1", [
      purchase,
    ]);
    await value("select set_work_costing($1,$2,500) v", [work, worker]);
    await db.query(
      "update job_work_items set customer_unit_price=800.75 where id=$1",
      [work],
    );
    await user(cashier);
  });
  it("preserves overpayments as negative balances without automatic reversals", async () => {
    await user(admin);
    const before = await value(
      "select jsonb_agg(to_jsonb(t) order by id) v from cash_transactions t",
    );
    await db.query("update purchases set unit_price=250 where id=$1", [
      purchase,
    ]);
    await value("select set_work_costing($1,$2,150) v", [work, worker]);
    await db.query(
      "update job_work_items set customer_unit_price=250 where id=$1",
      [work],
    );
    expect(
      await value(
        "select total_price-paid_amount v from purchases where id=$1",
        [purchase],
      ),
    ).toBe("-50.00");
    expect(
      await value(
        "select (x->>'customer_due')::numeric v from finance_data('jobs',$1) x",
        [job],
      ),
    ).toBe("-50.75");
    await expect(
      value("select set_vehicle_financial_state($1,true) v", [job]),
    ).rejects.toThrow();
    expect(
      await value(
        "select jsonb_agg(to_jsonb(t) order by id) v from cash_transactions t",
      ),
    ).toEqual(before);
    await db.query("update purchases set unit_price=700 where id=$1", [
      purchase,
    ]);
    await value("select set_work_costing($1,$2,500) v", [work, worker]);
    await db.query(
      "update job_work_items set customer_unit_price=800.75 where id=$1",
      [work],
    );
    await user(cashier);
  });
  it("rejects forged legacy transfers and line customer receipts by cashier", async () => {
    await expect(
      value(
        "select record_cash_payment($1,'TRANSFER_IN',null,1,current_date,null,$2) v",
        [job, randomUUID()],
      ),
    ).rejects.toThrow();
    await expect(
      value(
        "select record_cash_payment($1,'CUSTOMER_WORK',$2,1,current_date,null,$3) v",
        [job, work, randomUUID()],
      ),
    ).rejects.toThrow();
  });
  it("validates account, category, precise money and overpayment bounds", async () => {
    for (const d of [
      { amount: 0 },
      { amount: "1.001" },
      { amount: -1 },
      { channel: "BANK", financial_account_id: randomUUID() },
      { channel: "BANK" },
      { category_id: randomUUID() },
    ])
      await expect(
        post({
          allocation_type: "GENERAL_OUT",
          amount: 1,
          category_id: category,
          ...d,
        }),
      ).rejects.toThrow();
    await expect(
      post({
        allocation_type: "CUSTOMER_VEHICLE",
        service_job_id: job,
        amount: 501,
      }),
    ).rejects.toThrow();
    await expect(
      value("select set_vehicle_financial_state($1,null) v", [job]),
    ).rejects.toThrow();
    await expect(
      value("select record_financial_transaction($1,null) v", [
        JSON.stringify({
          allocation_type: "GENERAL_OUT",
          amount: 1,
          channel: "CASH",
          category_id: category,
          purpose: "QA",
        }),
      ]),
    ).rejects.toThrow();
    await expect(
      post({
        allocation_type: "GENERAL_OUT",
        amount: 1,
        category_id: category,
        currency: "USD",
      }),
    ).rejects.toThrow();
  });
  it("restricts opening balances to ADMIN and one live entry per account", async () => {
    await expect(
      post({ allocation_type: "OPENING_IN", amount: 100 }),
    ).rejects.toThrow();
    await user(admin);
    const id = await post({ allocation_type: "OPENING_IN", amount: 100 });
    await expect(
      post({ allocation_type: "OPENING_IN", amount: 100 }),
    ).rejects.toThrow();
    const bankId = await post({
      allocation_type: "OPENING_IN",
      amount: 200,
      channel: "BANK",
      financial_account_id: account,
    });
    await value("select void_cash_payment($1,'QA opening correction') v", [id]);
    await value("select void_cash_payment($1,'QA opening correction') v", [
      bankId,
    ]);
    await user(cashier);
  });
  it("reuses categories and enforces AZN accounts and archive status", async () => {
    await user(admin);
    const id = await value("select save_financial_master('category',$1) v", [
      JSON.stringify({ name: "QA income", direction: "IN" }),
    ]);
    expect(
      await value("select save_financial_master('category',$1) v", [
        JSON.stringify({ name: "QA income", direction: "IN" }),
      ]),
    ).toBe(id);
    await post({
      allocation_type: "GENERAL_IN",
      amount: 12.25,
      category_id: id,
    });
    await expect(
      post({ allocation_type: "GENERAL_OUT", amount: 1, category_id: id }),
    ).rejects.toThrow();
    await expect(
      value("select save_financial_master('account',$1) v", [
        JSON.stringify({ name: "No FX", currency: "USD" }),
      ]),
    ).rejects.toThrow();
    await value("select save_financial_master('account',$1) v", [
      JSON.stringify({ id: account, name: "QA Bank", active: false }),
    ]);
    await expect(
      post({
        allocation_type: "GENERAL_IN",
        amount: 1,
        category_id: id,
        channel: "BANK",
        financial_account_id: account,
      }),
    ).rejects.toThrow();
    await value("select save_financial_master('account',$1) v", [
      JSON.stringify({ id: account, name: "QA Bank", active: true }),
    ]);
    await user(cashier);
  });
  it("supports general expense without a vehicle", async () => {
    await post({
      allocation_type: "GENERAL_OUT",
      amount: "15.75",
      category_id: category,
      channel: "BANK",
      financial_account_id: account,
      payment_method: "TRANSFER",
    });
  });
  it("transfers two linked movements without inflating business totals", async () => {
    const before = await value(
      "select sum(case when direction='IN' then amount else -amount end) v from cash_transactions where voided_at is null",
    );
    const key = randomUUID();
    await value(
      "select transfer_financial_funds(null,$1,1000,now(),null,$2) v",
      [account, key],
    );
    await value(
      "select transfer_financial_funds(null,$1,1000,now(),null,$2) v",
      [account, key],
    );
    expect(
      await value<number>(
        "select count(*)::int v from cash_transactions where transfer_id=$1",
        [key],
      ),
    ).toBe(2);
    expect(
      await value(
        "select sum(case when direction='IN' then amount else -amount end) v from cash_transactions where voided_at is null",
      ),
    ).toBe(before);
  });
  it("enforces master and cost authorization and organization isolation", async () => {
    await expect(
      value("select save_financial_master('account','{\"name\":\"No\"}') v"),
    ).rejects.toThrow();
    await expect(
      value("select set_worker_cost($1,1) v", [work]),
    ).rejects.toThrow();
    await expect(
      value("select delete_supplier_permanently($1,$2) v", [supplier, "SİL"]),
    ).rejects.toThrow();
    await user(intake);
    await expect(
      value("select * from finance_data('ledger')"),
    ).rejects.toThrow();
    await user(other);
    expect(
      await value<number>("select count(*)::int v from finance_data('jobs')"),
    ).toBe(0);
    await expect(
      post({
        allocation_type: "CUSTOMER_VEHICLE",
        service_job_id: job,
        amount: 1,
      }),
    ).rejects.toThrow();
    await user(admin);
  });
  it("permanently deletes only supplier master and retains paid history", async () => {
    await value("select delete_supplier_permanently($1,$2) v", [
      supplier,
      "SİL",
    ]);
    expect(
      await value<number>("select count(*)::int v from suppliers where id=$1", [
        supplier,
      ]),
    ).toBe(0);
    expect(
      await value(
        "select supplier_snapshot->>'company_name' v from purchases where id=$1",
        [purchase],
      ),
    ).toBe("Permanent history supplier");
    expect(
      await value(
        "select counterparty_name_snapshot v from cash_transactions where purchase_id=$1",
        [purchase],
      ),
    ).toBe("Permanent history supplier");
  });
  it("rejects early close then settles atomically and closes", async () => {
    await expect(
      value("select set_vehicle_financial_state($1,true) v", [job]),
    ).rejects.toThrow();
    await post({
      allocation_type: "CUSTOMER_VEHICLE",
      service_job_id: job,
      amount: 500,
    });
    const rows = [
      {
        allocation_type: "SUPPLIER_PURCHASE",
        target_id: purchase,
        amount: 400,
      },
      { allocation_type: "WORKER_WORK_ITEM", target_id: work, amount: 300 },
    ].map((x) => ({ ...x, channel: "CASH", purpose: "Settlement" }));
    const key = randomUUID();
    await value("select settle_vehicle_obligations($1,$2,true,$3) v", [
      job,
      JSON.stringify(rows),
      key,
    ]);
    expect(
      await value(
        "select financially_closed_at is not null v from service_jobs where id=$1",
        [job],
      ),
    ).toBe(true);
    const beforeCount = await value(
      "select count(*)::int v from cash_transactions",
    );
    await value("select settle_vehicle_obligations($1,$2,true,$3) v", [
      job,
      JSON.stringify(rows),
      key,
    ]);
    expect(await value("select count(*)::int v from cash_transactions")).toBe(
      beforeCount,
    );
    await expect(
      value("select set_work_costing($1,$2,550) v", [work, worker]),
    ).rejects.toThrow();
    await expect(
      db.query("update purchases set unit_price=750 where id=$1", [purchase]),
    ).rejects.toThrow();
    await expect(
      db.query(
        "update job_work_items set customer_unit_price=1000 where id=$1",
        [work],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "update service_jobs set financially_closed_at=null where id=$1",
        [job],
      ),
    ).rejects.toThrow();
    await expect(
      post({
        allocation_type: "VEHICLE_EXPENSE",
        service_job_id: job,
        amount: 1,
        category_id: category,
      }),
    ).rejects.toThrow();
    await user(cashier);
    await expect(
      value("select set_vehicle_financial_state($1,false,$2) v", [
        job,
        "Reopen",
      ]),
    ).rejects.toThrow();
    await user(admin);
    await value("select set_vehicle_financial_state($1,false,$2) v", [
      job,
      "Correction",
    ]);
  });
  it("reverses linked transfers together and never deletes transactions", async () => {
    const id = await value(
      "select id v from cash_transactions where allocation_type='TRANSFER_OUT'",
    );
    await value("select void_cash_payment($1,$2) v", [id, "Correction"]);
    expect(
      await value<number>(
        "select count(*)::int v from cash_transactions where transfer_id is not null and voided_at is null",
      ),
    ).toBe(0);
    await expect(db.exec("delete from cash_transactions")).rejects.toThrow();
  });
  it("rolls back an entire settlement if any allocation is invalid", async () => {
    const count = await value("select count(*)::int v from cash_transactions");
    await expect(
      value("select settle_vehicle_obligations($1,$2,false,$3) v", [
        job,
        JSON.stringify([
          {
            allocation_type: "WORKER_WORK_ITEM",
            target_id: work,
            amount: 1,
            channel: "CASH",
            purpose: "QA",
          },
          {
            allocation_type: "SUPPLIER_PURCHASE",
            target_id: randomUUID(),
            amount: 1,
            channel: "CASH",
            purpose: "QA",
          },
        ]),
        randomUUID(),
      ]),
    ).rejects.toThrow();
    expect(await value("select count(*)::int v from cash_transactions")).toBe(
      count,
    );
  });
  it("recognizes vehicle expense without changing customer receipts and can reverse it", async () => {
    const id = await post({
      allocation_type: "VEHICLE_EXPENSE",
      service_job_id: job,
      amount: 15.75,
      category_id: category,
    });
    expect(
      await value(
        "select (x->>'customer_due')::numeric v from finance_data('jobs',$1) x",
        [job],
      ),
    ).toBe("0.00");
    await value("select void_cash_payment($1,'Explicit correction') v", [id]);
    expect(
      await value(
        "select count(*)::int v from cash_reversals where transaction_id=$1",
        [id],
      ),
    ).toBe(1);
    expect(
      await value("select amount v from cash_transactions where id=$1", [id]),
    ).toBe("15.75");
  });
  it("supports bank-to-bank and bank-to-cash with two balanced rows each", async () => {
    const second = await value("select save_financial_master('account',$1) v", [
      JSON.stringify({ name: "Second bank" }),
    ]);
    for (const destination of [second, null]) {
      const key = randomUUID();
      await value(
        "select transfer_financial_funds($1,$2,10.25,now(),null,$3) v",
        [account, destination, key],
      );
      expect(
        await value(
          "select sum(case when direction='IN' then amount else -amount end) v from cash_transactions where transfer_id=$1",
          [key],
        ),
      ).toBe("0.00");
    }
  });
  it("archives/restores suppliers and deletes an unused master without affecting ledger", async () => {
    const id = await value(
      "insert into suppliers(owner_user_id,entity_type,company_name) values(auth.uid(),'LEGAL_ENTITY','Unused') returning id v",
    );
    await db.query("update suppliers set active=false where id=$1", [id]);
    await db.query("update suppliers set active=true where id=$1", [id]);
    const before = await value("select count(*)::int v from cash_transactions");
    await expect(
      value("select delete_supplier_permanently($1,'wrong') v", [id]),
    ).rejects.toThrow();
    await value("select delete_supplier_permanently($1,'SİL') v", [id]);
    expect(await value("select count(*)::int v from cash_transactions")).toBe(
      before,
    );
  });
  it("retains complete immutable close snapshots and reasoned reopen audit", async () => {
    const meta = await value<Record<string, unknown>>(
      "select metadata v from audit_logs where action='VEHICLE_FINANCE_CLOSED' and service_job_id=$1 limit 1",
      [job],
    );
    expect(meta).toMatchObject({
      part_cost: 700,
      worker_cost: 500,
      other_expenses: 0,
      supplier_paid: 700,
      worker_paid: 500,
      customer_received: 2000.75,
      customer_due: 0,
    });
    expect(
      await value(
        "select metadata->>'reason' v from audit_logs where action='VEHICLE_FINANCE_REOPENED' and service_job_id=$1 limit 1",
        [job],
      ),
    ).toBe("Correction");
    await expect(
      db.exec("update audit_logs set summary='tampered'"),
    ).rejects.toThrow();
    await expect(db.exec("delete from audit_logs")).rejects.toThrow();
  });
  it("reverses each payment type without deleting the original amount or allocation", async () => {
    for (const kind of [
      "CUSTOMER_VEHICLE",
      "SUPPLIER_PURCHASE",
      "WORKER_WORK_ITEM",
    ]) {
      const original = await value<Record<string, unknown>>(
        "select to_jsonb(t) v from cash_transactions t where allocation_type=$1 and voided_at is null limit 1",
        [kind],
      );
      await value(
        "select void_cash_payment($1,'Explicit payment correction') v",
        [original.id],
      );
      const current = await value<Record<string, unknown>>(
        "select to_jsonb(t) v from cash_transactions t where id=$1",
        [original.id],
      );
      expect(current.amount).toBe(original.amount);
      expect(current.allocation_type).toBe(kind);
      expect(current.voided_at).not.toBeNull();
      expect(
        await value(
          "select count(*)::int v from cash_reversals where transaction_id=$1",
          [original.id],
        ),
      ).toBe(1);
    }
  });
  it("retains additional-work, paid-assignment, closure and session guards for intake", async () => {
    await user(admin);
    const catalog = await value("select id v from work_catalog limit 1");
    const unit = await value("select id v from unit_catalog limit 1");
    const extraJob = await value(
      "select create_workshop_job($1,$2,$3,'[]',$4) v",
      [
        JSON.stringify({ plate: "99-WQ-808", make: "BMW", model: "F30" }),
        JSON.stringify({ funding_source: "CUSTOMER_FUNDED" }),
        JSON.stringify([
          { catalogId: catalog, quotedPrice: 100, quantity: 1, unitId: unit },
        ]),
        randomUUID(),
      ],
    );
    const extraCatalog = (
      await value<{ id: string }>(
        "select create_catalog_entry('work','Extra operational QA') v",
      )
    ).id;
    const extra = await value("select create_additional_work($1,$2) v", [
      JSON.stringify({
        service_job_id: extraJob,
        catalog_id: extraCatalog,
        quantity: 1,
        unit_id: unit,
        customer_unit_price: 100,
        worker_id: worker,
        labor_cost: 50,
      }),
      randomUUID(),
    ]);
    await user(intake);
    await value(
      "select update_work_assignment($1,$2,'IN_PROGRESS','Əlavə iş başladı') v",
      [extra, worker],
    );
    await expect(
      value("select update_work_assignment($1,$2,'TODO',null) v", [
        extra,
        randomUUID(),
      ]),
    ).rejects.toThrow();
    await user(admin);
    expect(
      await value("select is_additional v from job_work_items where id=$1", [
        extra,
      ]),
    ).toBe(true);
    expect(
      Number(
        await value("select labor_cost v from job_work_items where id=$1", [
          extra,
        ]),
      ),
    ).toBe(50);
    await post({
      allocation_type: "WORKER_WORK_ITEM",
      service_job_id: extraJob,
      target_id: extra,
      amount: 10,
    });
    await user(intake);
    await expect(
      value("select update_work_assignment($1,null,'TODO',null) v", [extra]),
    ).rejects.toThrow(/Ödənilmiş/);
    await expect(
      value("select update_work_assignment($1,$2,'CANCELLED',null) v", [
        extra,
        worker,
      ]),
    ).rejects.toThrow(/Ödənişi/);
    await value("select update_work_assignment($1,$2,'DONE',null) v", [
      extra,
      worker,
    ]);
    await db.exec("reset role");
    await db.query(
      "update service_jobs set financially_closed_at=now() where id=$1",
      [extraJob],
    );
    await user(intake);
    await expect(
      value("select update_work_assignment($1,$2,'TODO',null) v", [
        extra,
        worker,
      ]),
    ).rejects.toThrow(/maliyyəsini/);
    for (const patch of [
      "is_active=false",
      "must_change_password=true",
      "session_not_before=now()+interval '1 day'",
    ]) {
      await db.exec("reset role");
      await db.exec(
        `update user_profiles set ${patch} where auth_user_id='${intake}'`,
      );
      await user(intake);
      await expect(value("select work_queue_data('work') v")).rejects.toThrow();
      await expect(
        value("select update_work_assignment($1,$2,'TODO',null) v", [
          extra,
          worker,
        ]),
      ).rejects.toThrow();
      await db.exec("reset role");
      await db.exec(
        `update user_profiles set is_active=true,must_change_password=false,session_not_before='2000-01-01' where auth_user_id='${intake}'`,
      );
    }
    await user(admin);
    expect(
      await value(
        "select count(*)::int v from audit_logs where actor_user_id=$1 and action='WORK_STATUS_CHANGED' and entity_id=$2",
        [intake, extra],
      ),
    ).toBeGreaterThan(0);
  });
});
