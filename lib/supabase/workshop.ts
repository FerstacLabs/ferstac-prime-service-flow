import {
  getAuthedSupabase,
  type DbPurchase,
  type DbServiceJob,
  type DbWorkItem,
  type DbSupplier,
  type DbWorker,
} from "@/lib/supabase/queries";
import type { CashTransaction, RequiredPart } from "@/lib/workshop";
import { inPeriod, parseFilters, type WorkshopFilters } from "@/lib/filters";
import { jobFinance } from "@/lib/workshop";

// Range through PostgREST's response cap on the server; reports never truncate at 1,000 rows.
async function rows<T>(table: string, select: string, jobId?: string) {
  const { supabase } = await getAuthedSupabase();
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase
      .from(table)
      .select(select)
      .order("id")
      .range(offset, offset + 499);
    if (jobId)
      query = query.eq(
        table === "service_jobs" ? "id" : "service_job_id",
        jobId,
      );
    const { data, error } = await query;
    if (error) throw error;
    result.push(...((data ?? []) as T[]));
    if (!data || data.length < 500) break;
  }
  return result;
}
export async function getWorkshop(jobId?: string) {
  const { supabase, profile } = await getAuthedSupabase();
  if (profile.role === "INTAKE") {
    const [jobs, parts] = await Promise.all([
      rows<DbServiceJob>("service_jobs", "*,vehicles(*)", jobId),
      rows<RequiredPart>(
        "job_required_parts",
        "*,part_catalog(name),unit_catalog(id,name,short_name)",
        jobId,
      ),
    ]);
    const work: DbWorkItem[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .rpc("intake_work_items", { p_job: jobId ?? null })
        .range(offset, offset + 499);
      if (error) throw error;
      work.push(...((data ?? []) as DbWorkItem[]));
      if (!data || data.length < 500) break;
    }
    return {
      jobs,
      parts,
      work,
      purchases: [] as DbPurchase[],
      cash: [] as CashTransaction[],
      workers: [] as DbWorker[],
      suppliers: [] as DbSupplier[],
    };
  }
  const [jobs, work, parts, purchases, cash, workers, suppliers] =
    await Promise.all([
      rows<DbServiceJob>("service_jobs", "*,vehicles(*)", jobId),
      rows<DbWorkItem>(
        "job_work_items",
        "*,work_catalog(id,name,category),workers(id,first_name,last_name,role_id),unit_catalog(id,name,short_name)",
        jobId,
      ),
      rows<RequiredPart>(
        "job_required_parts",
        "*,part_catalog(name),unit_catalog(id,name,short_name)",
        jobId,
      ),
      rows<DbPurchase>(
        "purchases",
        "*,part_catalog(id,name,category),suppliers(id,company_name,shop_name,first_name,last_name,father_name),workers(id,first_name,last_name)",
        jobId,
      ),
      rows<CashTransaction>("cash_transactions", "*", jobId),
      rows<DbWorker>("workers", "*,worker_roles(id,name)"),
      rows<DbSupplier>("suppliers", "*"),
    ]);
  return {
    jobs,
    work,
    parts,
    purchases: purchases.filter((p) => !p.voided_at),
    cash,
    workers,
    suppliers,
  };
}
export type WorkshopData = Awaited<ReturnType<typeof getWorkshop>>;
export function selectJobs(
  data: WorkshopData,
  f = parseFilters({}),
  includeArchived = false,
) {
  return data.jobs
    .filter(
      (j) =>
        (includeArchived ||
          f.visibility === "all" ||
          (f.visibility === "archived" ? !!j.archived_at : !j.archived_at)) &&
        (!f.job || j.id === f.job) &&
        (!f.plate || j.vehicles?.plate.includes(f.plate)) &&
        (!f.status || j.status === f.status) &&
        (!f.source || j.funding_source === f.source),
    )
    .filter((j) => {
      if (!f.balance) return true;
      const n = jobFinance(j, data.work, data.parts, data.purchases, data.cash);
      const balance =
        n.customerReceivable + n.supplierPayable + n.workerPayable;
      return f.balance === "closed"
        ? balance === 0 &&
            n.missingWork === 0 &&
            n.missingParts === 0 &&
            n.workerExpected === 0
        : f.balance === "customer"
          ? n.customerReceivable > 0
          : f.balance === "supplier"
            ? n.supplierPayable > 0
            : f.balance === "worker"
              ? n.workerPayable > 0
              : balance > 0;
    })
    .sort((a, b) =>
      f.sort === "plate"
        ? (a.vehicles?.plate ?? "").localeCompare(b.vehicles?.plate ?? "")
        : (f.sort === "oldest" ? 1 : -1) *
          a.received_at.localeCompare(b.received_at),
    );
}
export function selectWork(data: WorkshopData, f: WorkshopFilters) {
  const jobs = new Set(
    selectJobs(data, { ...f, status: "" }, true).map((j) => j.id),
  );
  return data.work.filter(
    (w) =>
      jobs.has(w.service_job_id) &&
      (f.visibility !== "active" ||
        !data.jobs.find((j) => j.id === w.service_job_id)?.deleted_at) &&
      (!f.worker || w.assigned_worker_id === f.worker) &&
      (!f.work || w.work_catalog_id === f.work) &&
      (!f.status || w.status === f.status) &&
      inPeriod(w.planned_at, f),
  );
}
export function selectPurchases(data: WorkshopData, f: WorkshopFilters) {
  const jobs = new Set(
    selectJobs(data, { ...f, status: "" }, true).map((j) => j.id),
  );
  return data.purchases
    .filter(
      (p) =>
        jobs.has(p.service_job_id) &&
        (f.visibility !== "active" ||
          !data.jobs.find((j) => j.id === p.service_job_id)?.deleted_at) &&
        (!f.supplier || p.supplier_id === f.supplier) &&
        (!f.payment || p.payment_status === f.payment) &&
        inPeriod(p.purchase_date, f),
    )
    .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));
}
export function selectCash(data: WorkshopData, f: WorkshopFilters) {
  const jobs = new Set(
    selectJobs(data, { ...f, status: "" }, true).map((j) => j.id),
  );
  return data.cash
    .filter(
      (t) =>
        jobs.has(t.service_job_id) &&
        (!f.direction || t.direction === f.direction) &&
        (!f.type || t.allocation_type === f.type) &&
        inPeriod(t.transaction_date, f),
    )
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
}
