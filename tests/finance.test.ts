import { describe, expect, it } from "vitest";
import { calculateFinancialSummary, purchaseOutstanding, purchaseTotal } from "@/lib/finance";
import type { Purchase, WorkItem } from "@/lib/types";

const basePurchase: Purchase = {
  id: "p",
  serviceJobId: "j",
  quantity: 2,
  unitPrice: 100,
  sourceType: "SUPPLIER",
  supplierId: "s",
  purchasedByAdmin: true,
  paymentStatus: "PARTIAL",
  paidAmount: 50,
  purchaseDate: "2026-09-07"
};

describe("financial calculations", () => {
  it("calculates purchase totals and supplier outstanding amounts", () => {
    expect(purchaseTotal(basePurchase)).toBe(200);
    expect(purchaseOutstanding(basePurchase)).toBe(150);
    expect(purchaseOutstanding({ ...basePurchase, sourceType: "INTERNAL_STOCK" })).toBe(0);
  });

  it("does not mutate agreed budget and derives remaining budget from costs", () => {
    const workItems: WorkItem[] = [
      { id: "w1", serviceJobId: "j", status: "DONE", laborCost: 120, plannedAt: "2026-09-07" },
      { id: "w2", serviceJobId: "j", status: "CANCELLED", laborCost: 999, plannedAt: "2026-09-07" }
    ];
    const summary = calculateFinancialSummary(1000, [basePurchase], workItems);

    expect(summary.partsCost).toBe(200);
    expect(summary.laborCost).toBe(120);
    expect(summary.totalCost).toBe(320);
    expect(summary.remainingBudget).toBe(680);
    expect(summary.estimatedGrossProfit).toBe(680);
    expect(summary.unpaidSupplierAmount).toBe(150);
  });
});
