// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { cloneElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrintReport } from "@/components/reports/print-report";
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

function sevenLineFixture() {
  const data = fixture();
  data.jobs[0] = {
    ...data.jobs[0],
    job_no: "PR-2026-D7AD48712DEE",
    received_at: "2026-09-20T00:00:00+04:00",
    customer_name: "Elvin Məmmədov",
    customer_phone: "+994 50 555 12 34",
    vehicles: {
      plate: "99-BZ-312",
      make: "BMW",
      model: "F30 328i",
      vin_body_number: "WBA3A5C50DF000321",
    } as (typeof data.jobs)[0]["vehicles"],
  };
  data.parts = [
    [
      "Sağ ön qanad",
      950,
      "BMW F30 uyğun sağ ön qanad. Rənglənməyə hazır vəziyyətdə alınacaq.",
    ],
    [
      "Ön bamper sağ kronşteyn",
      220,
      "Ön bamperin sağ tərəf bərkidici kronşteyni.",
    ],
    [
      "Sağ ön fara",
      780,
      "BMW F30 üçün sağ ön fara. Alınmazdan əvvəl işlək vəziyyəti yoxlanılacaq.",
    ],
  ].map(([name, price, notes], i) => ({
    ...data.parts[0],
    id: `part-${i}`,
    part_catalog: { name: String(name) },
    customer_unit_price: Number(price),
    quoted_price: Number(price),
    notes: String(notes),
  }));
  data.work = [
    [
      "Ban/kuzov geometriyasının ölçülməsi",
      450,
      "Sağ ön hissədə geometriya və zavod ölçüləri yoxlanılacaq.",
    ],
    [
      "Sağ ön qanadın düzəldilməsi və hazırlanması",
      650,
      "Qanad düzəldiləcək, səth boya üçün hazırlanacaq.",
    ],
    [
      "Ön bamperin sökülməsi/quraşdırılması",
      300,
      "Bamper söküləcək, dayaqlar yoxlanılacaq və təmirdən sonra yenidən quraşdırılacaq.",
    ],
    [
      "Boya sonrası cilalama",
      250,
      "Təmir olunan hissələr son mərhələdə cilalanacaq və səth yoxlanılacaq.",
    ],
  ].map(([name, price, notes], i) => ({
    ...data.work[0],
    id: `work-${i}`,
    custom_title: String(name),
    customer_unit_price: Number(price),
    quoted_price: Number(price),
    notes: String(notes),
  }));
  return data;
}
describe("customer quotation whitelist and totals", () => {
  it("keeps the seven-line reference, confirmation, total and signatures on one A4 page", async () => {
    const report = reportFor(sevenLineFixture());
    const ending = report.sections[3];
    expect(ending.summary).toContainEqual({
      label: "Yekun məbləğ",
      value: "3 600,00 AZN",
    });
    expect(ending.paragraphs?.[0]).toContain(
      "dəymiş zərərin həcmi 3 600,00 AZN təşkil edir.",
    );
    expect(ending.bullets).toHaveLength(2);
    const html = renderToStaticMarkup(<PrintReport report={report} />);
    expect(html.indexOf("Yekun məbləğ")).toBeLessThan(
      html.indexOf("Zərər dəymiş"),
    );
    expect(html.indexOf("qiymətləndirmə tarixinə")).toBeLessThan(
      html.indexOf("Ad/Soyad:"),
    );
    for (const value of [
      reportBrand.company,
      reportBrand.address,
      "Servis nümayəndəsi",
      "İmza:",
      "3 600,00 AZN",
      "öz imzalarımızla təsdiq edirik",
    ])
      expect(html).toContain(value.replaceAll("&", "&amp;"));
    for (const value of [
      "INTERNAL",
      "Maya qeydi",
      "labor_cost",
      "supplier debt",
      "Kassa",
      "PAŞA",
      "worker-",
      "part-",
    ])
      expect(html).not.toContain(value);
    const pdf = await renderToBuffer(<ReportDocument report={report} />);
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
    if (process.env.PRIME_REPORT_QA_DIR) {
      mkdirSync(process.env.PRIME_REPORT_QA_DIR, { recursive: true });
      writeFileSync(
        path.join(process.env.PRIME_REPORT_QA_DIR, "quotation-seven-lines.pdf"),
        pdf,
      );
      writeFileSync(
        path.join(
          process.env.PRIME_REPORT_QA_DIR,
          "quotation-seven-lines.html",
        ),
        html,
      );
    }
  }, 20000);

  it("does not invent a confirmation amount for unknown legacy quotes", () => {
    const data = sevenLineFixture();
    data.jobs[0].has_line_quotes = false;
    const report = reportFor(data);
    expect(report.sections[3].paragraphs?.[0]).toContain(
      "__________________ AZN",
    );
    expect(report.sections[3].paragraphs?.[0]).not.toContain("3 600,00");
  });

  it("paginates a larger quotation without dropping rows or the confirmation", async () => {
    const data = sevenLineFixture();
    data.work = Array.from({ length: 40 }, (_, i) => ({
      ...data.work[i % 4],
      id: `long-${i}`,
      custom_title: `İş ${i + 1}: ${data.work[i % 4].custom_title}`,
    }));
    const report = reportFor(data);
    type Node = { value?: string; children?: Node[] };
    let text = "";
    const walk = (node: Node) => {
      if (node.value) text += node.value + " ";
      node.children?.forEach(walk);
    };
    const pdf = await renderToBuffer(
      cloneElement(ReportDocument({ report }), {
        onRender: (data: { _INTERNAL__LAYOUT__DATA_: Node }) =>
          walk(data._INTERNAL__LAYOUT__DATA_),
      }),
    );
    expect(
      pdf.toString("latin1").match(/\/Type \/Page\b/g)!.length,
    ).toBeGreaterThan(1);
    for (let i = 1; i <= 40; i++) expect(text).toContain(`İş ${i}:`);
    expect(text).toContain("dəymiş zərərin həcmi 18 450,00 AZN təşkil edir.");
    expect(text).toContain("Servis nümayəndəsi");
    expect(text).not.toContain("INTERNAL");
    if (process.env.PRIME_REPORT_QA_DIR) {
      mkdirSync(process.env.PRIME_REPORT_QA_DIR, { recursive: true });
      writeFileSync(
        path.join(process.env.PRIME_REPORT_QA_DIR, "quotation-long.pdf"),
        pdf,
      );
      writeFileSync(
        path.join(process.env.PRIME_REPORT_QA_DIR, "quotation-long.html"),
        renderToStaticMarkup(<PrintReport report={report} />),
      );
    }
  }, 20000);
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
