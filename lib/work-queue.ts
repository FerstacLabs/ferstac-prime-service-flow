import type {
  DbServiceJob,
  DbWorkItem,
  DbWorker,
} from "@/lib/supabase/queries";
import { inPeriod, type WorkshopFilters } from "@/lib/filters";

export type QueueWork = { compensation_mode?: "FIXED" | "PERCENTAGE" } & Pick<
  DbWorkItem,
  | "id"
  | "service_job_id"
  | "work_catalog_id"
  | "custom_title"
  | "assigned_worker_id"
  | "status"
  | "notes"
  | "planned_at"
  | "started_at"
  | "completed_at"
  | "work_catalog"
>;
export type WorkQueue = {
  jobs: Array<
    Pick<
      DbServiceJob,
      | "id"
      | "job_no"
      | "customer_name"
      | "received_at"
      | "target_delivery_date"
      | "status"
      | "funding_source"
      | "archived_at"
      | "deleted_at"
    > & { vehicles?: { plate: string; make: string; model: string } }
  >;
  work: QueueWork[];
  workers: Array<
    Pick<DbWorker, "id" | "first_name" | "last_name" | "active"> & {
      percentage_eligible?: boolean;
    }
  >;
};
export function selectQueueWork(data: WorkQueue, f: WorkshopFilters) {
  const jobs = new Map(data.jobs.map((j) => [j.id, j]));
  return data.work
    .filter((w) => {
      const j = jobs.get(w.service_job_id);
      return (
        j &&
        (f.visibility !== "active" || !j.deleted_at) &&
        (!f.job || j.id === f.job) &&
        (!f.plate || j.vehicles?.plate.includes(f.plate)) &&
        (!f.source || j.funding_source === f.source) &&
        (!f.worker || w.assigned_worker_id === f.worker) &&
        (!f.work || w.work_catalog_id === f.work) &&
        (!f.status || w.status === f.status) &&
        inPeriod(w.planned_at, f)
      );
    })
    .sort((a, b) =>
      f.sort === "plate"
        ? (jobs.get(a.service_job_id)?.vehicles?.plate || "").localeCompare(
            jobs.get(b.service_job_id)?.vehicles?.plate || "",
          )
        : (f.sort === "oldest" ? 1 : -1) *
          a.planned_at.localeCompare(b.planned_at),
    );
}
