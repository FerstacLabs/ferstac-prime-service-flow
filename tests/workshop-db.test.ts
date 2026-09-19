// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
let db: PGlite,
  job: string,
  work: string,
  part: string,
  purchase: string,
  worker: string,
  supplier: string;
async function scalar<T = string>(sql: string, params: unknown[] = []) {
  return (await db.query<{ value: T }>(sql, params)).rows[0]?.value;
}
async function pay(
  type: string,
  target: string,
  amount: number,
  key = randomUUID(),
) {
  return scalar(
    "select record_cash_payment($1,$2,$3,$4,'2026-09-18',null,$5) as value",
    [job, type, target, amount, key],
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(
    `create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${owner}'),('${other}'); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$; set app.uid='${owner}';`,
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/0001_prime_flow_schema.sql",
      "utf8",
    ).replace('create extension if not exists "pgcrypto";', ""),
  );
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  // Historical paid purchase must be converted once, without touching its original cost.
  await db.exec(
    `insert into vehicles(id,owner_user_id,plate,make,model) values('20000000-0000-4000-8000-000000000001','${owner}','10-AA-100','BMW','F30'); insert into service_jobs(id,owner_user_id,vehicle_id,job_no,agreed_budget) values('30000000-0000-4000-8000-000000000001','${owner}','20000000-0000-4000-8000-000000000001','OLD',1000); insert into suppliers(id,owner_user_id,entity_type,company_name) values('40000000-0000-4000-8000-000000000001','${owner}','LEGAL_ENTITY','Tarixi təchizatçı'); insert into purchases(owner_user_id,service_job_id,custom_item_name,quantity,unit_price,supplier_id,payment_status,paid_amount) values('${owner}','30000000-0000-4000-8000-000000000001','Əvvəlki detal',1,500,'40000000-0000-4000-8000-000000000001','PARTIAL',200);`,
  );
  await db.exec(
    readFileSync("supabase/migrations/0002_workshop_finance.sql", "utf8"),
  );
  await db.exec(
    "create role authenticated; grant usage on schema public,auth to authenticated; grant select,insert,update,delete on all tables in schema public to authenticated; grant select on auth.users to authenticated; grant execute on all functions in schema public,auth to authenticated; set role authenticated;",
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("workshop PostgreSQL workflow", () => {
  it("preserves and backfills historical supplier payments exactly once", async () => {
    expect(
      Number(
        await scalar("select sum(amount) as value from cash_transactions"),
      ),
    ).toBe(200);
    expect(
      Number(await scalar("select sum(paid_amount) as value from purchases")),
    ).toBe(200);
  });
  it("creates persistent deduplicated catalogs and atomically saves intake", async () => {
    const wc = await scalar<{ id: string }>(
      "select create_catalog_entry('work',' Plastik   bamper təmiri ') as value",
    );
    const duplicate = await scalar<{ id: string }>(
      "select create_catalog_entry('work','plastik bamper təmiri') as value",
    );
    expect(duplicate.id).toBe(wc.id);
    const pc = await scalar<{ id: string }>(
      "select create_catalog_entry('part','Sol ön qanad') as value",
    );
    job = randomUUID();
    const payload = [
      JSON.stringify({ plate: "99-AA-999", make: "BMW", model: "F30" }),
      JSON.stringify({
        funding_source: "CUSTOMER_FUNDED",
        agreed_budget: 1150,
      }),
      JSON.stringify([
        { catalogId: wc.id, quotedPrice: 350, note: "Plastik təmiri" },
      ]),
      JSON.stringify([
        { catalogId: pc.id, quotedPrice: 800, note: "Sol qanad" },
      ]),
      job,
    ];
    expect(
      await scalar(
        "select create_workshop_job($1,$2,$3,$4,$5) as value",
        payload,
      ),
    ).toBe(job);
    expect(
      await scalar(
        "select create_workshop_job($1,$2,$3,$4,$5) as value",
        payload,
      ),
    ).toBe(job);
    work = await scalar(
      "select id as value from job_work_items where service_job_id=$1",
      [job],
    );
    part = await scalar(
      "select id as value from job_required_parts where service_job_id=$1",
      [job],
    );
    expect(
      Number(
        await scalar(
          "select count(*) as value from job_work_items where service_job_id=$1",
          [job],
        ),
      ),
    ).toBe(1);
    const bad = randomUUID();
    await expect(
      scalar("select create_workshop_job($1,$2,$3,$4,$5) as value", [
        JSON.stringify({ plate: "88-AA-888", make: "BMW", model: "F30" }),
        payload[1],
        JSON.stringify([
          { catalogId: randomUUID(), quotedPrice: 350, note: "" },
        ]),
        "[]",
        bad,
      ]),
    ).rejects.toThrow();
    expect(
      Number(
        await scalar("select count(*) as value from service_jobs where id=$1", [
          bad,
        ]),
      ),
    ).toBe(0);
    expect(
      Number(
        await scalar(
          "select count(*) as value from vehicles where plate='88-AA-888'",
        ),
      ),
    ).toBe(0);
  });
  it("purchases intake requirement with one central partial settlement", async () => {
    supplier = await scalar(
      "insert into suppliers(owner_user_id,entity_type,company_name) values(auth.uid(),'LEGAL_ENTITY','Test Parts') returning id as value",
    );
    purchase = randomUUID();
    const payload = {
      service_job_id: job,
      required_part_id: part,
      quantity: 1,
      unit_price: 520,
      source_type: "SUPPLIER",
      supplier_id: supplier,
      purchased_by_admin: true,
      payment_status: "PARTIAL",
      paid_amount: 200,
      purchase_date: "2026-09-18",
    };
    expect(
      await scalar("select save_workshop_purchase($1,$2) as value", [
        JSON.stringify(payload),
        purchase,
      ]),
    ).toBe(purchase);
    await scalar("select save_workshop_purchase($1,$2) as value", [
      JSON.stringify(payload),
      purchase,
    ]);
    expect(
      Number(
        await scalar(
          "select sum(amount) as value from cash_transactions where purchase_id=$1",
          [purchase],
        ),
      ),
    ).toBe(200);
    expect(
      Number(
        await scalar(
          "select quoted_price as value from job_required_parts where id=$1",
          [part],
        ),
      ),
    ).toBe(800);
    await expect(
      scalar("select save_workshop_purchase($1,$2) as value", [
        JSON.stringify(payload),
        randomUUID(),
      ]),
    ).rejects.toThrow();
  });
  it("rejects duplicate quote rows, excessive notes and fractional cents at the database boundary", async () => {
    await expect(
      db.query(
        "insert into job_work_items(owner_user_id,service_job_id,work_catalog_id,quoted_price) select owner_user_id,service_job_id,work_catalog_id,quoted_price from job_work_items where id=$1",
        [work],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into job_required_parts(owner_user_id,service_job_id,part_catalog_id,quoted_price) select owner_user_id,service_job_id,part_catalog_id,quoted_price from job_required_parts where id=$1",
        [part],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("update job_work_items set notes=$1 where id=$2", [
        "x".repeat(251),
        work,
      ]),
    ).rejects.toThrow();
    await expect(pay("CUSTOMER_PART", part, 0.001)).rejects.toThrow();
    expect(
      await scalar("select notes as value from job_work_items where id=$1", [
        work,
      ]),
    ).toBe("Plastik təmiri");
  });
  it("derives operational status and only permits earned worker settlements", async () => {
    const role = await scalar<{ id: string }>(
      "select create_catalog_entry('role','Dəmirçi') as value",
    );
    worker = await scalar(
      "insert into workers(owner_user_id,first_name,last_name,role_id) values(auth.uid(),'Test','Usta',$1) returning id as value",
      [role.id],
    );
    await db.query(
      "update job_work_items set assigned_worker_id=$1,status='IN_PROGRESS',labor_cost=180,labor_cost_known=true where id=$2",
      [worker, work],
    );
    expect(
      await scalar("select status as value from service_jobs where id=$1", [
        job,
      ]),
    ).toBe("IN_PROGRESS");
    await expect(pay("WORKER_WORK_ITEM", work, 100)).rejects.toThrow();
    await db.query("update job_work_items set status='DONE' where id=$1", [
      work,
    ]);
    expect(
      await scalar("select status as value from service_jobs where id=$1", [
        job,
      ]),
    ).toBe("READY");
  });
  it("settles all three directions independently without overpayment or duplicates", async () => {
    const key = randomUUID();
    await pay("CUSTOMER_WORK", work, 350, key);
    await pay("CUSTOMER_WORK", work, 350, key);
    await pay("CUSTOMER_PART", part, 150);
    await pay("SUPPLIER_PURCHASE", purchase, 320);
    await pay("WORKER_WORK_ITEM", work, 100);
    expect(
      Number(
        await scalar(
          "select sum(amount) as value from cash_transactions where service_job_id=$1 and direction='IN'",
          [job],
        ),
      ),
    ).toBe(500);
    expect(
      Number(
        await scalar("select paid_amount as value from purchases where id=$1", [
          purchase,
        ]),
      ),
    ).toBe(520);
    expect(
      await scalar(
        "select payment_status as value from purchases where id=$1",
        [purchase],
      ),
    ).toBe("PAID");
    await expect(pay("CUSTOMER_WORK", work, 1)).rejects.toThrow();
    await expect(pay("SUPPLIER_PURCHASE", purchase, 1)).rejects.toThrow();
    await expect(pay("WORKER_WORK_ITEM", work, 81)).rejects.toThrow();
    await expect(
      db.query("update purchases set paid_amount=1 where id=$1", [purchase]),
    ).rejects.toThrow();
    await expect(
      db.query("update job_work_items set labor_cost=99 where id=$1", [work]),
    ).rejects.toThrow();
    await expect(
      db.query(
        "update job_work_items set assigned_worker_id=null where id=$1",
        [work],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("delete from purchases where id=$1", [purchase]),
    ).rejects.toThrow();
  });
  it("RLS and relationship guards reject cross-owner reads and allocations", async () => {
    await db.exec(`set app.uid='${other}'`);
    expect(
      Number(await scalar("select count(*) as value from cash_transactions")),
    ).toBe(0);
    await expect(pay("CUSTOMER_PART", part, 1)).rejects.toThrow();
    await expect(
      db.query(
        "insert into job_work_items(owner_user_id,service_job_id,custom_title) values(auth.uid(),$1,'Cross tenant')",
        [job],
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "update suppliers set company_name='Cross tenant' where id=$1 returning id",
          [supplier],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "update workers set first_name='Cross tenant' where id=$1 returning id",
          [worker],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "update job_work_items set notes='Cross tenant' where id=$1 returning id",
          [work],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "update cash_transactions set voided_at=now(),void_reason='Cross tenant' where service_job_id=$1 returning id",
          [job],
        )
      ).rows,
    ).toHaveLength(0);
    await db.exec(`set app.uid='${owner}'`);
  });
  it("voids with audit reason, synchronizes balances, and prohibits historical mutation", async () => {
    const payment = await scalar(
      "select id as value from cash_transactions where purchase_id=$1 and amount=320",
      [purchase],
    );
    await expect(
      db.query("update cash_transactions set amount=1 where id=$1", [payment]),
    ).rejects.toThrow();
    await expect(
      db.query("update cash_transactions set voided_at=now() where id=$1", [
        payment,
      ]),
    ).rejects.toThrow();
    await db.query(
      "update cash_transactions set voided_at=now(),void_reason='Səhv ödəniş' where id=$1",
      [payment],
    );
    expect(
      Number(
        await scalar("select paid_amount as value from purchases where id=$1", [
          purchase,
        ]),
      ),
    ).toBe(200);
    await expect(
      db.query("update cash_transactions set voided_at=null where id=$1", [
        payment,
      ]),
    ).rejects.toThrow();
    await db.query("update service_jobs set status='DELIVERED' where id=$1", [
      job,
    ]);
    await db.query("update job_work_items set status='DONE' where id=$1", [
      work,
    ]);
    expect(
      await scalar("select status as value from service_jobs where id=$1", [
        job,
      ]),
    ).toBe("DELIVERED");
  });
  it("updates repeat-intake registration without erasing earlier optional details", async () => {
    await db.query(
      "update vehicles set color='Qara',vin_body_number='WBA00000000000000' where plate='99-AA-999'",
    );
    const catalogId = await scalar(
      "select work_catalog_id as value from job_work_items where id=$1",
      [work],
    );
    await scalar("select create_workshop_job($1,$2,$3,$4,$5) as value", [
      JSON.stringify({
        plate: "99-AA-999",
        make: "BMW",
        model: "F30",
        color: "Ağ",
        registered_owner_address: "Bakı",
      }),
      JSON.stringify({ funding_source: "CUSTOMER_FUNDED", agreed_budget: 100 }),
      JSON.stringify([{ catalogId, quotedPrice: 100, note: "" }]),
      "[]",
      randomUUID(),
    ]);
    expect(
      await scalar(
        "select color as value from vehicles where plate='99-AA-999'",
      ),
    ).toBe("Ağ");
    expect(
      await scalar(
        "select vin_body_number as value from vehicles where plate='99-AA-999'",
      ),
    ).toBe("WBA00000000000000");
    expect(
      await scalar(
        "select registered_owner_address as value from vehicles where plate='99-AA-999'",
      ),
    ).toBe("Bakı");
  });
  it("archives and restores the service card without changing any financial history", async () => {
    const snapshot = () =>
      scalar(
        "select jsonb_build_object('work',(select jsonb_agg(w) from job_work_items w where service_job_id=$1),'parts',(select jsonb_agg(p) from job_required_parts p where service_job_id=$1),'purchases',(select jsonb_agg(p) from purchases p where service_job_id=$1),'cash',(select jsonb_agg(c) from cash_transactions c where service_job_id=$1)) as value",
        [job],
      );
    const before = await snapshot();
    await db.query("update service_jobs set archived_at=now() where id=$1", [
      job,
    ]);
    expect(
      await scalar(
        "select archived_at is not null as value from service_jobs where id=$1",
        [job],
      ),
    ).toBe(true);
    expect(await snapshot()).toEqual(before);
    await db.exec(`set app.uid='${other}'`);
    expect(
      (
        await db.query(
          "update service_jobs set archived_at=null where id=$1 returning id",
          [job],
        )
      ).rows,
    ).toHaveLength(0);
    await db.exec(`set app.uid='${owner}'`);
    await db.query("update service_jobs set archived_at=null where id=$1", [
      job,
    ]);
    expect(
      await scalar(
        "select archived_at is null as value from service_jobs where id=$1",
        [job],
      ),
    ).toBe(true);
    expect(await snapshot()).toEqual(before);
  });
  it("enforces per-work worker settlement limits even for the same worker and job", async () => {
    const second = await scalar(
      "insert into job_work_items(owner_user_id,service_job_id,assigned_worker_id,custom_title,quoted_price,labor_cost,labor_cost_known,status) values(auth.uid(),$1,$2,'İkinci iş',90,70,true,'DONE') returning id as value",
      [job, worker],
    );
    await pay("WORKER_WORK_ITEM", second, 30);
    await expect(pay("WORKER_WORK_ITEM", second, 41)).rejects.toThrow();
    expect(
      Number(
        await scalar(
          "select sum(amount) as value from cash_transactions where allocation_type='WORKER_WORK_ITEM' and work_item_id=$1 and voided_at is null",
          [second],
        ),
      ),
    ).toBe(30);
    expect(
      Number(
        await scalar(
          "select sum(amount) as value from cash_transactions where allocation_type='WORKER_WORK_ITEM' and work_item_id=$1 and voided_at is null",
          [work],
        ),
      ),
    ).toBe(100);
  });
});
