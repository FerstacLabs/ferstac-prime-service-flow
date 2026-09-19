import type { WorkshopData } from "@/lib/supabase/workshop";
import { inPeriod, type WorkshopFilters } from "@/lib/filters";
import { costKnown, sumMoney, workerWorkFinance } from "@/lib/workshop";
import type { DbWorkItem } from "@/lib/supabase/queries";

export { workerWorkFinance } from "@/lib/workshop";
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
  const lines = items.map((w) => workerWorkFinance(w, data.cash));
  const earned = sumMoney(lines.map((w) => w.earned)),
    paid = sumMoney(lines.map((w) => w.paid));
  return {
    items,
    done,
    active,
    cancelled,
    earned,
    paid,
    advance: sumMoney(lines.map((w) => w.advance)),
    outstanding: sumMoney(lines.map((w) => w.outstanding)),
    remaining: sumMoney(
      items
        .filter((w) => w.status !== "CANCELLED")
        .map((w) => workerWorkFinance(w, data.cash).remaining),
    ),
    expected: sumMoney(active.filter(costKnown).map((w) => w.labor_cost)),
    missing: items.filter((w) => w.status !== "CANCELLED" && !costKnown(w))
      .length,
  };
}

export function selectWorkerFinances(data: WorkshopData, f: WorkshopFilters) {
  return data.workers
    .filter((w) => !f.worker || w.id === f.worker)
    .map((worker) => ({ worker, ...workerFinance(data, worker.id, f) }))
    .filter((n) =>
      f.balance === "outstanding"
        ? n.outstanding > 0
        : f.balance === "paid"
          ? n.paid > 0 &&
            n.remaining === 0 &&
            n.outstanding === 0 &&
            !n.missing &&
            n.cancelled.every((w) => workerWorkFinance(w, data.cash).paid === 0)
          : f.balance === "advance"
            ? n.advance > 0
            : true,
    );
}

// Periods select work; its complete settlement history keeps earned/paid/balance comparable.
export function workerPaymentHistory(data: WorkshopData, items: DbWorkItem[]) {
  const work = new Map(items.map((w) => [w.id, w]));
  return data.cash
    .filter(
      (t) =>
        t.allocation_type === "WORKER_WORK_ITEM" &&
        t.work_item_id &&
        work.has(t.work_item_id),
    )
    .sort(
      (a, b) =>
        b.transaction_date.localeCompare(a.transaction_date) ||
        b.id.localeCompare(a.id),
    )
    .map((payment) => {
      const item = work.get(payment.work_item_id!)!;
      return {
        payment,
        item,
        job: data.jobs.find((j) => j.id === item.service_job_id),
        ...workerWorkFinance(item, data.cash),
      };
    });
}
