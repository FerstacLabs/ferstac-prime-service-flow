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
describe.sequential("unified cash and bank ledger", () => {
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
    expect(await value("select count(*)::int v from cash_transactions")).toBe(
      1,
    );
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
});
