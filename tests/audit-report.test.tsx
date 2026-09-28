// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { auditDescription, loadAuditReport, type AuditLog } from "@/lib/audit";
import { ReportDocument } from "@/lib/report-pdf";
import { auditDetail } from "@/lib/audit-display";

const db = vi.hoisted(() => ({ rows: [] as unknown[], range: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({
  requireAccess: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      gte: () => query,
      lte: () => query,
      ilike: () => query,
      in: () => query,
      order: () => query,
      range: (start: number, end: number) => {
        db.range(start, end);
        return { data: db.rows, count: 70, error: null };
      },
    };
    return {
      profile: { organization_id: "prime" },
      supabase: { from: () => query },
    };
  },
}));

const log: AuditLog = {
  id: "audit-1",
  actor_user_id: "cashier-id",
  actor_username_snapshot: "kassa",
  actor_role_snapshot: "CASHIER",
  action: "WORKER_PAYMENT_CREATED",
  entity_type: "cash_transactions",
  entity_id: "payment-id",
  service_job_id: "job-id",
  vehicle_id: "vehicle-id",
  plate: "10-PR-030",
  summary: "WORKER_PAYMENT_CREATED",
  changes: {},
  metadata: { amount: 100, worker: "Rauf Əliyev" },
  created_at: "2026-09-21T10:00:00Z",
};

describe("audit descriptions and reports", () => {
  it("shows date-only intake changes without adding a timezone clock", () => {
    const result = auditDetail({
      ...log,
      changes: {
        target_delivery_date: { before: "2026-10-01", after: "2026-10-05" },
        notes: { before: "Old note", after: "New note" },
      },
    });
    expect(result.changes).toContainEqual({
      label: "Hədəf təhvil tarixi",
      before: "01.10.2026",
      after: "05.10.2026",
    });
    expect(result.changes).toContainEqual({
      label: "Qeyd",
      before: "Old note",
      after: "New note",
    });
  });
  it("explains assignment and its automatic status transition together", () => {
    const description = auditDescription({
      ...log,
      action: "WORKER_ASSIGNED",
      metadata: {},
      changes: {
        assigned_worker_id: { before: null, after: "worker" },
        status: { before: "TODO", after: "IN_PROGRESS" },
      },
      references: { "assigned_worker_id:worker": "Kamran Həsənov" },
    });
    expect(description).toContain("Kamran Həsənov işə təyin edildi");
    expect(description).toContain("İş gedir");
    expect(description).not.toMatch(/TODO|IN_PROGRESS|WORKER_ASSIGNED/);
  });
  it("describes actors, worker payments and account changes without secret values", () => {
    expect(auditDescription(log)).toBe(
      "kassa istifadəçisi Rauf Əliyev üçün 100,00 AZN usta ödənişi yaratdı.",
    );
    const description = auditDescription({
      ...log,
      actor_username_snapshot: "admin",
      action: "PASSWORD_RESET_REQUESTED",
      metadata: { username: "qeydiyyat", password: "must-not-render" },
    });
    expect(description).toContain(
      "müvəqqəti şifrə yenilənməsini başlatdı (qeydiyyat)",
    );
    expect(description).not.toContain("must-not-render");
    expect(
      auditDescription({ ...log, action: "LOGIN_SUCCESS", metadata: {} }),
    ).toContain("sistemə daxil oldu");
  });

  it("keeps filter periods, pagination and explicit column widths in the export", async () => {
    db.rows = [log];
    const report = await loadAuditReport({
      from: "2026-09-01",
      to: "2026-09-21",
      page: "2",
      actor: "kassa",
    });
    expect(db.range).toHaveBeenLastCalledWith(50, 99);
    expect(report.filters).toContain("Dövr: 01.09.2026 - 21.09.2026");
    expect(report.filters).toContain("İstifadəçi: kassa");
    const table = report.sections[0].table!;
    expect(table.columns.reduce((sum, column) => sum + column.width!, 0)).toBe(
      100,
    );
    expect(table.rows[0].cells["6"]).toBe(auditDescription(log));
    expect(table.rows[0].cells["3"]).toBe("Usta ödənişi yaradıldı");
    expect(table.rows[0].details).toBeUndefined();
    expect(JSON.stringify(report)).not.toContain(log.action);
    expect(JSON.stringify(report)).not.toContain("cash_transactions");
  });

  it("paginates long Azerbaijani audit descriptions in A4 PDF", async () => {
    db.rows = Array.from({ length: 50 }, (_, index) => ({
      ...log,
      id: `audit-${index}`,
      metadata: {
        amount: 100,
        worker: "Əli Əliyev və Şükür Ömərov üçün uzun iş təsviri ".repeat(5),
      },
    }));
    const report = await loadAuditReport({
      from: "2026-09-01",
      to: "2026-09-21",
    });
    const buffer = await renderToBuffer(<ReportDocument report={report} />);
    expect(
      buffer.toString("latin1").match(/\/Type \/Page\b/g)!.length,
    ).toBeGreaterThan(1);
    if (process.env.PRIME_REPORT_QA_DIR) {
      mkdirSync(process.env.PRIME_REPORT_QA_DIR, { recursive: true });
      writeFileSync(
        path.join(process.env.PRIME_REPORT_QA_DIR, "audit-long.pdf"),
        buffer,
      );
    }
  }, 20000);
});
