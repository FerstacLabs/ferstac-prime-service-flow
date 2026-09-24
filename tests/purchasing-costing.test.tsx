// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { workerCashFixture } from "./fixtures/worker-cash";
import { buildWorkshopReport } from "@/lib/reports/workshop-report";
import { parseFilters } from "@/lib/filters";
import { ReportDocument } from "@/lib/report-pdf";
import { PrintReport } from "@/components/reports/print-report";
import { jobFinance } from "@/lib/workshop";
import { reportBrand } from "@/lib/reports/brand";

function fixture() {
  const data = workerCashFixture();
  const supplier = {
    id: "supplier",
    entity_type: "LEGAL_ENTITY" as const,
    company_name: "Sınaq Təchizat MMC",
    shop_name: null,
    first_name: null,
    last_name: null,
    father_name: null,
    tax_id_voen: "1234567890",
    phone: "+994 50 555 55 55",
    address: "Bakı, sınaq ünvanı",
    notes: null,
    active: true,
  };
  data.suppliers = [supplier];
  data.parts = [950, 220, 780].map((price, i) => ({
    ...data.parts[0],
    id: `p${i}`,
    quantity: i === 2 ? 2.5 : 1,
    customer_unit_price: i === 2 ? 312 : price,
    quoted_price: price,
    unit_catalog: { id: "unit", name: i === 2 ? "Litr" : "Ədəd" },
    part_catalog: {
      name: ["Sağ ön qanad", "Ön bamper sağ kronşteyn", "Sürətlər qutusu yağı"][
        i
      ],
    },
    cost_note: "PRIVATE COST NOTE",
  }));
  data.purchases = [600.75, 219.25, 420].map((cost, i) => ({
    ...data.purchases[0],
    id: `buy${i}`,
    required_part_id: `p${i}`,
    custom_item_name: data.parts[i].part_catalog!.name,
    unit_price: cost,
    total_price: cost,
    supplier_id: supplier.id,
    suppliers: supplier,
    purchased_by_admin: i === 0,
    purchased_by_worker_id: i === 0 ? null : "worker",
    workers: data.workers[0],
    notes: "Orijinal detal, yoxlanılıb.",
    part_code_oem: `OEM-${i}`,
    document_no: `INV-${i}`,
    paid_amount: [200.5, 119.5, 100][i],
    payment_status: "PARTIAL",
  }));
  data.cash = [200.5, 119.5, 100].map((amount, i) => ({
    ...data.cash[1],
    id: `cash${i}`,
    purchase_id: `buy${i}`,
    amount,
  }));
  return data;
}

