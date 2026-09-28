// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { financialCategoryLabel, financialLabel } from "@/lib/finance-labels";
import {
  auditDetail,
  auditEventLabel,
  auditRoleLabel,
  auditEntityLabel,
} from "@/lib/audit-display";
import { AuditDetail } from "@/components/audit-detail";
import { auditActions, type AuditLog } from "@/lib/audit";
import { workQueueReport } from "@/lib/reports/work-queue-report";
import { ReportDocument } from "@/lib/report-pdf";
import { PrintReport } from "@/components/reports/print-report";
import { parseFilters } from "@/lib/filters";
import type { WorkQueue } from "@/lib/work-queue";
vi.mock("@/components/reports/print-trigger", () => ({
  PrintTrigger: () => null,
  PrintButton: () => null,
}));

const log: AuditLog = {
  id: "log",
  actor_user_id: "actor",
  actor_username_snapshot: "admin",
  actor_role_snapshot: "ADMIN",
  action: "PURCHASE_UPDATED",
  entity_type: "purchases",
  entity_id: "secret-id",
  service_job_id: null,
  vehicle_id: null,
  plate: "10-AA-100",
  summary: "PURCHASE_UPDATED",
  created_at: "2026-09-26T10:00:00Z",
  metadata: { password: "NEVER", amount: 200, account_id: "account" },
  changes: {
    amount: { before: 150, after: 200 },
    supplier_id: { before: "old", after: "new" },
    notes: { changed: true },
    password: { before: "NEVER", after: "SECRET" },
  },
  references: {
    "supplier_id:old": "Premium Auto Parts",
    "supplier_id:new": "ELİ Təkər",
    "account_id:account": "Bizim bank",
  },
};
describe("operational branding and Azerbaijani display", () => {
  it("retains PRIME and removes all referenced robot visuals", () => {
    const shell = readFileSync("components/app-shell.tsx", "utf8");
    expect(shell).toContain("/brand/prime-logo.png");
    for (const file of [
      "components/app-shell.tsx",
      "app/layout.tsx",
      "app/favicon.ico/route.ts",
      "app/globals.css",
    ]) {
      expect(readFileSync(file, "utf8")).not.toMatch(
        /prime-bot|sidebar-bot|prime-transformer/,
      );
    }
  });
  it("uses the same category labels for UI and reports, never unknown codes", () => {
    expect(
      financialCategoryLabel({ allocation_type: "SUPPLIER_PURCHASE" }, []),
    ).toBe("Təchizatçı ödənişi");
    expect(
      financialCategoryLabel({ allocation_type: "WORKER_WORK_ITEM" }, []),
    ).toBe("Usta ödənişi");
    expect(
      financialCategoryLabel(
        { allocation_type: "GENERAL_INCOME", category_id: "cat" },
        [{ id: "cat", name: "Digər gəlir" }],
      ),
    ).toBe("Digər gəlir");
    expect(financialLabel("UNKNOWN_CODE")).toBe("Digər əməliyyat");
    for (const code of auditActions)
      expect(auditEventLabel(code)).not.toMatch(/^[A-Z_]+$/);
    expect(auditRoleLabel("INTAKE")).toBe("İlkin qeydiyyat");
    expect(auditEntityLabel("cash_transactions")).toBe("Maliyyə əməliyyatı");
  });
  it("renders resolved changes and privacy-safe details without JSON or IDs", () => {
    const detail = auditDetail(log);
    expect(detail.changes[0]).toEqual({
      label: "Məbləğ",
      before: "150,00 AZN",
      after: "200,00 AZN",
    });
    const html = renderToStaticMarkup(<AuditDetail log={log} />);
    for (const text of [
      "Premium Auto Parts",
      "ELİ Təkər",
      "Bizim bank",
      "əvvəlki və yeni dəyərlər saxlanmayıb",
    ])
      expect(html).toContain(text);
    for (const text of [
      "<pre",
      "PURCHASE_UPDATED",
      "supplier_id",
      "secret-id",
      "NEVER",
      "SECRET",
    ])
      expect(html).not.toContain(text);
    expect(auditDetail({ ...log, references: {} }).changes[1].before).toBe(
      "Əlaqəli qeyd (adı saxlanmayıb)",
    );
  });
  it("keeps work reports financial-free, filtered, compact and paginated", async () => {
    const data: WorkQueue = {
      jobs: [
        {
          id: "job",
          job_no: "QA",
          customer_name: "Əli Əliyev",
          received_at: "2026-09-26",
          target_delivery_date: null,
          status: "RECEIVED",
          funding_source: "CUSTOMER_FUNDED",
          archived_at: null,
          vehicles: { plate: "10-AA-100", make: "BMW", model: "F30" },
        },
      ],
      workers: [
        {
          id: "worker",
          first_name: "Şükür",
          last_name: "Ömərov",
          active: true,
        },
      ],
      work: Array.from({ length: 90 }, (_, i) => ({
        id: `work-${i}`,
        service_job_id: "job",
        work_catalog_id: null,
        custom_title: `Rəngsaz işi ${i + 1}`,
        assigned_worker_id: "worker",
        status: "TODO",
        notes: "Çox uzun qeyd ".repeat(40),
        planned_at: "2026-09-26",
        started_at: null,
        completed_at: null,
      })),
    };
    const report = workQueueReport(
      data,
      parseFilters({ worker: "worker", from: "2026-09-01" }),
    );
    expect(report.sections[0].table?.rows).toHaveLength(90);
    expect(
      report.sections[0].table?.rows[0].cells["6"].length,
    ).toBeLessThanOrEqual(140);
    expect(
      workQueueReport(data, parseFilters({ status: "DONE" })).sections[0].table
        ?.rows,
    ).toHaveLength(0);
    const html = renderToStaticMarkup(<PrintReport report={report} />);
    expect(html).toContain("print-operations");
    for (const word of ["Maya", "mənfəət", "qiyməti", "AZN", "secret"])
      expect(html).not.toContain(word);
    const buffer = await renderToBuffer(<ReportDocument report={report} />);
    expect(
      buffer.toString("latin1").match(/\/Type \/Page\b/g)!.length,
    ).toBeGreaterThan(1);
    if (process.env.PRIME_REPORT_QA_DIR) {
      mkdirSync(process.env.PRIME_REPORT_QA_DIR, { recursive: true });
      writeFileSync(`${process.env.PRIME_REPORT_QA_DIR}/work-long.pdf`, buffer);
    }
  }, 20000);
});
