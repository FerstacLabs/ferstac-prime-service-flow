import { describe, it, expect } from "vitest";
import { workerCashFixture } from "./fixtures/worker-cash";
import { parseFilters, filterQuery } from "@/lib/filters";
import {
  selectJobs,
  selectWork,
  selectPurchases,
  selectCash,
} from "@/lib/supabase/workshop";
import {
  jobFinance,
  missingCostDescription,
  canGenerateHandover,
  cashFlow,
} from "@/lib/workshop";
import {
  workerFinance,
  workerWorkFinance,
  selectWorkerFinances,
  workerPaymentHistory,
} from "@/lib/worker-finance";
import { buildWorkshopReport } from "@/lib/reports/workshop-report";

describe("archive and cashier refinements", () => {
  it("hides soft-deleted work from active operations without hiding ledger history", () => {
    const data = workerCashFixture(),
      f = parseFilters({});
    const before = selectCash(data, f);
    data.jobs[0].deleted_at = "2026-09-23";
    data.jobs[0].archived_at = "2026-09-23";
    expect(selectJobs(data, f).some((j) => j.id === "job")).toBe(false);
    expect(selectWork(data, f).some((w) => w.service_job_id === "job")).toBe(
      false,
    );
    expect(
      selectPurchases(data, f).some((p) => p.service_job_id === "job"),
    ).toBe(false);
    expect(selectCash(data, f)).toEqual(before);
  });
  it("keeps archive visibility separate from operational status and preserves it in URLs", () => {
    const data = workerCashFixture();
    expect(selectJobs(data).map((j) => j.id)).toEqual(["job"]);
    expect(
      selectJobs(data, parseFilters({ visibility: "archived" })).map(
        (j) => j.id,
      ),
    ).toEqual(["older"]);
    expect(selectJobs(data, parseFilters({ visibility: "all" }))).toHaveLength(
      2,
    );
    expect(
      selectJobs(
        data,
        parseFilters({ visibility: "all", status: "READY" }),
      ).map((j) => j.id),
    ).toEqual(["job"]);
    expect(selectJobs(data, parseFilters({}), true)).toHaveLength(2);
    expect(
      filterQuery(parseFilters({ visibility: "archived", plate: "77zz777" })),
    ).toContain("visibility=archived");
  });
  it("retains archived finance reports and handover eligibility", () => {
    const data = workerCashFixture();
    data.jobs[0].archived_at = "2026-09-19";
    expect(
      JSON.stringify(
        buildWorkshopReport("vehicle", data, parseFilters({ job: "job" })),
      ),
    ).toContain("150,00");
    expect(canGenerateHandover(data.jobs[0].status)).toBe(true);
    data.jobs[0].archived_at = null;
    expect(selectJobs(data).map((j) => j.id)).toEqual(["job"]);
  });
  it("hides zero missing-cost warnings in every internal financial report", () => {
    const data = workerCashFixture(),
      n = jobFinance(
        data.jobs[0],
        data.work,
        data.parts,
        data.purchases,
        data.cash,
      );
    expect(missingCostDescription(n)).toBeNull();
    for (const scope of ["vehicle", "overview", "kassa"] as const)
      expect(
        JSON.stringify(
          buildWorkshopReport(scope, data, parseFilters({ job: "job" })),
        ),
      ).not.toContain("Maya daxil edilməyib");
  });
  it("only names the genuinely missing cost categories", () => {
    expect(missingCostDescription({ missingWork: 2, missingParts: 0 })).toBe(
      "2 iş",
    );
    expect(missingCostDescription({ missingWork: 0, missingParts: 1 })).toBe(
      "1 detal",
    );
    expect(missingCostDescription({ missingWork: 2, missingParts: 3 })).toBe(
      "2 iş, 3 detal",
    );
    const data = workerCashFixture();
    data.work[0].labor_cost_known = false;
    data.work[0].labor_cost = 0;
    const report = JSON.stringify(
      buildWorkshopReport("vehicle", data, parseFilters({ job: "job" })),
    );
    expect(report).toContain("Maya daxil edilməyib");
    expect(report).toContain("1 iş");
    expect(report).not.toContain("0 detal");
  });
  it("recognizes explicitly zero labor and customer-provided parts as known costs", () => {
    const data = workerCashFixture();
    data.work[0].labor_cost = 0;
    data.purchases[0].source_type = "CUSTOMER_PROVIDED";
    data.purchases[0].unit_price = 0;
    data.purchases[0].total_price = 0;
    data.cash = [];
    const n = jobFinance(
      data.jobs[0],
      data.work,
      data.parts,
      data.purchases,
      data.cash,
    );
    expect(n).toMatchObject({
      missingWork: 0,
      missingParts: 0,
      totalCost: 0,
      grossProfit: 800,
    });
    expect(missingCostDescription(n)).toBeNull();
  });
  it("allocates each worker payment to the exact work item and keeps profit unchanged", () => {
    const data = workerCashFixture(),
      before = jobFinance(
        data.jobs[0],
        data.work,
        data.parts,
        data.purchases,
        data.cash,
      ),
      beforeCash = cashFlow(data.cash);
    expect(workerWorkFinance(data.work[0], data.cash)).toMatchObject({
      earned: 250,
      paid: 100,
      outstanding: 150,
    });
    data.cash.push({ ...data.cash[2], id: "second-payment", amount: 150 });
    expect(workerWorkFinance(data.work[0], data.cash)).toMatchObject({
      earned: 250,
      paid: 250,
      outstanding: 0,
    });
    expect(workerWorkFinance(data.work[1], data.cash).paid).toBe(20);
    expect(cashFlow(data.cash).cashOut).toBe(beforeCash.cashOut + 150);
    expect(cashFlow(data.cash).netCashFlow).toBe(beforeCash.netCashFlow - 150);
    expect(
      jobFinance(data.jobs[0], data.work, data.parts, data.purchases, data.cash)
        .grossProfit,
    ).toBe(before.grossProfit);
  });
  it("does not create earned payable for active work or count voided payments", () => {
    const data = workerCashFixture();
    data.cash[2].voided_at = "2026-09-19";
    expect(workerWorkFinance(data.work[0], data.cash)).toMatchObject({
      paid: 0,
      outstanding: 250,
    });
    data.work[0].status = "IN_PROGRESS";
    data.work[0].completed_at = null;
    expect(workerFinance(data, "worker", parseFilters({}))).toMatchObject({
      earned: 0,
      expected: 250,
      outstanding: 0,
    });
  });
  it("matches worker/period/debt filters between Kassa and its report", () => {
    const data = workerCashFixture(),
      f = parseFilters({
        view: "workers",
        worker: "worker",
        from: "2026-09-01",
        to: "2026-09-30",
        balance: "outstanding",
      });
    const selected = selectWorkerFinances(data, f);
    expect(selected).toHaveLength(1);
    expect(selected[0].items.map((w) => w.id)).toEqual(["work"]);
    const report = buildWorkshopReport("kassa", data, f),
      text = JSON.stringify(report);
    expect(report.filters).toContain("Emre Altin");
    expect(report.filters).toContain("01.09.2026");
    expect(text).toContain("500,00");
    expect(text).toContain("250,00");
    expect(text).toContain("150,00");
    expect(text).not.toContain("Qanad təmiri");
    expect(
      selectWorkerFinances(
        data,
        parseFilters({
          view: "workers",
          from: "2026-07-01",
          to: "2026-07-31",
          balance: "outstanding",
        }),
      ),
    ).toHaveLength(0);
    expect(
      selectWorkerFinances(data, parseFilters({ balance: "paid" })),
    ).toHaveLength(0);
    data.cash.push({ ...data.cash[2], id: "balance-paid", amount: 150 });
    expect(
      selectWorkerFinances(data, parseFilters({ balance: "paid" })).map(
        (n) => n.worker.id,
      ),
    ).toEqual(["worker"]);
  });
  it("shows complete attributable payment history for the period's selected work", () => {
    const data = workerCashFixture();
    data.cash[2].transaction_date = "2026-10-01";
    const n = workerFinance(
      data,
      "worker",
      parseFilters({ from: "2026-09-01", to: "2026-09-30" }),
    );
    const history = workerPaymentHistory(data, n.items);
    expect(n.paid).toBe(100);
    expect(history).toHaveLength(1);
    expect(history[0].item.id).toBe("work");
    expect(history[0].job?.vehicles?.plate).toBe("77-ZZ-777");
  });
  it("only enables handover for ready and delivered service jobs", () => {
    expect(canGenerateHandover("READY")).toBe(true);
    expect(canGenerateHandover("DELIVERED")).toBe(true);
    for (const status of ["WAITING", "IN_PROGRESS", "PAUSED"] as const)
      expect(canGenerateHandover(status)).toBe(false);
  });
});
