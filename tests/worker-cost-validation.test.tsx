import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkerCostForm } from "@/components/work-costing";
import { workerSelectionRequired } from "@/lib/action-errors";
import type { DbWorkItem } from "@/lib/supabase/queries";
const { save } = vi.hoisted(() => ({ save: vi.fn<(form: FormData) => Promise<void>>().mockResolvedValue(undefined) }));
vi.mock("@/app/actions/purchases", () => ({ saveWorkCostingAction: save }));
vi.mock("@/app/actions/finance", () => ({ createCatalogAction: vi.fn() }));
vi.mock("@/components/app-shell", () => ({ statusLabels: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const worker = "11111111-1111-4111-a111-111111111111";
const work = { id: "22222222-2222-4222-a222-222222222222", status: "IN_PROGRESS",
  labor_cost: 0, labor_cost_known: false, assigned_worker_id: null } as DbWorkItem;

it.each([false, true])("rejects an empty worker and preserves values (percentage %s)", async (percentage) => {
  render(<WorkerCostForm work={work} paid={0} workers={[{ id: worker, name: "Test usta" }]} />);
  const cost = screen.getByLabelText("Usta maya dəyəri") as HTMLInputElement;
  fireEvent.change(cost, { target: { value: "125.50" } });
  if (percentage) fireEvent.click(screen.getByLabelText("Faizlə hesablanır"));
  fireEvent.click(screen.getByRole("button", { name: "Mayanı saxla" }));
  expect((await screen.findByRole("alert")).textContent).toBe(workerSelectionRequired);
  expect(cost.value).toBe("125.50");
  expect((screen.getByLabelText("Faizlə hesablanır") as HTMLInputElement).checked).toBe(percentage);
  expect(save).not.toHaveBeenCalled();
  fireEvent.focus(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "Test usta" }));
  fireEvent.click(screen.getByRole("button", { name: "Mayanı saxla" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]?.[0]).toBeDefined();
});

it("rejects a stale dropdown ID without overwriting the existing form values", async () => {
  render(<WorkerCostForm work={{ ...work, assigned_worker_id: worker, labor_cost: 80, labor_cost_known: true }} paid={0} workers={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Mayanı saxla" }));
  expect((await screen.findByRole("alert")).textContent).toBe(workerSelectionRequired);
  expect((screen.getByLabelText("Usta maya dəyəri") as HTMLInputElement).value).toBe("80");
  expect(save).not.toHaveBeenCalled();
});
