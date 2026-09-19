import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, statusLabels } from "@/components/app-shell";
import { MoneyGrid } from "@/components/job-finance";
import { ReportActions } from "@/components/report-actions";
import {
  WorkshopFilters,
  Pagination,
  pageRows,
} from "@/components/workshop-filters";
import { getWorkshop } from "@/lib/supabase/workshop";
import { workerDisplayName, workTitle } from "@/lib/supabase/queries";
import { parseFilters, filterQuery, type SearchParams } from "@/lib/filters";
import { workerFinance } from "@/lib/worker-finance";
import { costKnown, paidFor } from "@/lib/workshop";
import { formatDate, formatMoney } from "@/lib/format";
export default async function WorkerPage({
  params,
  searchParams,
}: {
  params: Promise<{ workerId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { workerId } = await params,
    f = parseFilters({ ...(await searchParams), worker: workerId }),
    data = await getWorkshop(),
    worker = data.workers.find((w) => w.id === workerId);
  if (!worker) notFound();
  const n = workerFinance(data, workerId, f);
  return (
    <>
      <PageHeader
        title={workerDisplayName(worker)}
        eyebrow={worker.worker_roles?.name}
        actions={<ReportActions report="workers" query={filterQuery(f)} />}
      />
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        {[
          ["Ata adı", worker.father_name],
          ["Telefon", worker.phone],
          [
            "İşə başlama",
            worker.hire_date ? formatDate(worker.hire_date) : null,
          ],
          ["Status", worker.active ? "Aktiv" : "Deaktiv"],
          ["Qeyd", worker.notes],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[var(--muted)]">{k}</dt>
            <dd>{v || "-"}</dd>
          </div>
        ))}
      </dl>
      <WorkshopFilters
        scope="workers"
        filters={f}
        fixed={{ worker: workerId }}
      />
      <p className="text-sm text-[var(--muted)]">
        Tapşırıq: {n.items.length} · Aktiv: {n.active.length} · Tamamlanıb:{" "}
        {n.done.length} · Ləğv: {n.cancelled.length} · Avtomobil:{" "}
        {new Set(n.items.map((w) => w.service_job_id)).size}
      </p>
      <MoneyGrid
        items={[
          ["Qazanılmış əmək məbləği", n.earned],
          ["Seçilən işlərə ödənilib (bütün tarixçə)", n.paid],
          ["Qalıq alacaq", n.outstanding],
          ["Aktiv işlərin gözlənilən məbləği", n.expected],
        ]}
      />
      {n.missing ? (
        <p className="text-[var(--warning)]">
          {n.missing} işdə maya daxil edilməyib.
        </p>
      ) : null}
      <h2 className="my-4 text-lg font-semibold">İş tarixçəsi</h2>
      <div className="divide-y divide-[var(--border)]">
        {pageRows(n.items, f).map((w) => {
          const j = data.jobs.find((j) => j.id === w.service_job_id);
          return (
            <article key={w.id} className="py-4">
              <Link
                href={`/vehicles/${w.service_job_id}`}
                className="font-mono text-[var(--accent)]"
              >
                {j?.vehicles?.plate} · {j?.vehicles?.make} {j?.vehicles?.model}
              </Link>
              <h3 className="mt-1 font-semibold">{workTitle(w)}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {statusLabels[w.status]} · Plan: {formatDate(w.planned_at)} ·
                Tamamlanma: {w.completed_at ? formatDate(w.completed_at) : "-"}
              </p>
              <p className="mt-2 text-sm">
                Usta mayası:{" "}
                {costKnown(w)
                  ? formatMoney(w.labor_cost)
                  : "Maya daxil edilməyib"}{" "}
                · Ödənilib:{" "}
                {formatMoney(paidFor(data.cash, "WORKER_WORK_ITEM", w.id))}
              </p>
              <p className="mt-2 break-words text-sm">{w.notes}</p>
            </article>
          );
        })}
      </div>
      <Pagination filters={f} total={n.items.length} />
    </>
  );
}
