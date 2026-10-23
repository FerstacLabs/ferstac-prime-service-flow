// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GET } from "@/app/api/reports/[scope]/pdf/route";
import ReportPrintPage from "@/app/reports/[scope]/print/page";

const fixture = vi.hoisted(() => ({
  role: "ADMIN" as "ADMIN" | "INTAKE",
  job: {} as Record<string, unknown>,
  writes: vi.fn(() => { throw new Error("Document rendering must not mutate the database"); }),
  reads: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/auth", () => {
  function result(data: unknown[]) {
    const query = Object.assign(Promise.resolve({ data, error: null }), {
      select: () => query, order: () => query, range: () => query, eq: () => query,
      insert: fixture.writes, update: fixture.writes, upsert: fixture.writes, delete: fixture.writes,
    });
    return query;
  }
  const access = () => ({
    user: { id: "report-user" },
    profile: { role: fixture.role, is_active: true, session_valid: true, must_change_password: false },
    supabase: {
      from: (table: string) => {
        fixture.reads(table);
        return result(table === "service_jobs" ? [fixture.job] : []);
      },
      rpc: (name: string) => {
        fixture.rpc(name);
        if (!["intake_work_items", "master_directory", "finance_data"].includes(name)) return fixture.writes();
        return result([]);
      },
    },
  });
  return {
    getCurrentAccess: async () => access(),
    requireAccess: async (roles: string[] = ["ADMIN", "CASHIER", "INTAKE"]) => {
      if (!roles.includes(fixture.role)) throw new Error("Forbidden");
      return access();
    },
  };
});
beforeEach(() => { vi.clearAllMocks(); });
it.each([
  ["ADMIN", "WAITING"], ["ADMIN", "READY"], ["ADMIN", "DELIVERED"],
  ["INTAKE", "WAITING"], ["INTAKE", "READY"], ["INTAKE", "DELIVERED"],
] as const)("%s PDF and Print keep the %s delivery state unchanged", async (role, status) => {
  fixture.role = role;
  fixture.job = Object.freeze({
    id: "11111111-1111-4111-a111-111111111118", job_no: "QA-018", status,
    delivered_at: status === "DELIVERED" ? "2026-10-23T08:00:00Z" : null,
    received_at: "2026-10-22T08:00:00Z", vehicles: Object.freeze({ plate: "90-DL-018", make: "BMW", model: "QA" }),
  });
  const before = structuredClone(fixture.job);
  const params = Promise.resolve({ scope: "handover" });
  const response = await GET(new Request(`http://localhost/api/reports/handover/pdf?job=${fixture.job.id}`), { params });
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
  expect(fixture.job).toEqual(before);
  expect(fixture.writes).not.toHaveBeenCalled();

  const page = await ReportPrintPage({ params, searchParams: Promise.resolve({ job: String(fixture.job.id) }) });
  const html = renderToStaticMarkup(page);
  expect(html).toContain("90-DL-018");
  expect(html.match(/class="handover-section"/g)).toHaveLength(2);
  expect(html).toContain("müştəriyə qaytarılmışdır");
  expect(fixture.reads).toHaveBeenCalledWith("service_jobs");
  expect(fixture.job).toEqual(before);
  expect(fixture.writes).not.toHaveBeenCalled();
});
