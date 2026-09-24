// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  canAccessPath,
  canReport,
  normalizeUsername,
  roleHome,
  validPassword,
  type AppRole,
} from "@/lib/security";
import {
  createServiceJobAction,
  archiveServiceJobAction,
  restoreServiceJobAction,
  updateVehicleIntakeAction,
  saveQuoteLineAction,
  deleteServiceJobAction,
} from "@/app/actions/vehicles";
import { saveWorkerAction, updateWorkItemAction } from "@/app/actions/workers";
import {
  saveSupplierAction,
  savePurchaseAction,
  deletePurchaseAction,
  archiveSupplierAction,
  saveWorkCostingAction,
  createAdditionalWorkAction,
} from "@/app/actions/purchases";
import {
  recordPaymentAction,
  setWorkerCostAction,
  voidPaymentAction,
  createCatalogAction,
  manageUnitAction,
} from "@/app/actions/finance";
import { requireAccess } from "@/lib/supabase/auth";
import { manageAccountAction } from "@/app/actions/security";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

const state = vi.hoisted(() => ({
  role: "ADMIN" as AppRole,
  active: true,
  change: false,
  valid: true,
  authenticated: true,
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.authenticated ? { id: "test-user" } : null },
      }),
    },
    from: state.from,
    rpc: (name: string, args: unknown) =>
      name === "get_access_profile"
        ? Promise.resolve({
            data: {
              role: state.role,
              is_active: state.active,
              session_valid: state.valid,
              must_change_password: state.change,
            },
          })
        : state.rpc(name, args),
  }),
}));
beforeEach(() => {
  state.role = "ADMIN";
  state.active = true;
  state.change = false;
  state.valid = true;
  state.authenticated = true;
  vi.clearAllMocks();
});

describe("role routes and report matrix", () => {
  it.each(["ADMIN", "CASHIER", "INTAKE"] as const)(
    "%s has a role-safe home",
    (role) => expect(canAccessPath(role, roleHome(role))).toBe(true),
  );
  it.each([
    "/vehicles",
    "/vehicles/new",
    "/purchases",
    "/workers",
    "/work",
    "/overview",
    "/audit",
    "/security",
  ])("cashier denied %s", (path) =>
    expect(canAccessPath("CASHIER", path)).toBe(false),
  );
  it.each([
    "/purchases",
    "/workers",
    "/work",
    "/overview",
    "/kassa",
    "/audit",
    "/security",
  ])("intake denied %s", (path) =>
    expect(canAccessPath("INTAKE", path)).toBe(false),
  );
  it.each([
    "kassa",
    "workers",
    "vehicle",
    "purchases",
    "overview",
    "audit",
    "work",
    "handover",
    "quotation",
  ])("report %s is permission checked for both PDF and print", (scope) => {
    for (const role of ["ADMIN", "CASHIER", "INTAKE"] as const) {
      const expected =
        role === "ADMIN" ||
        (role === "CASHIER"
          ? ["kassa", "workers"].includes(scope)
          : scope === "quotation");
      expect(canReport(role, scope)).toBe(expected);
      expect(canAccessPath(role, `/api/reports/${scope}/pdf`)).toBe(expected);
      expect(canAccessPath(role, `/reports/${scope}/print`)).toBe(expected);
    }
  });
  it("normalizes usernames and rejects weak passwords", () => {
    expect(normalizeUsername("  KASSA  ")).toBe("kassa");
    expect(validPassword("short")).toBe(false);
    expect(validPassword("x".repeat(20))).toBe(false);
    expect(validPassword("Aa9" + "x".repeat(20))).toBe(true);
  });
});

describe("real server-action guards execute BEFORE mutation", () => {
  it.each(["CASHIER", "INTAKE"] as const)(
    "%s cannot invoke account management",
    async (role) => {
      state.role = role;
      await expect(manageAccountAction({}, new FormData())).rejects.toThrow(
        `REDIRECT:${roleHome(role)}`,
      );
      expect(state.from).not.toHaveBeenCalled();
    },
  );
  const forbiddenCashier = [
    archiveSupplierAction,
    saveWorkCostingAction,
    createAdditionalWorkAction,
    setWorkerCostAction,
    deleteServiceJobAction,
    manageUnitAction,
    createServiceJobAction,
    archiveServiceJobAction,
    restoreServiceJobAction,
    saveWorkerAction,
    saveSupplierAction,
    savePurchaseAction,
    deletePurchaseAction,
    updateWorkItemAction,
    updateVehicleIntakeAction,
    saveQuoteLineAction,
    voidPaymentAction,
  ];
  it.each(forbiddenCashier)("cashier cannot call %s", async (action) => {
    state.role = "CASHIER";
    await expect(action(new FormData())).rejects.toThrow("REDIRECT:/kassa");
    expect(state.from).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it.each([
    archiveSupplierAction,
    saveWorkCostingAction,
    createAdditionalWorkAction,
    deleteServiceJobAction,
    manageUnitAction,
    recordPaymentAction,
    setWorkerCostAction,
    voidPaymentAction,
    saveWorkerAction,
    saveSupplierAction,
    savePurchaseAction,
    deletePurchaseAction,
    updateWorkItemAction,
    archiveServiceJobAction,
  ])("intake cannot call %s", async (action) => {
    state.role = "INTAKE";
    await expect(action(new FormData())).rejects.toThrow("REDIRECT:/vehicles");
    expect(state.from).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it.each(["CUSTOMER_WORK", "SUPPLIER_PURCHASE", "WORKER_WORK_ITEM"])(
    "intake rejects forged %s payment",
    async (type) => {
      state.role = "INTAKE";
      const form = new FormData();
      form.set("allocation_type", type);
      await expect(recordPaymentAction(form)).rejects.toThrow(
        "REDIRECT:/vehicles",
      );
      expect(state.rpc).not.toHaveBeenCalled();
    },
  );
  it("catalog roles cannot be created by intake", async () => {
    state.role = "INTAKE";
    await expect(createCatalogAction("role", "Forged")).rejects.toThrow(
      "REDIRECT:/vehicles",
    );
  });
  it.each(["ADMIN"] as const)(
    "%s can invoke the narrowly scoped financial RPC",
    async (role) => {
      state.role = role;
      state.rpc.mockResolvedValue({ error: null });
      const form = new FormData();
      form.set("id", "10000000-0000-4000-8000-000000000001");
      form.set("labor_cost", "123.45");
      await setWorkerCostAction(form);
      expect(state.rpc).toHaveBeenCalledWith("set_worker_cost", {
        p_id: form.get("id"),
        p_cost: "123.45",
      });
      expect(state.from).not.toHaveBeenCalled();
    },
  );
  it("guards disabled, stale-session and first-login accounts", async () => {
    state.active = false;
    await expect(requireAccess()).rejects.toThrow("REDIRECT:/login");
    state.active = true;
    state.valid = false;
    await expect(requireAccess()).rejects.toThrow("REDIRECT:/login");
    state.valid = true;
    state.change = true;
    await expect(requireAccess()).rejects.toThrow("REDIRECT:/change-password");
    await expect(requireAccess(undefined, true)).resolves.toBeTruthy();
    state.authenticated = false;
    await expect(requireAccess()).rejects.toThrow("REDIRECT:/login");
  });
});
