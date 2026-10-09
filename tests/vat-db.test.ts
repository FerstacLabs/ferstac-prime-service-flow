// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

let db: PGlite;
const admin = randomUUID(),
  cashier = randomUUID(),
  intake = randomUUID();
let org: string, job: string, supplier: string, purchase: string;
async function value<T = string>(sql: string, args: unknown[] = []) {
  return (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
}
async function user(id: string) {
  await db.exec(`reset role; set app.uid='${id}'; set role authenticated;`);
}
async function adjustment(
  kind: string,
  amount: number,
  extra: Record<string, unknown> = {},
  key = randomUUID(),
) {
  return value("select record_vat_adjustment($1,$2) v", [
    JSON.stringify({
      kind,
      amount,
      occurred_at: "2026-10-07T08:00:00Z",
      reference_number: "VAT-QA",
      note: "Local QA",
      ...extra,
    }),
    key,
  ]);
}
async function buy(net: number) {
  return value("select save_workshop_purchase($1,$2) v", [
    JSON.stringify({
      service_job_id: job,
      custom_item_name: "Lifecycle VAT part",
      quantity: 1,
      unit_price: net,
      source_type: "SUPPLIER",
      supplier_id: supplier,
      purchased_by_admin: true,
      payment_status: "UNPAID",
      purchase_date: "2026-10-07",
      vat_enabled: true,
    }),
    randomUUID(),
  ]);
}
async function payPurchase(id: string, amount: number) {
  return value("select record_financial_transaction($1,$2) v", [
    JSON.stringify({
      allocation_type: "SUPPLIER_PURCHASE",
      service_job_id: job,
      target_id: id,
      channel: "CASH",
      purpose: "VAT lifecycle QA",
      amount,
      occurred_at: "2026-10-10T09:00:00Z",
    }),
    randomUUID(),
  ]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values('${admin}'),('${cashier}'),('${intake}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('iat',extract(epoch from now())::bigint)$$;
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public,auth to authenticated,anon,service_role; set app.uid='${admin}';
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.buckets enable row level security;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,service_role;
    grant select on storage.objects to authenticated; grant all on storage.objects to service_role;`);
  for (const file of readdirSync("supabase/migrations").sort()) {
    await db.exec(
      readFileSync(`supabase/migrations/${file}`, "utf8").replace(
        'create extension if not exists "pgcrypto";',
        "",
      ),
    );
    if (file.startsWith("0001")) {
      await db.exec(readFileSync("supabase/seed.sql", "utf8"));
      await db.exec(`insert into vehicles(owner_user_id,plate,make,model) values('${admin}','10-AB-123','BMW','F30');
        insert into service_jobs(owner_user_id,vehicle_id,job_no,funding_source,agreed_budget)
        select '${admin}',id,'LEGACY-VAT','CUSTOMER_FUNDED',100 from vehicles limit 1;`);
    }
  }
  org = await value("select id v from organizations where slug='prime'");
  await db.exec(`update user_profiles set must_change_password=false;
    insert into user_profiles(auth_user_id,organization_id,username,display_name,role,must_change_password)
    values('${cashier}','${org}','kassa','Cashier','CASHIER',false),('${intake}','${org}','intake','Intake','INTAKE',false);`);
  await user(admin);
  supplier = await value(
    "insert into suppliers(owner_user_id,entity_type,company_name) values(auth.uid(),'LEGAL_ENTITY','VAT supplier') returning id v",
  );
  const catalog = await value("select id v from work_catalog limit 1");
  job = await value("select create_workshop_job($1,$2,$3,'[]',$4) v", [
    JSON.stringify({ plate: "99-VT-014", make: "BMW", model: "QA" }),
    JSON.stringify({
      funding_source: "CUSTOMER_FUNDED",
      customer_name: "VAT customer",
      vat_enabled: true,
    }),
    JSON.stringify([{ catalogId: catalog, quotedPrice: "100", quantity: 1 }]),
    randomUUID(),
  ]);
  purchase = await value("select save_workshop_purchase($1,$2) v", [
    JSON.stringify({
      service_job_id: job,
      custom_item_name: "VAT part",
      quantity: 2,
      unit_price: 100,
      source_type: "SUPPLIER",
      supplier_id: supplier,
      purchased_by_admin: true,
      payment_status: "UNPAID",
      purchase_date: "2026-10-07",
      vat_enabled: true,
    }),
    randomUUID(),
  ]);
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("0014 VAT persistence and protected deposit", () => {
  it("backfills historical jobs VAT-off without changing their budget", async () => {
    expect(
      await value(
        "select jsonb_build_object('enabled',vat_enabled,'budget',agreed_budget) v from service_jobs where job_no='LEGACY-VAT'",
      ),
    ).toEqual({ enabled: false, budget: 100 });
  });
  it("persists vehicle VAT and exact supplier net/VAT/gross", async () => {
    expect(
      await value("select vat_enabled v from service_jobs where id=$1", [job]),
    ).toBe(true);
    expect(
      await value(
        "select jsonb_build_object('net',net_amount,'vat',vat_amount,'gross',gross_amount) v from purchases where id=$1",
        [purchase],
      ),
    ).toEqual({ net: 200, vat: 36, gross: 236 });
  });
  it("allows INTAKE quotation VAT but denies deposit access and adjustments", async () => {
    await user(intake);
    await value(
      "select update_vehicle_intake($1,'{}','{\"vat_enabled\":false}') v",
      [job],
    );
    expect(
      await value("select vat_enabled v from service_jobs where id=$1", [job]),
    ).toBe(false);
    expect(
      await value<number>("select count(*)::integer v from vat_ledger"),
    ).toBe(0);
    await expect(adjustment("OPENING", 50)).rejects.toThrow();
    await user(admin);
  });
  it("denies CASHIER structural VAT changes", async () => {
    await user(cashier);
    await expect(
      value(
        "select update_vehicle_intake($1,'{}','{\"vat_enabled\":true}') v",
        [job],
      ),
    ).rejects.toThrow();
    await expect(adjustment("OPENING", 50)).rejects.toThrow();
    await user(admin);
  });
  it("records one audited opening and supports idempotent retries", async () => {
    const key = randomUUID();
    const id = await adjustment("OPENING", 50, {}, key);
    expect(await adjustment("OPENING", 50, {}, key)).toBe(id);
    await expect(adjustment("OPENING", 51, {}, key)).rejects.toThrow(/uyğun/);
    await expect(adjustment("OPENING", 50)).rejects.toThrow(/artıq/);
    expect(
      await value<number>(
        "select count(*)::integer v from audit_logs where action='VAT_OPENING'",
      ),
    ).toBe(1);
  });
  it("blocks negative and backdated balances atomically", async () => {
    await expect(adjustment("BUDGET_PAYMENT", 51)).rejects.toThrow(/kifayət/);
    await expect(
      adjustment("BUDGET_PAYMENT", 1, { occurred_at: "2026-10-06T08:00:00Z" }),
    ).rejects.toThrow(/kifayət/);
    expect(
      await value<number>("select count(*)::integer v from vat_ledger"),
    ).toBe(1);
  });
  it("keeps corrections immutable and reverses once", async () => {
    const id = await adjustment("BUDGET_PAYMENT", 10, {
      occurred_at: "2026-10-08T08:00:00Z",
    });
    await adjustment("REVERSAL", 10, {
      reversal_of: id,
      occurred_at: "2026-10-08T09:00:00Z",
    });
    await expect(
      adjustment("REVERSAL", 10, {
        reversal_of: id,
        occurred_at: "2026-10-08T10:00:00Z",
      }),
    ).rejects.toThrow();
    await expect(db.exec("update vat_ledger set amount=1")).rejects.toThrow();
    await expect(db.exec("delete from vat_ledger")).rejects.toThrow();
    expect(
      await value(
        "select sum(case direction when 'IN' then amount else -amount end)::text v from vat_ledger",
      ),
    ).toBe("50");
  });
  it("splits real customer receipts and supplier payments without duplicating assets", async () => {
    await value(
      "select update_vehicle_intake($1,'{}','{\"vat_enabled\":true}') v",
      [job],
    );
    const post = (type: string, amount: number, target?: string) =>
      value("select record_financial_transaction($1,$2) v", [
        JSON.stringify({
          allocation_type: type,
          service_job_id: job,
          target_id: target,
          channel: "CASH",
          purpose: "VAT QA",
          amount,
          occurred_at: "2026-10-09T08:00:00Z",
        }),
        randomUUID(),
      ]);
    await post("CUSTOMER_VEHICLE", 59);
    await post("CUSTOMER_VEHICLE", 59);
    expect(
      await value(
        "select jsonb_build_object('gross',sum(amount),'net',sum(net_amount),'vat',sum(vat_amount)) v from cash_transactions where service_job_id=$1 and direction='IN'",
        [job],
      ),
    ).toEqual({ gross: 118, net: 100, vat: 18 });
    expect(
      await value(
        "select (r->>'customer_due')::numeric v from finance_data('jobs') r where r->>'id'=$1",
        [job],
      ),
    ).toBe("0.00");
    await post("SUPPLIER_PURCHASE", 118, purchase);
    expect(
      await value(
        "select jsonb_build_object('gross',amount,'net',net_amount,'vat',vat_amount) v from cash_transactions where purchase_id=$1",
        [purchase],
      ),
    ).toEqual({ gross: 118, net: 100, vat: 18 });
    expect(
      await value(
        "select sum(case direction when 'IN' then amount else -amount end)::text v from vat_ledger",
      ),
    ).toBe("50.00");
    expect(
      await value(
        "select (r->>'remaining')::numeric v from finance_data('purchases') r where r->>'id'=$1",
        [purchase],
      ),
    ).toBe("118.00");
  });
  it("rolls back the entire supplier payment when VAT funds are insufficient", async () => {
    await adjustment("BUDGET_PAYMENT", 45, {
      occurred_at: "2026-10-09T09:00:00Z",
    });
    await expect(
      value("select record_financial_transaction($1,$2) v", [
        JSON.stringify({
          allocation_type: "SUPPLIER_PURCHASE",
          service_job_id: job,
          target_id: purchase,
          channel: "CASH",
          purpose: "VAT QA",
          amount: 118,
          occurred_at: "2026-10-09T10:00:00Z",
        }),
        randomUUID(),
      ]),
    ).rejects.toThrow(/kifayət/);
    expect(
      await value(
        "select sum(amount)::text v from cash_transactions where purchase_id=$1",
        [purchase],
      ),
    ).toBe("118.00");
    expect(
      await value(
        "select sum(case direction when 'IN' then amount else -amount end)::text v from vat_ledger",
      ),
    ).toBe("5.00");
  });
  it("preserves net/VAT components on a paid return and actual refund", async () => {
    await adjustment("FUNDING", 100, { occurred_at: "2026-10-10T08:00:00Z" });
    const id = await buy(100);
    await payPurchase(id, 118);
    const returned = await value("select return_purchase($1,$2,$3) v", [
      id,
      JSON.stringify({
        quantity: 1,
        reason: "VAT return QA",
        occurred_at: "2026-10-11T08:00:00Z",
        handling: "CREDIT",
      }),
      randomUUID(),
    ]);
    expect(
      await value(
        "select jsonb_build_object('net',net_amount,'vat',vat_amount,'gross',amount,'credit',credit_amount,'credit_vat',credit_vat_amount) v from purchase_returns where id=$1",
        [returned],
      ),
    ).toEqual({ net: 100, vat: 18, gross: 118, credit: 118, credit_vat: 18 });
    const refund = await value("select refund_supplier_credit($1,$2,$3) v", [
      returned,
      JSON.stringify({
        amount: 118,
        channel: "CASH",
        occurred_at: "2026-10-11T09:00:00Z",
        purpose: "VAT refund QA",
      }),
      randomUUID(),
    ]);
    expect(
      await value(
        "select jsonb_build_object('net',net_amount,'vat',vat_amount,'gross',amount) v from cash_transactions where id=$1",
        [refund],
      ),
    ).toEqual({ net: 100, vat: 18, gross: 118 });
    expect(
      await value(
        "select kind v from vat_ledger where cash_transaction_id=$1",
        [refund],
      ),
    ).toBe("SUPPLIER_REFUND");
    expect(
      await value(
        "select (r->>'cost')::numeric v from finance_data('purchases') r where r->>'id'=$1",
        [id],
      ),
    ).toBe("0.00");
  });
  it("exchanges 100+18 for 150+27 using noncash credit with only 50+9 due", async () => {
    const id = await buy(100);
    await payPurchase(id, 118);
    const before = await value<number>(
      "select count(*)::integer v from cash_transactions",
    );
    const replacement = await value("select exchange_purchase($1,$2,$3) v", [
      id,
      JSON.stringify({
        new_name: "Replacement",
        new_quantity: 1,
        new_unit_price: 150,
        reason: "VAT exchange QA",
        occurred_at: "2026-10-11T08:00:00Z",
        handling: "CREDIT",
      }),
      randomUUID(),
    ]);
    expect(
      await value<number>("select count(*)::integer v from cash_transactions"),
    ).toBe(before);
    expect(
      await value(
        "select jsonb_build_object('net',net_amount,'vat',vat_amount,'gross',amount) v from supplier_credit_allocations where purchase_id=$1",
        [replacement],
      ),
    ).toEqual({ net: 100, vat: 18, gross: 118 });
    expect(
      await value(
        "select jsonb_build_object('net',r->'remaining_net','vat',r->'remaining_vat','gross',r->'remaining','cost',r->'cost') v from finance_data('purchases') r where r->>'id'=$1",
        [replacement],
      ),
    ).toEqual({ net: 50, vat: 9, gross: 59, cost: 150 });
  });
  it("protects settled VAT invoice prices but permits nonfinancial notes", async () => {
    await expect(
      db.query("update purchases set unit_price=101 where id=$1", [purchase]),
    ).rejects.toThrow(/ödənişləri ləğv/);
    await expect(
      db.query(
        "update job_work_items set customer_unit_price=101 where service_job_id=$1",
        [job],
      ),
    ).rejects.toThrow(/ödənişlərini ləğv/);
    await db.query(
      "update job_work_items set notes='Updated note' where service_job_id=$1",
      [job],
    );
    expect(
      await value(
        "select notes v from job_work_items where service_job_id=$1 limit 1",
        [job],
      ),
    ).toBe("Updated note");
  });
  it("reconciles final cents across real tiny customer payments", async () => {
    const catalog = await value("select id v from work_catalog limit 1");
    const micro = await value(
      "select create_workshop_job($1,$2,$3,'[]',$4) v",
      [
        JSON.stringify({ plate: "99-VT-015", make: "BMW", model: "QA" }),
        JSON.stringify({
          funding_source: "CUSTOMER_FUNDED",
          customer_name: "Rounding QA",
          vat_enabled: true,
        }),
        JSON.stringify([
          { catalogId: catalog, quotedPrice: "0.05", quantity: 1 },
        ]),
        randomUUID(),
      ],
    );
    await user(cashier);
    for (let i = 0; i < 6; i++)
      await value("select record_financial_transaction($1,$2) v", [
        JSON.stringify({
          allocation_type: "CUSTOMER_VEHICLE",
          service_job_id: micro,
          channel: "CASH",
          purpose: "VAT cent QA",
          amount: "0.01",
          occurred_at: "2026-10-12T08:00:00Z",
        }),
        randomUUID(),
      ]);
    expect(
      await value(
        "select jsonb_build_object('gross',sum(amount),'net',sum(net_amount),'vat',sum(vat_amount)) v from cash_transactions where service_job_id=$1",
        [micro],
      ),
    ).toEqual({ gross: 0.06, net: 0.05, vat: 0.01 });
    expect(
      await value(
        "select (r->>'customer_due')::numeric v from finance_data('jobs') r where r->>'id'=$1",
        [micro],
      ),
    ).toBe("0.00");
    await user(admin);
  });
});
