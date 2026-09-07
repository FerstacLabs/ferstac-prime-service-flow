import type { DbPurchase, DbWorkItem } from "@/lib/supabase/queries";

export function dbPurchaseTotal(purchase: Pick<DbPurchase, "quantity" | "unit_price" | "total_price">) {
  return Number((purchase.total_price ?? purchase.quantity * purchase.unit_price).toFixed(2));
}

export function dbPurchaseOutstanding(purchase: DbPurchase) {
  if (purchase.source_type !== "SUPPLIER") return 0;
  return Math.max(0, dbPurchaseTotal(purchase) - purchase.paid_amount);
}

export function dbFinancialSummary(agreedBudget: number, purchases: DbPurchase[], workItems: DbWorkItem[]) {
  const partsCost = purchases.reduce((total, purchase) => total + dbPurchaseTotal(purchase), 0);
  const laborCost = workItems
    .filter((item) => item.status !== "CANCELLED")
    .reduce((total, item) => total + item.labor_cost, 0);
  const totalCost = partsCost + laborCost;
  const unpaidSupplierAmount = purchases.reduce((total, purchase) => total + dbPurchaseOutstanding(purchase), 0);
  const totalPaidToSuppliers = purchases
    .filter((purchase) => purchase.source_type === "SUPPLIER")
    .reduce((total, purchase) => total + Math.min(dbPurchaseTotal(purchase), purchase.paid_amount), 0);

  return {
    partsCost,
    laborCost,
    totalCost,
    remainingBudget: agreedBudget - totalCost,
    estimatedGrossProfit: agreedBudget - totalCost,
    totalPaidToSuppliers,
    unpaidSupplierAmount
  };
}