describe("purchasing workflow and compact reports", () => {
  it("keeps additional revenue/cost in final finances without changing the initial quotation", () => {
    const data = workerCashFixture(),
      job = data.jobs[0];
    const initial = buildWorkshopReport(
      "quotation",
      data,
      parseFilters({ job: job.id }),
    );
    const before = jobFinance(
      job,
      data.work,
      data.parts,
      data.purchases,
      data.cash,
    );
    data.work.push({
      ...data.work[0],
      id: "extra",
      custom_title: "Əlavə qol işi",
      is_additional: true,
      quoted_price: 300.5,
      customer_unit_price: 300.5,
      labor_cost: 180.25,
      labor_cost_known: true,
      status: "TODO",
      cost_note: "PRIVATE",
    });
    const after = jobFinance(
      job,
      data.work,
      data.parts,
      data.purchases,
      data.cash,
    );
    expect(after.quotedTotal - before.quotedTotal).toBe(300.5);
    expect(after.workCost - before.workCost).toBe(180.25);
    expect(after.grossProfit! - before.grossProfit!).toBe(120.25);
    const quote = buildWorkshopReport(
      "quotation",
      data,
      parseFilters({ job: job.id }),
    );
    expect(quote.sections).toEqual(initial.sections);
    expect(JSON.stringify(quote)).not.toContain("PRIVATE");
    data.cash.push({
      ...data.cash[2],
      id: "advance",
      work_item_id: "extra",
      amount: 100,
    });
    expect(
      jobFinance(job, data.work, data.parts, data.purchases, data.cash)
        .grossProfit,
    ).toBe(after.grossProfit);
  });
  it("adds later quotes to a legacy budget without resetting the budget or double counting old lines", () => {
    const data = workerCashFixture(),
      job = { ...data.jobs[0], has_line_quotes: false, agreed_budget: 1000 };
    data.work.push({
      ...data.work[0],
      id: "extra",
      is_additional: true,
      quoted_price: 300.5,
    });
    data.parts.push({
      ...data.parts[0],
      id: "extra-part",
      is_additional: true,
      quoted_price: 46,
    });
    expect(
      jobFinance(job, data.work, data.parts, data.purchases, data.cash)
        .quotedTotal,
    ).toBe(1346.5);
  });
  it.each(["all", "supplier", "vehicle"])(
    "renders the compact %s purchase scope with quantity, Unicode and one summary band",
    async (scope) => {
      const data = fixture();
      const report = buildWorkshopReport(
        "purchases",
        data,
        parseFilters(
          scope === "supplier"
            ? { supplier: "supplier" }
            : scope === "vehicle"
              ? { job: "job" }
              : {},
        ),
      );
      const table = report.sections.at(-1)!.table!;
      expect(table.rows).toHaveLength(3);
      expect(report.summary).toContainEqual({
        label: "Faktiki maya",
        value: "1 240,00 AZN",
      });
      expect(report.summary).toContainEqual({
        label: "Ödənilib",
        value: "420,00 AZN",
      });
      expect(report.summary).toContainEqual({
        label: "Qalıq borc",
        value: "820,00 AZN",
      });
      expect(table.rows[2].cells.quantity).toBe("2,5 Litr");
      expect(table.rows.every((r) => (r.details?.length ?? 0) <= 1)).toBe(true);
      if (scope === "supplier")
        expect(table.columns.some((c) => c.key === "supplier")).toBe(false);
      if (scope === "vehicle")
        expect(table.columns.some((c) => c.key === "vehicle")).toBe(false);
      const html = renderToStaticMarkup(<PrintReport report={report} />);
      expect(html).toContain("print-purchases");
      expect(html).toContain(reportBrand.company.replace("&", "&amp;"));
      expect(html).toContain("2,5 Litr");
      if (scope === "supplier")
        expect(html.match(/Sınaq Təchizat MMC/g)).toHaveLength(1);
      if (scope === "vehicle") expect(html.match(/77-ZZ-777/g)).toHaveLength(1);
      const pdf = await renderToBuffer(<ReportDocument report={report} />);
      expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
      if (process.env.PRIME_REPORT_QA_DIR) {
        mkdirSync(process.env.PRIME_REPORT_QA_DIR, { recursive: true });
        writeFileSync(
          path.join(process.env.PRIME_REPORT_QA_DIR, `purchases-${scope}.pdf`),
          pdf,
        );
        writeFileSync(
          path.join(process.env.PRIME_REPORT_QA_DIR, `purchases-${scope}.html`),
          html,
        );
      }
    },
  );
  it("paginates a long purchase report while retaining every purchase", async () => {
    const data = fixture();
    data.purchases = Array.from({ length: 60 }, (_, i) => ({
      ...data.purchases[i % 3],
      id: `long${i}`,
      custom_item_name: `Detal ${i + 1}: ${data.purchases[i % 3].custom_item_name}`,
    }));
    const report = buildWorkshopReport("purchases", data, parseFilters({}));
    expect(report.sections.at(-1)!.table!.rows).toHaveLength(60);
    const pdf = await renderToBuffer(<ReportDocument report={report} />);
    expect(
      pdf.toString("latin1").match(/\/Type \/Page\b/g)!.length,
    ).toBeGreaterThan(1);
    if (process.env.PRIME_REPORT_QA_DIR) {
      writeFileSync(
        path.join(process.env.PRIME_REPORT_QA_DIR, "purchases-long.pdf"),
        pdf,
      );
      writeFileSync(
        path.join(process.env.PRIME_REPORT_QA_DIR, "purchases-long.html"),
        renderToStaticMarkup(<PrintReport report={report} />),
      );
    }
  }, 20000);
});
