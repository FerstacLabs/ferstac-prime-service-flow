// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { cloneElement } from "react";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { workerCashFixture } from "./fixtures/worker-cash";
import { buildWorkshopReport } from "@/lib/reports/workshop-report";
import { parseFilters } from "@/lib/filters";
import { ReportDocument } from "@/lib/report-pdf";
import { reportBrand } from "@/lib/reports/brand";

function fixture() {
  const data = workerCashFixture();
  data.jobs[0] = {
    ...data.jobs[0],
    customer_name: "Test Müştəri",
    customer_phone: "+994 50 555 50 50",
    target_delivery_date: "2026-09-30",
    vehicles: {
      ...data.jobs[0].vehicles!,
      plate: "99-QA-505",
      make: "LIXIANG",
      model: "L7 PRO PLUG-IN HIBRID",
      production_year: 2025,
      color: "Qara",
      vin_body_number: "TESTL7PRO2026505",
    },
  };
  data.work = [800.75, 30.5].map((price, i) => ({
    ...data.work[0],
    id: `work-${i}`,
    quantity: 1,
    unit_catalog: { id: "unit", name: "Xidmət" },
    customer_unit_price: price,
    quoted_price: price,
    custom_title: i ? "Balans, montaj" : "Rəngsaz işi",
    cost_note: "INTERNAL WORK MAYA",
    notes: "Müştəri üçün qeyd",
  }));
  data.parts = [1300.5, 1070.25].map((price, i) => ({
    ...data.parts[0],
    id: `part-${i}`,
    quantity: 1,
    unit_catalog: { id: "unit", name: "Ədəd" },
    customer_unit_price: price,
    quoted_price: price,
    part_catalog: { name: i ? "Disk" : "Sağ ön qanad" },
    cost_note: "INTERNAL PART MAYA",
    notes: "Original detal üstünlükdür.",
  }));
  return data;
}
const reportFor = (data = fixture()) =>
  buildWorkshopReport("quotation", data, parseFilters({ job: "job" }));
describe("customer quotation whitelist and totals", () => {
  it("does not represent missing legacy quotes as zero or substitute the old budget", () => {
    const data = fixture();
    data.jobs[0].has_line_quotes = false;
    const report = reportFor(data);
    expect(
      report.sections[3].summary?.find((item) => item.label === "Yekun məbləğ")
        ?.value,
    ).toBe("Məlumat daxil edilməyib");
    expect(JSON.stringify(report)).not.toContain("agreed_budget");
  });
  it("shows real metadata, parts then work and exact 3202.00 total without legacy budget", () => {
    const report = reportFor();
    expect(report.sections.map((s) => s.title)).toEqual([
      "Avtomobil və müştəri",
      "Material və ehtiyat hissələri",
      "Görüləcək işlər",
      "Yekun",
    ]);
    expect(report.sections[3].summary).toContainEqual({
      label: "Yekun məbləğ",
      value: "3 202,00 AZN",
    });
    expect(JSON.stringify(report)).toContain("TESTL7PRO2026505");
    expect(report.sections[1].table?.rows[0].cells).toMatchObject({
      "2": "Ədəd",
      "3": "1",
      "4": "1 300,50",
      "5": "1 300,50",
    });
    const serialized = JSON.stringify(report);
    for (const forbidden of [
      "INTERNAL",
      "cost_note",
      "labor_cost",
      "profit",
      "cash_transactions",
      "agreed_budget",
      "Razılaşdırılmış",
      "worker-",
      "part-",
      "ƏDV",
    ])
      expect(serialized).not.toContain(forbidden);
  });
  it("adds insurance only for insurance jobs and keeps fractional measures on one A4 page", async () => {
    const data = fixture();
    data.jobs[0].insurance_approved_amount = 6500.75;
    expect(JSON.stringify(reportFor(data))).not.toContain("6 500,75");
    data.jobs[0].funding_source = "INSURANCE_CLAIM";
    data.jobs[0].insurance_company = "Test Sığorta";
    data.parts.push({
      ...data.parts[0],
      id: "liquid",
      part_catalog: { name: "Test maye" },
      quantity: 2.5,
      customer_unit_price: 18.4,
      quoted_price: 46,
      unit_catalog: { id: "litre", name: "Litr" },
    });
    const report = reportFor(data);
    expect(report.sections[3].summary).toContainEqual({
      label: "Yekun məbləğ",
      value: "3 248,00 AZN",
    });
    expect(JSON.stringify(report)).toContain("6 500,75 AZN");
    expect(report.sections[1].table?.rows[2].cells).toMatchObject({
      "2": "Litr",
      "3": "2,5",
      "4": "18,40",
      "5": "46,00",
    });
    const buffer = await renderToBuffer(<ReportDocument report={report} />);
    expect(buffer.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
  it("renders one A4 quotation with logo, Unicode, signatures and no internal information", async () => {
    type Node = { type?: string; value?: string; children?: Node[] };
    let text = "",
      images = 0;
    const walk = (node: Node) => {
      if (node.type === "IMAGE") images++;
      if (node.value) text += node.value + " ";
      node.children?.forEach(walk);
    };
    const buffer = await renderToBuffer(
      cloneElement(ReportDocument({ report: reportFor() }), {
        onRender: (data: { _INTERNAL__LAYOUT__DATA_: Node }) =>
          walk(data._INTERNAL__LAYOUT__DATA_),
      }),
    );
    if (process.env.PRIME_REPORT_QA_DIR) {
      mkdirSync(process.env.PRIME_REPORT_QA_DIR, { recursive: true });
      writeFileSync(
        path.join(process.env.PRIME_REPORT_QA_DIR, "customer-fixture.pdf"),
        buffer,
      );
    }
    expect(buffer.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(images).toBeGreaterThan(0);
    for (const expected of [
      reportBrand.company,
      reportBrand.address,
      "Test Müştəri",
      "3 202,00",
      "Servis nümayəndəsi",
      "İmza",
    ])
      expect(text).toContain(expected);
    for (const forbidden of [
      "INTERNAL",
      "Maya qeydi",
      "Mənfəət",
      "Kassa",
      "Təchizatçıya",
      "Usta mayası",
    ])
      expect(text).not.toContain(forbidden);
  }, 20000);
});
