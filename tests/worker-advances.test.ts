import { describe, it, expect } from "vitest";
import { workerCashFixture } from "./fixtures/worker-cash";
import { parseFilters } from "@/lib/filters";
import { selectCash } from "@/lib/supabase/workshop";
import { cashFlow, jobFinance, missingValue } from "@/lib/workshop";
import {
  workerWorkFinance,
  workerFinance,
  selectWorkerFinances,
  workerPaymentHistory,
} from "@/lib/worker-finance";
import { buildWorkshopReport } from "@/lib/reports/workshop-report";

function fixture(paid = 0) {
  const data = workerCashFixture();
  data.work[0] = {
    ...data.work[0],
    status: "IN_PROGRESS",
    labor_cost: 500,
    completed_at: null,
  };
  data.cash[2].amount = paid;
  if (!paid) data.cash.splice(2, 1);
  return data;
}

describe("worker advances against agreed cost", () => {
  it.each([
    ["IN_PROGRESS", 0, 0, 0, 0, 500, true],
    ["IN_PROGRESS", 200, 0, 200, 0, 300, true],
    ["IN_PROGRESS", 500, 0, 500, 0, 0, false],
    ["DONE", 200, 500, 0, 300, 300, true],
    ["DONE", 500, 500, 0, 0, 0, false],
    ["TODO", 200, 0, 200, 0, 300, true],
  ] as const)(
    "%s with %i paid has separate earnings and advance",
    (status, paid, earned, advance, outstanding, remaining, canPay) => {
      const data = fixture(paid);
      data.work[0].status = status;
      expect(workerWorkFinance(data.work[0], data.cash)).toMatchObject({
        known: true,
        paid,
        earned,
        advance,
        outstanding,
        remaining,
        canPay,
      });
    },
  );

  it("requires a known positive remaining cost, an assignee and non-cancelled work", () => {
    const data = fixture(),
      work = data.work[0];
    work.labor_cost_known = false;
    expect(workerWorkFinance(work, data.cash)).toMatchObject({
      known: false,
      remaining: null,
      canPay: false,
    });
    expect(workerFinance(data, "worker", parseFilters({})).missing).toBe(1);
    work.labor_cost_known = true;
    work.labor_cost = 0;
    expect(workerWorkFinance(work, data.cash)).toMatchObject({
      known: true,
      remaining: 0,
      canPay: false,
    });
    expect(workerFinance(data, "worker", parseFilters({})).missing).toBe(0);
    work.labor_cost = 500;
    work.assigned_worker_id = null;
    expect(workerWorkFinance(work, data.cash).canPay).toBe(false);
    work.assigned_worker_id = "worker";
    work.status = "CANCELLED";
    expect(workerWorkFinance(work, data.cash).canPay).toBe(false);
  });

  it("sums per-allocation debt and advances without cross-work netting", () => {
    const data = fixture(200);
    data.work.push({
      ...data.work[0],
      id: "earned-work",
      labor_cost: 300,
      status: "DONE",
      completed_at: "2026-09-19",
    });
    expect(workerFinance(data, "worker", parseFilters({}))).toMatchObject({
      earned: 300,
      paid: 200,
      advance: 200,
      outstanding: 300,
      remaining: 600,
      expected: 500,
    });
    expect(
      jobFinance(
        data.jobs[0],
        data.work,
        data.parts,
        data.purchases,
        data.cash,
      ),
    ).toMatchObject({
      workerEarned: 300,
      workerPaid: 200,
      workerAdvance: 200,
      workerPayable: 300,
      workerRemaining: 600,
    });
    const workers = selectWorkerFinances(
      data,
      parseFilters({ balance: "outstanding", worker: "worker" }),
    );
    expect(workers).toHaveLength(1);
  });

  it("recognizes active full prepayment in paid/advance filters, but never as earned debt", () => {
    const data = fixture(500),
      f = { worker: "worker" };
    expect(
      selectWorkerFinances(data, parseFilters({ ...f, balance: "paid" })),
    ).toHaveLength(1);
    expect(
      selectWorkerFinances(data, parseFilters({ ...f, balance: "advance" })),
    ).toHaveLength(1);
    expect(
      selectWorkerFinances(
        data,
        parseFilters({ ...f, balance: "outstanding" }),
      ),
    ).toHaveLength(0);
    data.work.push({
      ...data.work[0],
      id: "cancelled-unpaid",
      status: "CANCELLED",
    });
    expect(
      selectWorkerFinances(data, parseFilters({ ...f, balance: "paid" })),
    ).toHaveLength(1);
    data.cash[2].amount = 200;
    expect(
      selectWorkerFinances(data, parseFilters({ ...f, balance: "paid" })),
    ).toHaveLength(0);
  });

  it("counts advances as cash OUT on payment date without changing profit", () => {
    const data = fixture(200);
    data.cash[0].amount = 1700;
    data.cash[1].amount = 200;
    data.cash[2].transaction_date = "2026-09-20";
    const before = jobFinance(
      data.jobs[0],
      data.work,
      data.parts,
      data.purchases,
      data.cash.filter((t) => t.id !== "worker-first"),
    );
    const after = jobFinance(
      data.jobs[0],
      data.work,
      data.parts,
      data.purchases,
      data.cash,
    );
    expect(after.grossProfit).toBe(before.grossProfit);
    expect(after.workCost).toBe(before.workCost);
    const selected = selectCash(
      data,
      parseFilters({ job: "job", from: "2026-09-19", to: "2026-09-20" }),
    );
    expect(cashFlow(selected)).toEqual({
      cashIn: 1700,
      cashOut: 400,
      netCashFlow: 1300,
    });
    expect(
      cashFlow(
        selectCash(
          data,
          parseFilters({ from: "2026-09-20", to: "2026-09-20" }),
        ),
      ),
    ).toEqual({ cashIn: 0, cashOut: 200, netCashFlow: -200 });
  });

  it("keeps dated payment history across completion and excludes audit voids from balances", () => {
    const data = fixture(200),
      before = structuredClone(data.cash);
    const history = () => workerPaymentHistory(data, [data.work[0]]);
    expect(history()[0]).toMatchObject({ advance: 200, earned: 0 });
    data.work[0].status = "DONE";
    data.work[0].completed_at = "2026-09-21";
    expect(history()[0]).toMatchObject({
      advance: 0,
      earned: 500,
      outstanding: 300,
    });
    expect(data.cash).toEqual(before);
    data.cash[2].voided_at = "2026-09-22";
    data.cash[2].void_reason = "Səhv ödəniş";
    expect(history()).toHaveLength(1);
    expect(workerWorkFinance(data.work[0], data.cash)).toMatchObject({
      paid: 0,
      outstanding: 500,
      remaining: 500,
    });
  });

  it("preserves any historical cancelled payments without offering new payment", () => {
    const data = fixture(200);
    data.work[0].status = "CANCELLED";
    expect(workerWorkFinance(data.work[0], data.cash)).toMatchObject({
      earned: 0,
      paid: 200,
      advance: 200,
      outstanding: 0,
      canPay: false,
    });
    expect(workerPaymentHistory(data, [data.work[0]])).toHaveLength(1);
    expect(
      jobFinance(data.jobs[0], data.work, data.parts, data.purchases, data.cash)
        .workerAdvance,
    ).toBe(200);
  });

  it("shares advance/remaining report values and filters while keeping customer quotes read-only and nullable", () => {
    const data = fixture(200),
      f = parseFilters({
        worker: "worker",
        view: "workers",
        balance: "advance",
        from: "2026-09-01",
        to: "2026-09-30",
      });
    data.work[0].quoted_price = null;
    const report = buildWorkshopReport("kassa", data, f);
    expect(report.sections[0].table?.columns.map((c) => c.label)).toContain(
      "Qalan razılaşdırılmış usta məbləği",
    );
    expect(report.sections[0].table?.rows[0].cells).toMatchObject({
      "2": missingValue,
      "3": "500,00 AZN",
      "4": "0,00 AZN",
      "5": "200,00 AZN",
      "6": "200,00 AZN",
      "7": "0,00 AZN",
      "8": "300,00 AZN",
    });
    expect(report.summary.find((s) => s.label === "Avans")?.value).toBe(
      "200,00 AZN",
    );
    expect(report.filters).toContain("Avansı olanlar");
    expect(report.filters).toContain("Emre Altin");
    expect(JSON.stringify(report)).not.toContain("Qanad təmiri");
    expect(report.sections[1].table?.rows).toHaveLength(1);
    const quote = JSON.stringify(
      buildWorkshopReport("quotation", data, parseFilters({ job: "job" })),
    );
    expect(quote).not.toContain("Avans");
    expect(quote).not.toContain("Usta mayası");
    for (const scope of ["vehicle", "overview", "kassa"] as const) {
      const report = buildWorkshopReport(
        scope,
        data,
        parseFilters({ job: "job" }),
      );
      expect(JSON.stringify(report)).toContain("Usta avansı");
      expect(JSON.stringify(report)).not.toContain("-200,00");
    }
  });
});
