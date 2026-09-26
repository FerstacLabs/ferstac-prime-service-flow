import { requireAccess } from "@/lib/supabase/auth";
import type { WorkQueue } from "@/lib/work-queue";

export async function getWorkQueue(): Promise<WorkQueue> {
  const { supabase } = await requireAccess(["ADMIN", "INTAKE"]);
  async function rows<K extends keyof WorkQueue>(
    kind: K,
  ): Promise<WorkQueue[K]> {
    const result: WorkQueue[K] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .rpc("work_queue_data", { p_kind: kind })
        .range(offset, offset + 499);
      if (error) throw error;
      result.push(...(data ?? []));
      if (!data || data.length < 500) return result;
    }
  }
  const jobs = await rows("jobs"),
    work = await rows("work"),
    workers = await rows("workers");
  return { jobs, work, workers };
}
