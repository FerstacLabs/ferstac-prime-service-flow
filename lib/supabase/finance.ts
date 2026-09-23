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
  if (purchase.source_type !== "SUPPLIER") return 0;
  return Math.max(
    0,
    subtractMoney(dbPurchaseTotal(purchase), purchase.paid_amount),
  );
}

export function dbFinancialSummary(
  agreedBudget: number,
  purchases: DbPurchase[],
  workItems: DbWorkItem[],
) {
  const partsCost = sumMoney(purchases.map(dbPurchaseTotal));
  const laborCost = sumMoney(
    workItems
      .filter((item) => item.status !== "CANCELLED")
      .map((item) => item.labor_cost),
  );
  const totalCost = sumMoney([partsCost, laborCost]);
  const unpaidSupplierAmount = sumMoney(purchases.map(dbPurchaseOutstanding));
  const totalPaidToSuppliers = sumMoney(
    purchases
      .filter((purchase) => purchase.source_type === "SUPPLIER")
      .map((purchase) =>
        Math.min(dbPurchaseTotal(purchase), purchase.paid_amount),
      ),
  );

  return {
    partsCost,
    laborCost,
    totalCost,
    remainingBudget: subtractMoney(agreedBudget, totalCost),
    estimatedGrossProfit: subtractMoney(agreedBudget, totalCost),
    totalPaidToSuppliers,
    unpaidSupplierAmount,
  };
}
