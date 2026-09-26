import { requireAccess } from "@/lib/supabase/auth";
import Link from "next/link";
import { updateWorkItemAction } from "@/app/actions/workers";
import {
  PageHeader,
  Panel,
  StatusBadge,
  statusLabels,
} from "@/components/app-shell";
import { ActionForm } from "@/components/action-form";
import { SearchSelect } from "@/components/search-select";
import { SubmitButton } from "@/components/submit-button";
import { ReportActions } from "@/components/report-actions";
import {
  WorkshopFilters,
  Pagination,
  pageRows,
} from "@/components/workshop-filters";
import { parseFilters, filterQuery, type SearchParams } from "@/lib/filters";
import { getWorkQueue } from "@/lib/supabase/work-queue";
import { selectQueueWork } from "@/lib/work-queue";
import { workerDisplayName } from "@/lib/supabase/queries";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
export const dynamic = "force-dynamic";
export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAccess(["ADMIN", "INTAKE"]);
  const f = parseFilters(await searchParams),
    data = await getWorkQueue(),
    items = selectQueueWork(data, f);
  const workers = data.workers.map((w) => ({
    id: w.id,
    name: workerDisplayName(w),
  }));
  return (
    <>
      <PageHeader
        title="Görüləcək işlər"
        eyebrow="Qlobal iş növbəsi"
        actions={<ReportActions report="work" query={filterQuery(f)} />}
      />
      <WorkshopFilters
        scope="work"
        filters={f}
        workers={workers}
        works={[
          ...new Map(
            data.work.flatMap((w) =>
              w.work_catalog
                ? [[w.work_catalog.id, w.work_catalog] as const]
                : [],
            ),
          ).values(),
        ]}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pageRows(items, f).map((item) => {
          const job = data.jobs.find((j) => j.id === item.service_job_id);
          return (
            <Panel key={item.id} className="work-card">
              <div className="flex flex-wrap justify-between gap-2">
                <Link
                  href={`/vehicles/${item.service_job_id}`}
                  className="font-mono text-xl font-bold"
                >
                  {job?.vehicles?.plate}
                </Link>
                <StatusBadge>{statusLabels[item.status]}</StatusBadge>
              </div>
              <p className="text-sm text-[var(--muted)]">
                {job?.vehicles?.make} {job?.vehicles?.model}
              </p>
              <h2 className="mt-4 font-semibold">
                {item.custom_title || item.work_catalog?.name || "Digər iş"}
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Plan: {formatDate(item.planned_at)}
              </p>
              <ActionForm
                action={updateWorkItemAction}
                className="mt-4 grid gap-3"
              >
                <input type="hidden" name="id" value={item.id} />
                <SearchSelect
                  name="assigned_worker_id"
                  label="Usta"
                  options={workers.filter(
                    (w) =>
                      data.workers.find((row) => row.id === w.id)?.active ||
                      w.id === item.assigned_worker_id,
                  )}
                  defaultValue={item.assigned_worker_id ?? ""}
                />
                <label className="text-xs text-[var(--muted)]">
                  Status
                  <select
                    name="status"
                    defaultValue={item.status}
                    className="field mt-1"
                  >
                    {["TODO", "IN_PROGRESS", "DONE", "CANCELLED"].map((s) => (
                      <option key={s} value={s}>
                        {statusLabels[s as keyof typeof statusLabels]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[var(--muted)]">
                  Qeyd
                  <textarea
                    name="notes"
                    rows={3}
                    maxLength={250}
                    defaultValue={item.notes ?? ""}
                    className="field mt-1"
                  />
                </label>
                <SubmitButton variant="secondary" pendingText="Yenilənir...">
                  Yenilə
                </SubmitButton>
              </ActionForm>
            </Panel>
          );
        })}
      </div>
      {!items.length ? <EmptyState>İş tapılmadı.</EmptyState> : null}
      <Pagination filters={f} total={items.length} />
    </>
  );
}
