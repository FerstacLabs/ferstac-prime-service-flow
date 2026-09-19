import type { WorkshopData } from "@/lib/supabase/workshop";
import { inPeriod, type WorkshopFilters } from "@/lib/filters";
import { costKnown, paidFor, sumMoney, subtractMoney } from "@/lib/workshop";
export function workerFinance(
  data: WorkshopData,
  workerId: string,
  f: WorkshopFilters,
) {
  const items = data.work.filter(
    (w) =>
      w.assigned_worker_id === workerId &&
      inPeriod(w.completed_at || w.planned_at, f),
  );
  const done = items.filter((w) => w.status === "DONE"),
    active = items.filter(
      (w) => w.status === "TODO" || w.status === "IN_PROGRESS",
    ),
    cancelled = items.filter((w) => w.status === "CANCELLED");
  const earned = sumMoney(done.filter(costKnown).map((w) => w.labor_cost)),
    paid = sumMoney(
      items.map((w) => paidFor(data.cash, "WORKER_WORK_ITEM", w.id)),
    );
  return {
    items,
    done,
    active,
    cancelled,
    earned,
    paid,
    outstanding: subtractMoney(earned, paid),
    expected: sumMoney(active.filter(costKnown).map((w) => w.labor_cost)),
    missing: done.filter((w) => !costKnown(w)).length,
  };
}
