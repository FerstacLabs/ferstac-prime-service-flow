// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { auditDescription, loadAuditReport, type AuditLog } from "@/lib/audit";
import { ReportDocument } from "@/lib/report-pdf";

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
    expect(table.rows[0].cells["2"]).toBe(auditDescription(log));
    expect(table.rows[0].details).toContainEqual({
      label: "Hadisə kodu",
      value: log.action,
    });
  });

  it("paginates long Azerbaijani audit descriptions in A4 PDF", async () => {
    db.rows = Array.from({ length: 20 }, (_, index) => ({
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
