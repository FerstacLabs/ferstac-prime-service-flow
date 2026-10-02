import { getAuthedSupabase } from "@/lib/supabase/queries";
import type { FinanceData, FinancePurchase } from "@/lib/finance";
export async function purchaseLifecycleData(jobId?: string) {
  const { supabase } = await getAuthedSupabase("ADMIN", "CASHIER");
  async function read<T>(kind: string) {
    const result: T[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .rpc("finance_data", { p_kind: kind, p_job: jobId ?? null })
        .range(offset, offset + 499);
      if (error) throw error;
      result.push(...((data ?? []) as T[]));
      if (!data || data.length < 500) return result;
    }
  }
  const [purchases, purchaseReturns, supplierCredits] = await Promise.all([
    read<FinancePurchase>("purchases"),
    read<NonNullable<FinanceData["purchaseReturns"]>[number]>(
      "purchase_returns",
    ),
    read<NonNullable<FinanceData["supplierCredits"]>[number]>(
      "supplier_credit_allocations",
    ),
  ]);
  return { purchases, purchaseReturns, supplierCredits };
}
