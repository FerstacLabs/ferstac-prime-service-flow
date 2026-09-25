import type {
  DbPurchase,
  DbServiceJob,
  DbWorkItem,
} from "@/lib/supabase/queries";
import { decimalMinor, multiplyMoney } from "@/lib/decimal";

export type QuoteMeasure = {
  is_additional?: boolean;
  quantity?: number;
  unit_id?: string;
  customer_unit_price?: number | null;
  cost_note?: string | null;
  unit_catalog?: { id: string; name: string; short_name?: string } | null;
};

export type RequiredPart = QuoteMeasure & {
  id: string;
  service_job_id: string;
  part_catalog_id: string;
  quoted_price: number;
  notes: string | null;
  display_order: number;
  part_catalog?: { name: string } | null;
};
export type AllocationType =
  | "CUSTOMER_VEHICLE"
  | "GENERAL_IN"
  | "GENERAL_OUT"
  | "VEHICLE_EXPENSE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "OPENING_IN"
  | "OPENING_OUT"
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
  CUSTOMER_VEHICLE: "Müştəri: avtomobil",
  GENERAL_IN: "Digər mədaxil",
  GENERAL_OUT: "Ümumi məxaric",
  VEHICLE_EXPENSE: "Əlavə avtomobil xərci",
  TRANSFER_IN: "Daxili köçürmə: mədaxil",
  TRANSFER_OUT: "Daxili köçürmə: məxaric",
  OPENING_IN: "Başlanğıc qalıq",
  OPENING_OUT: "Başlanğıc qalıq",
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
  Number(
    decimalMinor(typeof value === "number" ? value.toFixed(2) : (value ?? 0)),
  );
export const sumMoney = (values: Array<number | null | undefined>) =>
  values.reduce<number>((sum, v) => sum + cents(v), 0) / 100;
export const subtractMoney = (a: number, b: number) =>
  (cents(a) - cents(b)) / 100;
export const costKnown = (work: DbWorkItem) =>
  work.labor_cost_known ?? work.labor_cost > 0;
export const purchaseCost = (p: DbPurchase) =>
  p.source_type === "CUSTOMER_PROVIDED"
    ? 0
    : cents(p.total_price ?? multiplyMoney(p.quantity, p.unit_price)) / 100;
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
export function workerWorkFinance(work: DbWorkItem, cash: CashTransaction[]) {
  const known = costKnown(work);
  const earned = work.status === "DONE" && known ? Number(work.labor_cost) : 0;
  const paid = paidFor(cash, "WORKER_WORK_ITEM", work.id);
  const remaining = known
    ? Math.max(subtractMoney(work.labor_cost, paid), 0)
    : null;
  return {
    known,
    earned,
    paid,
    advance: Math.max(subtractMoney(paid, earned), 0),
    outstanding: Math.max(subtractMoney(earned, paid), 0),
    remaining,
    canPay:
      !!work.assigned_worker_id &&
      work.status !== "CANCELLED" &&
      (remaining ?? 0) > 0,
  };
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
    : sumMoney([
        Number(job.agreed_budget),
        ...work.filter((w) => w.is_additional).map((w) => w.quoted_price),
        ...required.filter((p) => p.is_additional).map((p) => p.quoted_price),
      ]);
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
    cash
      .filter((t) => t.allocation_type.startsWith("CUSTOMER_"))
      .map((t) => t.amount),
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
  // An advance on one allocation must never offset earned debt on another.
  const workerLines = work.map((w) => workerWorkFinance(w, cash));
  const workerEarned = sumMoney(workerLines.map((n) => n.earned));
  const workerExpected = sumMoney(
    activeWork
      .filter((w) => w.status !== "DONE" && costKnown(w))
      .map((w) => w.labor_cost),
  );
  const supplierCost = sumMoney(
    purchases.filter((p) => p.source_type === "SUPPLIER").map(purchaseCost),
  );
  const otherCost = sumMoney(
    cash
      .filter((t) => t.allocation_type === "VEHICLE_EXPENSE")
      .map((t) => t.amount),
  );
  return {
    detailed,
    quotedWork,
    quotedParts,
    quotedTotal,
    workCost,
    partsCost,
    otherCost,
    totalCost: sumMoney([workCost, partsCost, otherCost]),
    missingWork,
    missingParts,
    customerPaid,
    customerReceivable: subtractMoney(quotedTotal, customerPaid),
    supplierPaid,
    workerPaid,
    workerEarned,
    workerExpected,
    supplierPayable: subtractMoney(supplierCost, supplierPaid),
    workerPayable: sumMoney(workerLines.map((n) => n.outstanding)),
    workerAdvance: sumMoney(workerLines.map((n) => n.advance)),
    workerRemaining: sumMoney(
      activeWork.map((w) => workerWorkFinance(w, cash).remaining),
    ),
    workProfit:
      detailed && !missingWork ? subtractMoney(quotedWork, workCost) : null,
    partProfit:
      detailed && !missingParts ? subtractMoney(quotedParts, partsCost) : null,
    grossProfit:
      detailed && !missingWork && !missingParts
        ? subtractMoney(quotedTotal, sumMoney([workCost, partsCost, otherCost]))
        : null,
  };
}
export function cashFlow(cash: CashTransaction[]) {
  const live = cash.filter(
    (t) =>
      !t.voided_at &&
      !t.allocation_type.startsWith("TRANSFER_") &&
      !t.allocation_type.startsWith("OPENING_"),
  );
  const cashIn = sumMoney(
    live.filter((t) => t.direction === "IN").map((t) => t.amount),
  );
  const cashOut = sumMoney(
    live.filter((t) => t.direction === "OUT").map((t) => t.amount),
  );
  return { cashIn, cashOut, netCashFlow: subtractMoney(cashIn, cashOut) };
}
