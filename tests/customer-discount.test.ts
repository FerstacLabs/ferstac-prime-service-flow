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
describe("original two-section paper document", () => {
  it.each(["2026-10-20", "2026-10-22"])("keeps both sections and a dynamic document date %s", (date) => {
    const report = handoverReport("90-DS-015", date);
    const text = JSON.stringify(report);
    expect(report.sections).toHaveLength(2);
    expect(report.sections.flatMap((s) => s.signatures)).toHaveLength(4);
    expect(text).not.toContain("qaytarılması bu sənədlə təsdiqlənmir");
    expect(text).not.toContain("Servis kartı:");
    expect(text).not.toContain('"İşlər"');
    expect(text).toContain("müştəriyə qaytarılmışdır");
    expect(text).toContain("90-DS-015");
    expect(text).toContain(date.split("-").reverse().join("/"));
    expect(job.status).toBe("IN_PROGRESS");
  });
  it("preserves the full original return clauses and signature arrangement", () => {
    const section = handoverReport("90-DS-015").sections[1];
    expect(section.paragraphs?.slice(1, 3)).toEqual([
      "a) Avtomobili təhvil alan (müştəri) hazırkı aktın 2-ci hissəsini imzalamaqla təsdiq edir ki, avtomobili təhvil alarkən onun vəziyyətini hərtərəfli yoxlamışdır və avtomobillə, habelə təmir edilmişdirsə təmiri ilə bağlı servisə qarşı hər hansı şikayəti, iddia və ya tələbi yoxdur və gələcəkdə də olmayacaqdır;",
      "b) Zəmanət çərçivəsində dəyişdirilən ehtiyat hissələri istisna edilməklə, avtomobildə hər hansı ehtiyat hissəsi yenisi ilə əvəz olunmuşdursa, köhnə ehtiyat hissəsi avtomobili təhvil alana (müştəriyə) təqdim edilmişdir.",
    ]);
    expect(section.signatures).toEqual(["Təhvil aldı (müştəri)", "Təhvil verdi (servis əməkdaşı)"]);
  });
});
