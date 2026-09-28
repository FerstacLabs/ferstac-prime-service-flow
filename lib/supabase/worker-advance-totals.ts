import { getAuthedSupabase } from "@/lib/supabase/queries";
import { sumMoney } from "@/lib/workshop";

export async function workerAdvanceTotals() {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const totals = new Map<string, number>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("worker_advance_allocations")
      .select("id,work_item_id,amount")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Usta avanslarının bölgüsü yüklənmədi.");
    for (const row of data ?? [])
      totals.set(
        row.work_item_id,
        sumMoney([totals.get(row.work_item_id) ?? 0, Number(row.amount)]),
      );
    if (!data || data.length < 500) return totals;
  }
}
