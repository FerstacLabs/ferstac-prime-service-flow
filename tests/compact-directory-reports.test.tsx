// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cloneElement } from "react";
import { workerCashFixture } from "./fixtures/worker-cash";
import { parseFilters, filterQuery } from "@/lib/filters";
import { profitSummary, profitReason } from "@/lib/profit-status";
import { jobFinance } from "@/lib/workshop";
import { workerFinance, selectWorkerFinances } from "@/lib/worker-finance";
import {
  selectSupplierFinances,
  supplierFinance,
} from "@/lib/supplier-finance";
import { buildWorkshopReport } from "@/lib/reports/workshop-report";
import { ReportDocument } from "@/lib/report-pdf";
import { PrintReport } from "@/components/reports/print-report";
import { documentFilename } from "@/lib/reports/document-filename";
import { canReport } from "@/lib/security";

function fixture() {
  const d = workerCashFixture();
  d.suppliers = [
    {
      id: "supplier",
      company_name: "Əli Ehtiyat",
      active: true,
      tax_id_voen: "123",
      phone: "0501111111",
    },
    {
      id: "archived",
      company_name: "Arxiv Təchizat",
      active: false,
      tax_id_voen: "456",
      phone: "0502222222",
    },
  ] as typeof d.suppliers;
  d.purchases[0].supplier_id = "supplier";
  d.cash.find((t) => t.id === "supplier")!.amount = 50;
  return d;
}
describe("compact directory reports and profit status", () => {
  it("keeps replacement quantities and units independent of the original requirement", () => {
    const d = fixture();
    const original = d.purchases[0];
    original.quantity = 4;
    original.unit_name = "Ədəd";
    d.purchases.push({
      ...original,
      id: "replacement-quantity",
      replacement_of: original.id,
      quantity: 2.5,
      unit_name: "Litr",
      custom_item_name: "Əvəz maye",
    });
    const report = buildWorkshopReport(
      "purchases",
      d,
      parseFilters({ visibility: "all" }),
    );
    const table = report.sections.find(
      (s) => s.title === "Alış tarixçəsi",
    )!.table!;
    expect(table.rows.find((r) => r.id === original.id)?.cells).toMatchObject({
      quantity: "4",
      unit: "Ədəd",
    });
    expect(
      table.rows.find((r) => r.id === "replacement-quantity")?.cells,
    ).toMatchObject({ quantity: "2,5", unit: "Litr" });
  });
  it("shows only completed-cost profit as partial and gives specific missing-cost reasons", () => {
    const d = fixture();
    d.work[0].labor_cost_known = false;
    const rows = d.jobs.map((j) =>
      jobFinance(j, d.work, d.parts, d.purchases, d.cash),
    );
    expect(profitSummary(rows)).toMatchObject({
      amount: 50,
      status: "Qismən hesablanıb",
    });
    expect(profitSummary(rows).explanation).toContain("1 servis kartında");
    expect(profitReason(rows[0])).toBe("Usta maya məlumatı tamamlanmayıb.");
    expect(profitReason({ ...rows[0], missingWork: 0, missingParts: 1 })).toBe(
      "1 detal üçün faktiki maya daxil edilməyib.",
    );
    expect(
      profitReason({ ...rows[0], missingWork: 1, missingParts: 1 }),
    ).toContain("2 xərc");
    expect(profitSummary([rows[0]]).amount).toBeNull();
    const before = rows[1].grossProfit;
    d.cash = [];
    expect(
      jobFinance(d.jobs[1], d.work, d.parts, d.purchases, d.cash).grossProfit,
    ).toBe(before);
  });
  it("keeps the main workers report one row per filtered worker without private profile/history", () => {
    const d = fixture();
    d.workers[0].phone = "PRIVATE PHONE";
    d.workers[0].notes = "PRIVATE NOTES";
    d.workers[0].role_id = "role";
    const f = parseFilters({ q: "Emre", status: "active", role: "role" }),
      report = buildWorkshopReport("workers", d, f);
    expect(report.sections).toHaveLength(1);
    expect(report.sections[0].table?.rows).toHaveLength(1);
    expect(report.title).toBe("İşçilər üzrə ümumi hesabat");
    const text = JSON.stringify(report);
    for (const s of [
      "PRIVATE PHONE",
      "PRIVATE NOTES",
      "Müştəri qiyməti",
      "Ödəniş tarixçəsi",
      "Ata adı",
    ])
      expect(text).not.toContain(s);
    expect(selectWorkerFinances(d, f)).toHaveLength(1);
    expect(filterQuery(f)).toContain("q=Emre");
  });
  it("counts unallocated general advances once, without reducing arbitrary work debt", () => {
    const d = fixture();
    d.cash.push({
      ...d.cash[2],
      id: "general",
      allocation_type: "GENERAL_OUT",
      work_item_id: null,
      amount: 80,
      worker_identity_id: "worker",
    });
    expect(workerFinance(d, "worker", parseFilters({}))).toMatchObject({
      advance: 80,
      paid: 100,
      outstanding: 150,
    });
    d.work[0].applied_advance = 30;
    expect(workerFinance(d, "worker", parseFilters({}))).toMatchObject({
      advance: 50,
      paid: 130,
      outstanding: 120,
    });
  });
  it("reconciles supplier list, individual summary and detailed purchase report using identical filters", () => {
    const d = fixture(),
      f = parseFilters({ status: "active", balance: "outstanding" });
    const n = selectSupplierFinances(d, f);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ cost: 120, paid: 50, remaining: 70 });
    expect(
      supplierFinance(d, parseFilters({ supplier: "supplier" })),
    ).toMatchObject({ cost: 120, paid: 50, remaining: 70 });
    const main = buildWorkshopReport("suppliers", d, f),
      detail = buildWorkshopReport(
        "purchases",
        d,
        parseFilters({ supplier: "supplier" }),
      );
    expect(main.sections).toHaveLength(1);
    expect(main.sections[0].table?.rows).toHaveLength(1);
    expect(main.summary.find((s) => s.label === "Qalıq borc")?.value).toBe(
      detail.summary.find((s) => s.label === "Qalıq borc")?.value,
    );
    expect(detail.sections.some((s) => s.title === "Alış tarixçəsi")).toBe(
      true,
    );
    expect(
      selectSupplierFinances(d, parseFilters({ status: "archived" }))[0]
        .supplier.id,
    ).toBe("archived");
    expect(
      selectSupplierFinances(d, parseFilters({ q: "456" }))[0].supplier.id,
    ).toBe("archived");
    expect(
      selectSupplierFinances(d, parseFilters({ balance: "closed" })),
    ).toHaveLength(1);
    expect(selectSupplierFinances(d, parseFilters({}))).toHaveLength(2);
    expect(
      selectSupplierFinances(
        d,
        parseFilters({ from: "2026-10-01", balance: "outstanding" }),
      ),
    ).toHaveLength(0);
  });
  it("keeps worker/supplier report access restricted", () => {
    expect(canReport("INTAKE", "workers")).toBe(false);
    expect(canReport("INTAKE", "suppliers")).toBe(false);
    expect(canReport("CASHIER", "suppliers")).toBe(false);
    expect(canReport("ADMIN", "suppliers")).toBe(true);
  });
  it("keeps an explicitly selected worker in the main summary and classifies linked advances", () => {
    const d = fixture();
    const summary = buildWorkshopReport(
      "workers",
      d,
      parseFilters({ worker: "worker" }),
    );
    expect(summary.sections).toHaveLength(1);
    expect(summary.title).toBe("İşçilər üzrə ümumi hesabat");
    expect(documentFilename(summary)).toMatch(/^PRIME_Isciler-Umumi_/);
    expect(documentFilename(buildWorkshopReport("suppliers", d))).toMatch(
      /^PRIME_Techizatcilar-Umumi_/,
    );
    d.cash[2].counterparty_details = { payment_kind: "WORKER_ADVANCE" };
    const individual = buildWorkshopReport(
      "workers",
      d,
      parseFilters({ worker: "worker", detail: "worker" }),
    );
    expect(individual.sections[2].table?.rows[0].cells).toMatchObject({
      "2": "Usta avansı",
      "3": "-",
      "4": "100,00",
    });
  });
  it("paginates large directories with repeated table headings and no lost rows", async () => {
    const d = fixture();
    d.workers = Array.from({ length: 80 }, (_, i) => ({
      ...d.workers[0],
      id: `worker-${i}`,
      first_name: `Əli ${i}`,
    }));
    d.suppliers = Array.from({ length: 80 }, (_, i) => ({
      ...d.suppliers[0],
      id: `supplier-${i}`,
      company_name: `Təchizatçı ${i}`,
    }));
    type Node = { type?: string; value?: string; children?: Node[] };
    const texts = (node: Node): string =>
      [node.value || "", ...(node.children || []).map(texts)].join(" ");
    for (const scope of ["workers", "suppliers"] as const) {
      const r = buildWorkshopReport(scope, d);
      expect(r.sections[0].table?.rows).toHaveLength(80);
      const buffer = await renderToBuffer(
        cloneElement(ReportDocument({ report: r }), {
          onRender: ({
            _INTERNAL__LAYOUT__DATA_: layout,
          }: {
            _INTERNAL__LAYOUT__DATA_: Node;
          }) => {
            expect(layout.children!.length).toBeGreaterThan(1);
            for (const page of layout.children!)
              expect(texts(page)).toContain(
                scope === "workers" ? "Qazanılmış" : "VÖEN",
              );
          },
        }),
      );
      if (process.env.PRIME_REPORT_QA_DIR)
        writeFileSync(
          path.join(process.env.PRIME_REPORT_QA_DIR, `${scope}-long.pdf`),
          buffer,
        );
    }
  }, 20000);
  it("renders compact Unicode A4 reports and matching print structure", async () => {
    const d = fixture();
    d.cash[2].reference_number = "PR-2026-CA7BA7689455-IS-07f7979a";
    d.work.push({
      ...d.work[0],
      id: "second",
      custom_title: "Şüşə və güzgü yoxlanışı",
    });
    for (const [name, scope, f] of [
      ["workers", "workers", {}],
      ["worker", "workers", { worker: "worker", detail: "worker" }],
      ["suppliers", "suppliers", { status: "active", balance: "outstanding" }],
    ] as const) {
      const r = buildWorkshopReport(scope, d, parseFilters(f));
      const buffer = await renderToBuffer(<ReportDocument report={r} />);
      expect(
        buffer.toString("latin1").match(/\/Type \/Page\b/g)?.length,
      ).toBeLessThanOrEqual(2);
      const html = renderToStaticMarkup(<PrintReport report={r} />);
      expect(html).toContain(r.title);
      expect(html).toContain("print-overview");
      expect(documentFilename(r)).toMatch(/^PRIME_/);
      expect(documentFilename(r)).not.toContain("undefined");
      if (name === "worker") {
        expect(r.sections).toHaveLength(3);
        expect(r.sections[1].table?.rows).toHaveLength(2);
        expect(r.sections[2].table?.rows).toHaveLength(1);
        expect(JSON.stringify(r)).not.toContain("Müştəri qiyməti");
        expect(
          r.sections[2].table?.rows[0].cells["6"].replaceAll("\n", ""),
        ).toContain(d.cash[2].reference_number);
      }
      if (process.env.PRIME_REPORT_QA_DIR) {
        mkdirSync(process.env.PRIME_REPORT_QA_DIR, { recursive: true });
        writeFileSync(
          path.join(process.env.PRIME_REPORT_QA_DIR, `${name}-compact.pdf`),
          buffer,
        );
      }
    }
  }, 20000);
});
