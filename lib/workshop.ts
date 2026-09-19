import type {
  DbPurchase,
  DbServiceJob,
  DbWorkItem,
} from "@/lib/supabase/queries";

export type RequiredPart = {
  id: string;
  service_job_id: string;
  part_catalog_id: string;
  quoted_price: number;
  notes: string | null;
  display_order: number;
  part_catalog?: { name: string } | null;
};
export type AllocationType =
  | "CUSTOMER_WORK"
  | "CUSTOMER_PART"
  | "CUSTOMER_BUDGET"
  | "SUPPLIER_PURCHASE"
  | "WORKER_WORK_ITEM";
export type CashTransaction = {
  id: string;
  service_job_id: string;
  allocation_type: AllocationType;
  direction: "IN" | "OUT";
  work_item_id: string | null;
  required_part_id: string | null;
  purchase_id: string | null;
  amount: number;
  transaction_date: string;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
};
export const allocationLabels: Record<AllocationType, string> = {
  CUSTOMER_WORK: "Müştəri: iş",
  CUSTOMER_PART: "Müştəri: detal",
  CUSTOMER_BUDGET: "Müştəri: əvvəlki büdcə",
  SUPPLIER_PURCHASE: "Təchizatçıya ödəniş",
  WORKER_WORK_ITEM: "Ustaya ödəniş",
};
export const missingValue = "Məlumat daxil edilməyib";

export function missingCostDescription({
  missingWork,
  missingParts,
}: {
  missingWork: number;
  missingParts: number;
}) {
  return (
    [
      missingWork > 0 ? `${missingWork} iş` : "",
      missingParts > 0 ? `${missingParts} detal` : "",
    ]
      .filter(Boolean)
      .join(", ") || null
  );
}

export const canGenerateHandover = (status: DbServiceJob["status"]) =>
  status === "READY" || status === "DELIVERED";

// Calculate in integer qəpik; NUMERIC remains the persistence format.
export const cents = (value: number | string | null | undefined) =>
  Math.round(Number(value ?? 0) * 100);
export const sumMoney = (values: Array<number | null | undefined>) =>
  values.reduce<number>((sum, v) => sum + cents(v), 0) / 100;
export const subtractMoney = (a: number, b: number) =>
  (cents(a) - cents(b)) / 100;
export const costKnown = (work: DbWorkItem) =>
  work.labor_cost_known ?? work.labor_cost > 0;
export const purchaseCost = (p: DbPurchase) =>
  p.source_type === "CUSTOMER_PROVIDED"
    ? 0
    : cents(p.total_price ?? Number(p.quantity) * Number(p.unit_price)) / 100;
export function paidFor(
  cash: CashTransaction[],
  type: AllocationType,
  id: string,
) {
  return sumMoney(
    cash
      .filter(
        (t) =>
          !t.voided_at &&
          t.allocation_type === type &&
          (t.work_item_id === id ||
            t.required_part_id === id ||
            t.purchase_id === id ||
            (type === "CUSTOMER_BUDGET" && t.service_job_id === id)),
      )
      .map((t) => t.amount),
  );
}
export function jobFinance(
  job: DbServiceJob,
  work: DbWorkItem[],
  required: RequiredPart[],
  purchases: DbPurchase[],
  cash: CashTransaction[],
) {
  work = work.filter((w) => w.service_job_id === job.id);
  required = required.filter((p) => p.service_job_id === job.id);
  purchases = purchases.filter(
    (p) => p.service_job_id === job.id && !p.voided_at,
  );
  cash = cash.filter((t) => t.service_job_id === job.id && !t.voided_at);
  const quotedWork = sumMoney(work.map((w) => w.quoted_price));
  const quotedParts = sumMoney(required.map((p) => p.quoted_price));
  const detailed =
    job.has_line_quotes ??
    (work.some((w) => w.quoted_price != null) || required.length > 0);
  const quotedTotal = detailed
    ? sumMoney([quotedWork, quotedParts])
    : Number(job.agreed_budget);
  const activeWork = work.filter((w) => w.status !== "CANCELLED");
  const workCost = sumMoney(
    activeWork.filter(costKnown).map((w) => w.labor_cost),
  );
  const partsCost = sumMoney(purchases.map(purchaseCost));
  const missingWork = activeWork.filter((w) => !costKnown(w)).length;
  const missingParts = required.filter(
    (r) => !purchases.some((p) => p.required_part_id === r.id),
  ).length;
  const customerPaid = sumMoney(
    cash.filter((t) => t.direction === "IN").map((t) => t.amount),
  );
  const supplierPaid = sumMoney(
    cash
      .filter((t) => t.allocation_type === "SUPPLIER_PURCHASE")
      .map((t) => t.amount),
  );
  const workerPaid = sumMoney(
    cash
      .filter((t) => t.allocation_type === "WORKER_WORK_ITEM")
      .map((t) => t.amount),
  );
  const workerEarned = sumMoney(
    activeWork
      .filter((w) => w.status === "DONE" && costKnown(w))
      .map((w) => w.labor_cost),
  );
  const workerExpected = sumMoney(
    activeWork
      .filter((w) => w.status !== "DONE" && costKnown(w))
      .map((w) => w.labor_cost),
  );
  const supplierCost = sumMoney(
    purchases.filter((p) => p.source_type === "SUPPLIER").map(purchaseCost),
  );
  return {
    detailed,
    quotedWork,
    quotedParts,
    quotedTotal,
    workCost,
    partsCost,
    totalCost: sumMoney([workCost, partsCost]),
    missingWork,
    missingParts,
    customerPaid,
    customerReceivable: subtractMoney(quotedTotal, customerPaid),
    supplierPaid,
    workerPaid,
    workerEarned,
    workerExpected,
    supplierPayable: subtractMoney(supplierCost, supplierPaid),
    workerPayable: subtractMoney(workerEarned, workerPaid),
    workProfit:
      detailed && !missingWork ? subtractMoney(quotedWork, workCost) : null,
    partProfit:
      detailed && !missingParts ? subtractMoney(quotedParts, partsCost) : null,
    grossProfit:
      detailed && !missingWork && !missingParts
        ? subtractMoney(quotedTotal, sumMoney([workCost, partsCost]))
        : null,
  };
}
export function cashFlow(cash: CashTransaction[]) {
  const live = cash.filter((t) => !t.voided_at);
  const cashIn = sumMoney(
    live.filter((t) => t.direction === "IN").map((t) => t.amount),
  );
  const cashOut = sumMoney(
    live.filter((t) => t.direction === "OUT").map((t) => t.amount),
  );
  return { cashIn, cashOut, netCashFlow: subtractMoney(cashIn, cashOut) };
}
