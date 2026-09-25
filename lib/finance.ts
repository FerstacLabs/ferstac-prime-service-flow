import { decimalMinor, multiplyMoney } from "@/lib/decimal";
import type { Purchase, WorkItem } from "@/lib/types";
import { sumMoney, subtractMoney } from "@/lib/workshop";
export type FinancialSummary = {
  partsCost: number;
  laborCost: number;
  totalCost: number;
  remainingBudget: number;
  estimatedGrossProfit: number;
  totalPaidToSuppliers: number;
  unpaidSupplierAmount: number;
};
export function purchaseTotal(
  purchase: Pick<Purchase, "quantity" | "unitPrice">,
) {
  return Number(multiplyMoney(purchase.quantity, purchase.unitPrice));
}
export function purchaseOutstanding(purchase: Purchase) {
  return purchase.sourceType !== "SUPPLIER"
    ? 0
    : subtractMoney(purchaseTotal(purchase), purchase.paidAmount);
}
export function calculateFinancialSummary(
  agreedBudget: number,
  purchases: Purchase[],
  workItems: WorkItem[],
): FinancialSummary {
  const partsCost = sumMoney(purchases.map(purchaseTotal)),
    laborCost = sumMoney(
      workItems.filter((i) => i.status !== "CANCELLED").map((i) => i.laborCost),
    ),
    totalCost = sumMoney([partsCost, laborCost]);
  return {
    partsCost,
    laborCost,
    totalCost,
    remainingBudget: subtractMoney(agreedBudget, totalCost),
    estimatedGrossProfit: subtractMoney(agreedBudget, totalCost),
    totalPaidToSuppliers: sumMoney(
      purchases
        .filter((p) => p.sourceType === "SUPPLIER")
        .map((p) => p.paidAmount),
    ),
    unpaidSupplierAmount: sumMoney(purchases.map(purchaseOutstanding)),
  };
}
export type MoneyChannel = "CASH" | "BANK";
export type FinanceAccount = {
  id: string;
  name: string;
  bank_name: string | null;
  iban: string | null;
  currency: string;
  account_holder: string | null;
  tax_id: string | null;
  swift: string | null;
  notes: string | null;
  active: boolean;
};
export type FinanceCategory = {
  id: string;
  name: string;
  direction: "IN" | "OUT";
  active: boolean;
};
export type FinanceJob = {
  id: string;
  job_no: string;
  plate: string;
  model: string;
  customer_name: string | null;
  customer_due: number;
  missing_costs: number;
  closed_at: string | null;
  inactive?: boolean;
};
export type FinanceWork = {
  id: string;
  service_job_id: string;
  title: string;
  worker_id: string | null;
  worker: string;
  status: string;
  labor_cost: number;
  labor_cost_known: boolean;
  is_additional: boolean;
};
export type FinancePurchase = {
  id: string;
  service_job_id: string;
  title: string;
  cost: number;
  source_type: string;
  supplier_id: string | null;
  supplier: string;
};
export type LedgerEntry = {
  id: string;
  owner_user_id: string;
  service_job_id: string | null;
  allocation_type: string;
  work_item_id: string | null;
  purchase_id: string | null;
  direction: "IN" | "OUT";
  amount: number;
  channel: MoneyChannel;
  financial_account_id: string | null;
  currency: string;
  payment_method: string;
  category_id: string | null;
  purpose: string;
  counterparty_name_snapshot: string | null;
  counterparty_details: Record<string, string>;
  supplier_identity_id: string | null;
  worker_identity_id: string | null;
  reference_number: string | null;
  bank_reference: string | null;
  payment_order_number: string | null;
  supporting_reference: string | null;
  occurred_at: string;
  transaction_date: string;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  transfer_id: string | null;
  created_by_name: string | null;
};
export type FinanceData = {
  jobs: FinanceJob[];
  work: FinanceWork[];
  purchases: FinancePurchase[];
  ledger: LedgerEntry[];
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
};
export const moneySum = (values: (number | string)[]) =>
  Number(values.reduce<bigint>((n, v) => n + decimalMinor(v), 0n)) / 100;
export const moneyDiff = (a: number, b: number) =>
  Number(decimalMinor(a) - decimalMinor(b)) / 100;
export const isBusiness = (t: LedgerEntry) =>
  !t.allocation_type.startsWith("TRANSFER_") &&
  !t.allocation_type.startsWith("OPENING_");
export const ledgerBalance = (rows: LedgerEntry[]) =>
  moneySum(
    rows
      .filter((t) => !t.voided_at)
      .map((t) => (t.direction === "IN" ? t.amount : -Number(t.amount))),
  );
