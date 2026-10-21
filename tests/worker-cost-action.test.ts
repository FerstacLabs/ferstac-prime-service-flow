// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const { auth, rpc } = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/queries", () => ({ getAuthedSupabase: auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { saveWorkCostingAction } from "@/app/actions/purchases";
import { workerSelectionRequired } from "@/lib/action-errors";
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ supabase: { rpc } });
  rpc.mockResolvedValue({ error: null });
});
it.each([null, "", " ", "not-a-worker"])("rejects worker %s before invoking any write", async (worker) => {
  const form = new FormData();
  if (worker !== null) form.set("assigned_worker_id", worker);
  form.set("labor_cost", "125.50");
  expect(await saveWorkCostingAction(form)).toEqual({ error: workerSelectionRequired });
  expect(auth).toHaveBeenCalledWith("ADMIN");
  expect(rpc).not.toHaveBeenCalled();
});
it.each([false, true])("preserves valid RPC parameters (percentage %s)", async (percentage) => {
  const id = "11111111-1111-4111-a111-111111111111";
  const worker = "22222222-2222-4222-a222-222222222222";
  const form = new FormData();
  form.set("id", id); form.set("assigned_worker_id", worker); form.set("labor_cost", "125.50");
  if (percentage) form.set("percentage", "on");
  await saveWorkCostingAction(form);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("set_work_compensation", {
    p_id: id, p_worker: worker, p_percentage: percentage, p_cost: percentage ? null : "125.50",
  });
});
it("rejects missing worker in percentage mode without a write", async () => {
  const form = new FormData();
  form.set("percentage", "on");
  expect(await saveWorkCostingAction(form)).toEqual({ error: workerSelectionRequired });
  expect(rpc).not.toHaveBeenCalled();
});
