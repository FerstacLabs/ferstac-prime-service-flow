import { getAuthedSupabase } from "@/lib/supabase/queries";
import type { FinanceData } from "@/lib/finance";
import type { DbPurchase, DbWorkItem } from "@/lib/supabase/queries";
import { multiplyMoney } from "@/lib/decimal";
import { sumMoney, subtractMoney } from "@/lib/workshop";
export function dbPurchaseTotal(
  purchase: Pick<DbPurchase, "quantity" | "unit_price" | "total_price">,
) {
  return Number(
    purchase.total_price ??
      multiplyMoney(purchase.quantity, purchase.unit_price),
  );
}
export function dbPurchaseOutstanding(purchase: DbPurchase) {
  return purchase.source_type !== "SUPPLIER"
    ? 0
    : subtractMoney(dbPurchaseTotal(purchase), purchase.paid_amount);
}
export function dbFinancialSummary(
  agreedBudget: number,
  purchases: DbPurchase[],
  workItems: DbWorkItem[],
) {
  const partsCost = sumMoney(purchases.map(dbPurchaseTotal)),
    laborCost = sumMoney(
      workItems
        .filter((i) => i.status !== "CANCELLED")
        .map((i) => i.labor_cost),
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
        .filter((p) => p.source_type === "SUPPLIER")
        .map((p) => p.paid_amount),
    ),
    unpaidSupplierAmount: sumMoney(purchases.map(dbPurchaseOutstanding)),
  };
}
export async function getFinance(): Promise<FinanceData> {
  const { supabase } = await getAuthedSupabase("ADMIN", "CASHIER");
  async function read<T>(kind: string): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 500) {
      const q = ["accounts", "categories"].includes(kind)
        ? supabase
            .from(
              kind === "accounts"
                ? "financial_accounts"
                : "transaction_categories",
            )
            .select("*")
            .order("id")
        : supabase.rpc("finance_data", { p_kind: kind });
      const { data, error } = await q.range(offset, offset + 499);
      if (error) throw error;
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < 500) return rows;
    }
  }
  const [jobs, work, purchases, ledger, accounts, categories] =
    await Promise.all([
      read<FinanceData["jobs"][number]>("jobs"),
      read<FinanceData["work"][number]>("work"),
      read<FinanceData["purchases"][number]>("purchases"),
      read<FinanceData["ledger"][number]>("ledger"),
      read<FinanceData["accounts"][number]>("accounts"),
      read<FinanceData["categories"][number]>("categories"),
    ]);
  return { jobs, work, purchases, ledger, accounts, categories };
}