export function movementTotals(rows: LedgerEntry[], business = true) {
  const live = rows.filter((t) => !t.voided_at && (!business || isBusiness(t)));
  const income = moneySum(
      live.filter((t) => t.direction === "IN").map((t) => t.amount),
    ),
    expense = moneySum(
      live.filter((t) => t.direction === "OUT").map((t) => t.amount),
    );
  return { income, expense, net: moneyDiff(income, expense) };
}
export type JournalFilters = {
  from: string;
  to: string;
  channel: string;
  direction: string;
  account: string;
  category: string;
  job: string;
  supplier: string;
  worker: string;
  party: string;
  actor: string;
  transaction: string;
};
export function journalFilters(
  params: Record<string, string | string[] | undefined>,
): JournalFilters {
  return Object.fromEntries(
    [
      "from",
      "to",
      "channel",
      "direction",
      "account",
      "category",
      "job",
      "supplier",
      "worker",
      "party",
      "actor",
      "transaction",
    ].map((k) => [k, typeof params[k] === "string" ? params[k] : ""]),
  ) as JournalFilters;
}
export function filterLedger(data: FinanceData, f: JournalFilters) {
  return data.ledger
    .filter(
      (t) =>
        (!f.from || t.transaction_date >= f.from) &&
        (!f.to || t.transaction_date <= f.to) &&
        (!f.channel || t.channel === f.channel) &&
        (!f.direction || t.direction === f.direction) &&
        (!f.account || t.financial_account_id === f.account) &&
        (!f.category || t.category_id === f.category) &&
        (!f.job || t.service_job_id === f.job) &&
        (!f.supplier || t.supplier_identity_id === f.supplier) &&
        (!f.worker || t.worker_identity_id === f.worker) &&
        (!f.actor || t.owner_user_id === f.actor) &&
        (!f.transaction || t.id === f.transaction) &&
        (!f.party ||
          (t.counterparty_name_snapshot || "")
            .toLocaleLowerCase("az")
            .includes(f.party.toLocaleLowerCase("az"))),
    )
    .sort(
      (a, b) =>
        b.occurred_at.localeCompare(a.occurred_at) || a.id.localeCompare(b.id),
    );
}
export function vehicleSettlement(data: FinanceData, jobId: string) {
  const job = data.jobs.find((j) => j.id === jobId),
    cash = data.ledger.filter(
      (t) => t.service_job_id === jobId && !t.voided_at,
    ),
    purchases = data.purchases.filter((p) => p.service_job_id === jobId),
    work = data.work.filter(
      (w) => w.service_job_id === jobId && w.status !== "CANCELLED",
    );
  const paid = (kind: string, id: string) =>
    moneySum(
      cash
        .filter(
          (t) =>
            t.allocation_type === kind &&
            (t.purchase_id === id || t.work_item_id === id),
        )
        .map((t) => t.amount),
    );
  const obligations = [
    ...purchases
      .filter((p) => p.source_type === "SUPPLIER")
      .map((p) => ({
        id: p.id,
        type: "SUPPLIER_PURCHASE",
        party: p.supplier,
        title: p.title,
        cost: Number(p.cost),
        paid: paid("SUPPLIER_PURCHASE", p.id),
        known: true,
      })),
    ...work.map((w) => ({
      id: w.id,
      type: "WORKER_WORK_ITEM",
      party: w.worker,
      title: w.title,
      cost: Number(w.labor_cost),
      paid: paid("WORKER_WORK_ITEM", w.id),
      known: w.labor_cost_known && !!w.worker_id,
    })),
  ].map((o) => ({ ...o, remaining: moneyDiff(o.cost, o.paid) }));
  const partsCost = moneySum(purchases.map((p) => p.cost)),
    workerCost = moneySum(
      work.filter((w) => w.labor_cost_known).map((w) => w.labor_cost),
    ),
    otherCost = moneySum(
      cash
        .filter((t) => t.allocation_type === "VEHICLE_EXPENSE")
        .map((t) => t.amount),
    );
  const sum = (channel: MoneyChannel, dir: "IN" | "OUT") =>
    moneySum(
      cash
        .filter(
          (t) =>
            t.channel === channel &&
            t.direction === dir &&
            (dir === "IN"
              ? t.allocation_type.startsWith("CUSTOMER_")
              : [
                  "WORKER_WORK_ITEM",
                  "SUPPLIER_PURCHASE",
                  "VEHICLE_EXPENSE",
                ].includes(t.allocation_type)),
        )
        .map((t) => t.amount),
    );
  return {
    job,
    obligations,
    partsCost,
    workerCost,
    otherCost,
    totalCost: moneySum([partsCost, workerCost, otherCost]),
    cashPaid: sum("CASH", "OUT"),
    bankPaid: sum("BANK", "OUT"),
    cashReceived: sum("CASH", "IN"),
    bankReceived: sum("BANK", "IN"),
    remaining: moneySum(obligations.map((o) => Math.max(o.remaining, 0))),
    overpaid: moneySum(obligations.map((o) => Math.max(-o.remaining, 0))),
  };
}
export const channelName = (channel: string) =>
  channel === "CASH" ? "Nağd Kassa" : "Bank / Hesab";
