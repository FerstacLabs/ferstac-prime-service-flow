import { getAuthedSupabase } from "@/lib/supabase/queries";
export async function masterDirectory<T>(
  kind: "worker" | "account" | "category",
): Promise<T[]> {
  const { supabase } = await getAuthedSupabase();
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .rpc("master_directory", { p_kind: kind })
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}
