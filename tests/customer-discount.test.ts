import { describe, expect, it } from "vitest";
import { discountedPricing, discountFromForm } from "@/lib/discount";
import { splitVatSettlement } from "@/lib/vat";
import { jobFinance } from "@/lib/workshop";
import { customerQuotation } from "@/lib/reports/customer-quotation";
import { handoverReport } from "@/lib/reports/handover";
import type { DbServiceJob, DbWorkItem } from "@/lib/supabase/queries";

const job = { id: "job", job_no: "QA-015", has_line_quotes: true, agreed_budget: 1000,
  status: "IN_PROGRESS", received_at: "2026-10-20T08:00:00Z", customer_name: "Test müştəri",
  vehicles: { plate: "90-DS-015", make: "BMW", model: "QA" } } as DbServiceJob;
const work = [{ id: "work", service_job_id: "job", quoted_price: 1000, labor_cost: 500,
  labor_cost_known: true, status: "DONE", work_catalog: { name: "Təmir" } }] as DbWorkItem[];
describe("shared customer discount pricing", () => {
  it.each([[0, "1000.00"], [10, "900.00"], [25, "750.00"], [100, "0.00"]])(
    "calculates %s percent using exact money", (value, expected) => {
      expect(discountedPricing("1000", { discount_type: "PERCENT", discount_value: value }).net).toBe(expected);
    });
  it("rounds half a cent consistently, then calculates VAT", () => {
    expect(discountedPricing("0.05", { discount_type: "PERCENT", discount_value: 10, vat_enabled: true }))
      .toMatchObject({ beforeDiscount: "0.05", discount: "0.01", net: "0.04", vat: "0.01", gross: "0.05" });
  });
  it.each(["-1", "100.01", "NaN", "Infinity", "1.001"])("rejects invalid percentage %s", (value) => {
    expect(() => discountedPricing(1000, { discount_type: "PERCENT", discount_value: value })).toThrow();
  });
  it("preserves old cards and actual costs while reducing profit, VAT and debt", () => {
    expect(jobFinance(job, work, [], [], []).quotedTotal).toBe(1000);
    const discounted = { ...job, discount_type: "PERCENT" as const, discount_value: 10, vat_enabled: true };
    const n = jobFinance(discounted, work, [], [], []);
    expect(n).toMatchObject({ beforeDiscount: 1000, discountAmount: 100, quotedTotal: 900,
      quotedVat: 162, quotedGross: 1062, customerReceivable: 1062, workCost: 500,
      grossProfit: 400, workProfit: 400, customerPaid: 0 });
    const pricing = discountedPricing(1000, discounted);
    expect(splitVatSettlement(pricing, 531)).toEqual({ net: "450.00", vat: "81.00", gross: "531.00" });
    expect(splitVatSettlement(pricing, 531, 531)).toEqual({ net: "450.00", vat: "81.00", gross: "531.00" });
    const summary = customerQuotation(discounted, work, []).sections.at(-1)?.summary;
    expect(summary).toContainEqual({ label: "Endirim (10%)", value: "100,00 AZN" });
    expect(summary).toContainEqual({ label: "Yekun ƏDV-li məbləğ", value: "1 062,00 AZN" });
  });
  it("does not silently accept a malformed discount form", () => {
    const form = new FormData();
    form.set("discount_type", "OTHER");
    expect(() => discountFromForm(form)).toThrow();
  });
  it("does not accelerate worker earnings or change agreed labor costs", () => {
    const discounted = { ...job, discount_type: "AMOUNT" as const, discount_value: 150 };
    const pending = [{ ...work[0], status: "IN_PROGRESS" as const }];
    const before = jobFinance(job, pending, [], [], []);
    const after = jobFinance(discounted, pending, [], [], []);
    expect(after.workerEarned).toBe(0);
    expect(after.workerPayable).toBe(0);
    expect(after.workerExpected).toBe(before.workerExpected);
    expect(after.workCost).toBe(before.workCost);
    expect(jobFinance(discounted, work, [], [], []).workerEarned).toBe(500);
  });
});
describe("acceptance versus return document", () => {
  it.each(["RECEIVED", "IN_PROGRESS", "READY"] as const)("does not attest return at %s", (status) => {
    const report = handoverReport("90-DS-015", { job: { ...job, status }, work: ["Təmir"] });
    const text = JSON.stringify(report);
    expect(text).toContain("Test müştəri");
    expect(text).toContain("20/10/2026");
    expect(text).toContain("qaytarılması bu sənədlə təsdiqlənmir");
    expect(text).not.toContain("müştəriyə qaytarılmışdır");
    expect(text).toContain("Təmir");
    expect(job.status).toBe("IN_PROGRESS");
  });
  it("retains return wording and actual return date for delivered vehicles", () => {
    const text = JSON.stringify(handoverReport("90-DS-015", {
      job: { ...job, status: "DELIVERED", delivered_at: "2026-10-22T08:00:00Z" }, work: [],
    }));
    expect(text).toContain("müştəriyə qaytarılmış");
    expect(text).toContain("22/10/2026");
  });
});
