import { describe, it, expect } from "vitest";
import {
  jobFinance,
  cashFlow,
  sumMoney,
  type RequiredPart,
  type CashTransaction,
} from "@/lib/workshop";
import type {
  DbServiceJob,
  DbWorkItem,
  DbPurchase,
} from "@/lib/supabase/queries";
import { parseFilters, bakuDate } from "@/lib/filters";
import { buildWorkshopReport } from "@/lib/reports/workshop-report";
import {
  selectWork,
  selectPurchases,
  selectJobs,
  selectCash,
  type WorkshopData,
} from "@/lib/supabase/workshop";
const job = {
  id: "job",
  job_no: "PR-1",
  agreed_budget: 1200,
  has_line_quotes: true,
  status: "READY",
  funding_source: "CUSTOMER_FUNDED",
  received_at: "2026-09-18T10:00:00Z",
  vehicles: { plate: "99-AA-999", make: "BMW", model: "F30" },
} as DbServiceJob;
const work = {
  id: "work",
  service_job_id: "job",
  quoted_price: 350,
  labor_cost: 180,
  labor_cost_known: true,
  status: "DONE",
  work_catalog_id: "catalog",
  assigned_worker_id: "worker",
  planned_at: "2026-09-18T10:00:00Z",
  completed_at: "2026-09-18T11:00:00Z",
  custom_title: "Plastik bamper təmiri",
} as DbWorkItem;
const part = {
  id: "part",
  service_job_id: "job",
  quoted_price: 800,
  part_catalog_id: "part-catalog",
  part_catalog: { name: "Sol ön qanad" },
  notes: "",
} as RequiredPart;
const purchase = {
  id: "purchase",
  service_job_id: "job",
  required_part_id: "part",
  supplier_id: "supplier",
  source_type: "SUPPLIER",
  total_price: 520,
  quantity: 1,
  unit_price: 520,
  paid_amount: 520,
  payment_status: "PAID",
  purchase_date: "2026-09-18",
  custom_item_name: "Sol ön qanad",
} as DbPurchase;
const payment = (
  type: CashTransaction["allocation_type"],
  amount: number,
): CashTransaction => ({
  id: `${type}-${amount}`,
  service_job_id: "job",
  allocation_type: type,
  amount,
  direction: type.startsWith("CUSTOMER") ? "IN" : "OUT",
  work_item_id: type.includes("WORK") ? "work" : null,
  required_part_id: type === "CUSTOMER_PART" ? "part" : null,
  purchase_id: type === "SUPPLIER_PURCHASE" ? "purchase" : null,
  transaction_date: "2026-09-18",
  notes: null,
  voided_at: null,
  void_reason: null,
});
const cash = [
  payment("CUSTOMER_WORK", 350),
  payment("CUSTOMER_PART", 150),
  payment("SUPPLIER_PURCHASE", 200),
  payment("SUPPLIER_PURCHASE", 320),
  payment("WORKER_WORK_ITEM", 100),
];
const data: WorkshopData = {
  jobs: [job],
  work: [work],
  parts: [part],
  purchases: [purchase],
  cash,
  workers: [],
  suppliers: [],
};
describe("workshop finance and report boundary", () => {
  it("matches the acceptance scenario and never adds legacy paid_amount to ledger", () => {
    expect(jobFinance(job, [work], [part], [purchase], cash)).toMatchObject({
      quotedTotal: 1150,
      totalCost: 700,
      grossProfit: 450,
      customerPaid: 500,
      customerReceivable: 650,
      supplierPaid: 520,
      supplierPayable: 0,
      workerPaid: 100,
      workerPayable: 80,
      workProfit: 170,
      partProfit: 280,
    });
    expect(cashFlow(cash)).toEqual({
      cashIn: 500,
      cashOut: 620,
      netCashFlow: -120,
    });
  });
  it("keeps profit independent of cash receipts and voids", () => {
    const before = jobFinance(job, [work], [part], [purchase], []),
      after = jobFinance(job, [work], [part], [purchase], cash);
    expect(before.grossProfit).toBe(after.grossProfit);
    expect(before.customerReceivable).toBe(1150);
    expect(
      cashFlow(cash.map((t) => ({ ...t, voided_at: "2026-09-18" }))),
    ).toEqual({ cashIn: 0, cashOut: 0, netCashFlow: 0 });
  });
  it("does not invent zero costs or line margins for legacy budgets", () => {
    expect(
      jobFinance(
        job,
        [{ ...work, labor_cost: 0, labor_cost_known: false }],
        [part],
        [],
        [],
      ),
    ).toMatchObject({ grossProfit: null, missingWork: 1, missingParts: 1 });
    expect(
      jobFinance(
        { ...job, has_line_quotes: false },
        [{ ...work, quoted_price: null }],
        [],
        [],
        [],
      ),
    ).toMatchObject({ quotedTotal: 1200, grossProfit: null, workProfit: null });
  });
  it("separates expected work from earned payables and excludes customer-provided supplier debt", () => {
    expect(
      jobFinance(
        job,
        [{ ...work, status: "IN_PROGRESS" }],
        [part],
        [{ ...purchase, source_type: "CUSTOMER_PROVIDED", total_price: 0 }],
        [],
      ),
    ).toMatchObject({
      workerEarned: 0,
      workerExpected: 180,
      workerPayable: 0,
      supplierPayable: 0,
      partsCost: 0,
    });
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });
  it("customer quote never serializes internal accounting fields or amounts", () => {
    const report = buildWorkshopReport(
        "quotation",
        data,
        parseFilters({ job: "job" }),
      ),
      text = JSON.stringify(report);
    expect(text).toContain("350,00 AZN");
    expect(text).toContain("800,00 AZN");
    expect(text).toContain("1 150,00 AZN");
    for (const amount of ["520,00", "180,00", "450,00"])
      expect(text).not.toContain(amount);
    for (const field of ["supplier", "labor_cost", "Maya", "mənfəət", "borc"])
      expect(text).not.toContain(field);
    const internal = JSON.stringify(
      buildWorkshopReport("vehicle", data, parseFilters({ job: "job" })),
    );
    for (const amount of ["700,00", "450,00", "650,00", "80,00"])
      expect(internal).toContain(amount);
  });
  it("normalizes Baku periods and applies shared query/report filters", () => {
    expect(bakuDate("2026-09-18T22:30:00Z")).toBe("2026-09-19");
    expect(bakuDate("2026-09-18")).toBe("2026-09-18");
    expect(parseFilters({ plate: "99aa999" }).plate).toBe("99-AA-999");
    expect(
      selectJobs(data, parseFilters({ status: "IN_PROGRESS" })),
    ).toHaveLength(0);
    expect(
      selectWork(
        data,
        parseFilters({
          worker: "worker",
          work: "catalog",
          status: "DONE",
          from: "2026-09-18",
          to: "2026-09-18",
        }),
      ),
    ).toHaveLength(1);
    expect(selectWork(data, parseFilters({ status: "TODO" }))).toHaveLength(0);
    expect(
      selectPurchases(data, parseFilters({ payment: "PARTIAL" })),
    ).toHaveLength(0);
    expect(
      selectPurchases(
        data,
        parseFilters({ supplier: "supplier", from: "2026-09-18" }),
      ),
    ).toHaveLength(1);
    expect(
      selectCash(
        data,
        parseFilters({ type: "CUSTOMER_PART", direction: "IN" }),
      ),
    ).toHaveLength(1);
    expect(selectJobs(data, parseFilters({ balance: "closed" }))).toHaveLength(
      0,
    );
    const report = buildWorkshopReport(
      "work",
      data,
      parseFilters({ status: "TODO" }),
    );
    expect(report.sections[0].table?.rows).toHaveLength(0);
  });
  it("reproduces blank signatures and current-date handover without customer names", () => {
    const report = buildWorkshopReport(
      "handover",
      data,
      parseFilters({ job: "job" }),
    );
    expect(report.sections).toHaveLength(2);
    expect(report.sections.flatMap((s) => s.signatures)).toHaveLength(4);
    expect(JSON.stringify(report)).toContain("99-AA-999");
    expect(JSON.stringify(report)).not.toContain("2026-cı il");
  });
});
