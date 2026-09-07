import type { Purchase, WorkItem } from "@/lib/types";

export type FinancialSummary = {
  partsCost: number;
  laborCost: number;
  totalCost: number;
  remainingBudget: number;
  estimatedGrossProfit: number;
  totalPaidToSuppliers: number;
  unpaidSupplierAmount: number;
};

export function purchaseTotal(purchase: Pick<Purchase, "quantity" | "unitPrice">) {
  return Number((purchase.quantity * purchase.unitPrice).toFixed(2));
}

export function purchaseOutstanding(purchase: Purchase) {
  if (purchase.sourceType !== "SUPPLIER") return 0;
  return Math.max(0, purchaseTotal(purchase) - purchase.paidAmount);
}

export function calculateFinancialSummary(
  agreedBudget: number,
  purchases: Purchase[],
  workItems: WorkItem[]
): FinancialSummary {
  const partsCost = purchases.reduce((total, purchase) => total + purchaseTotal(purchase), 0);
  const laborCost = workItems
    .filter((item) => item.status !== "CANCELLED")
    .reduce((total, item) => total + item.laborCost, 0);
  const totalCost = partsCost + laborCost;
  const unpaidSupplierAmount = purchases.reduce((total, purchase) => total + purchaseOutstanding(purchase), 0);
  const totalPaidToSuppliers = purchases
    .filter((purchase) => purchase.sourceType === "SUPPLIER")
    .reduce((total, purchase) => total + Math.min(purchaseTotal(purchase), purchase.paidAmount), 0);

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
