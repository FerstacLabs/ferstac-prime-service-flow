import { requireAccess } from "@/lib/supabase/auth";
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
import { workerFinance, workerWorkFinance } from "@/lib/worker-finance";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
export default async function WorkerPage({
  params,
  searchParams,
}: {
  params: Promise<{ workerId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAccess(["ADMIN"]);
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
      <dl className="identity-grid grid gap-4 text-sm sm:grid-cols-3">
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
          <div key={k} className={k === "Qeyd" ? "wide-detail" : undefined}>
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
          ["Avans", n.advance],
          ["Qazanılmış qalıq alacaq", n.outstanding],
          ["Qalan razılaşdırılmış usta məbləği", n.remaining],
          ["Aktiv işlərin razılaşdırılmış usta məbləği", n.expected],
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
          const j = data.jobs.find((j) => j.id === w.service_job_id),
            finance = workerWorkFinance(w, data.cash);
          return (
            <article key={w.id} className="cash-work-item py-5">
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
              <MoneyGrid
                items={[
                  ["Müştəriyə deyilən qiymət", w.quoted_price],
                  ["Usta mayası", finance.known ? w.labor_cost : null],
                  ["Qazanılmış", finance.earned],
                  ["Ustaya ödənilib", finance.paid],
                  ["Avans", finance.advance],
                  ["Qazanılmış qalıq", finance.outstanding],
                  ["Qalan razılaşdırılmış usta məbləği", finance.remaining],
                ]}
              />
              <p className="mt-2 break-words text-sm">{w.notes}</p>
            </article>
          );
        })}
      </div>
      {!n.items.length ? <EmptyState>Bu dövrdə iş yoxdur.</EmptyState> : null}
      <Pagination filters={f} total={n.items.length} />
    </>
  );
}
