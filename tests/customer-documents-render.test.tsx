// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { ReportDocument } from "@/lib/report-pdf";
import { PrintReport } from "@/components/reports/print-report";
import { handoverReport } from "@/lib/reports/handover";
import { customerQuotation } from "@/lib/reports/customer-quotation";
import { canAccessPath } from "@/lib/security";
import type { DbServiceJob, DbWorkItem } from "@/lib/supabase/queries";

const job = { id: "qa", job_no: "QA-015", customer_name: "Əli Məmmədov", received_at: "2026-10-20T08:00:00Z",
  status: "IN_PROGRESS", has_line_quotes: true, vat_enabled: true, discount_type: "PERCENT", discount_value: 10,
  vehicles: { plate: "90-DS-015", make: "BMW", model: "Test" } } as DbServiceJob;
const work = Array.from({ length: 4 }, (_, i) => ({ id: String(i), service_job_id: "qa", quoted_price: 250,
  customer_unit_price: 250, quantity: 1, work_catalog: { name: `İş ${i + 1}: Ön qanadın təmiri, ölçü və şüşə yoxlanışı` },
  notes: "Azərbaycan hərfləri: ə ı ö ü ç ş ğ" })) as DbWorkItem[];
const reports = {
  acceptance: handoverReport("90-DS-015", { job, work: work.map((w) => w.work_catalog!.name) }),
  delivered: handoverReport("90-DS-015", { job: { ...job, status: "DELIVERED", delivered_at: "2026-10-21T08:00:00Z" }, work: [] }),
  discounted: customerQuotation(job, work, []),
  "acceptance-long": handoverReport("90-DS-015", { job, work: Array.from({ length: 50 }, (_, i) => `${i + 1}. Ön qanad və mühərrik yoxlanışı`) }),
};
describe("customer document PDF and print", () => {
  it.each(Object.entries(reports))("renders %s with matching print content", async (name, report) => {
    const pdf = await renderToBuffer(<ReportDocument report={report} />);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const html = renderToStaticMarkup(<PrintReport report={report} />);
    expect(html).toContain("Əli Məmmədov");
    expect(html).toContain("90-DS-015");
    expect(html).not.toContain("Hesab üzrə qalıq");
    if (name.startsWith("acceptance")) {
      expect(html).toContain("qaytarılması bu sənədlə təsdiqlənmir");
      expect(html).not.toContain("müştəriyə qaytarılmışdır");
    }
    if (name === "discounted") {
      expect(html).toContain("Endirim (10%)");
      expect(html).toContain("1 062,00");
    }
    if (name === "acceptance-long") expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
    if (process.env.PRIME_REPORT_QA_DIR) {
      mkdirSync(process.env.PRIME_REPORT_QA_DIR, { recursive: true });
      writeFileSync(path.join(process.env.PRIME_REPORT_QA_DIR, `${name}.pdf`), pdf);
      const css = readFileSync("app/globals.css", "utf8").replace('@import "tailwindcss";', "");
      writeFileSync(path.join(process.env.PRIME_REPORT_QA_DIR, `${name}.html`),
        `<!doctype html><html lang="az"><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`);
    }
  });
  it.each(["ADMIN", "INTAKE"] as const)("permits %s PDF and Print without allowing cashier handover", (role) => {
    expect(canAccessPath(role, "/api/reports/handover/pdf")).toBe(true);
    expect(canAccessPath(role, "/reports/handover/print")).toBe(true);
    expect(canAccessPath("CASHIER", "/api/reports/handover/pdf")).toBe(false);
    expect(canAccessPath("INTAKE", "/purchases")).toBe(false);
  });
});
