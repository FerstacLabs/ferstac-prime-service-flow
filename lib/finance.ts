import type { Purchase, WorkItem } from "@/lib/types";
import { multiplyMoney } from "@/lib/decimal";
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
  if (purchase.sourceType !== "SUPPLIER") return 0;
  return Math.max(
    0,
    subtractMoney(purchaseTotal(purchase), purchase.paidAmount),
  );
}

export function calculateFinancialSummary(
  agreedBudget: number,
  purchases: Purchase[],
  workItems: WorkItem[],
): FinancialSummary {
  const partsCost = sumMoney(purchases.map(purchaseTotal));
  const laborCost = sumMoney(
    workItems
      .filter((item) => item.status !== "CANCELLED")
      .map((item) => item.laborCost),
  );
  const totalCost = sumMoney([partsCost, laborCost]);
  const unpaidSupplierAmount = sumMoney(purchases.map(purchaseOutstanding));
  const totalPaidToSuppliers = sumMoney(
    purchases
      .filter((purchase) => purchase.sourceType === "SUPPLIER")
      .map((purchase) =>
        Math.min(purchaseTotal(purchase), purchase.paidAmount),
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
