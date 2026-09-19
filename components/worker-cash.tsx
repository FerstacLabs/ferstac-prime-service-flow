import Link from "next/link";
import { CarFront, Users, ArrowLeft } from "lucide-react";
import {
  WorkshopFilters,
  Pagination,
  pageRows,
} from "@/components/workshop-filters";
import {
  MoneyGrid,
  PaymentForm,
  WorkerCostForm,
} from "@/components/job-finance";
import { StatusBadge, statusLabels } from "@/components/app-shell";
import { filterQuery, type WorkshopFilters as Filters } from "@/lib/filters";
import {
  selectWorkerFinances,
  workerPaymentHistory,
  workerWorkFinance,
} from "@/lib/worker-finance";
import type { WorkshopData } from "@/lib/supabase/workshop";
import { workerDisplayName, workTitle } from "@/lib/supabase/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { sumMoney } from "@/lib/workshop";

export function CashViews({ view }: { view: Filters["view"] }) {
  return (
    <nav
      aria-label="Kassa görünüşü"
      className="mb-6 flex gap-6 border-b border-[var(--border)]"
    >
      {(
        [
          { id: "vehicles", label: "Avtomobillər", Icon: CarFront },
          { id: "workers", label: "İşçilər", Icon: Users },
        ] as const
      ).map(({ id, label, Icon }) => (
        <Link
          key={id}
          href={`/kassa?view=${id}`}
          aria-current={view === id ? "page" : undefined}
          className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-semibold ${view === id ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)]"}`}
        >
          <Icon size={18} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function WorkerCash({
  data,
  filters: f,
}: {
  data: WorkshopData;
  filters: Filters;
}) {
  const workers = selectWorkerFinances(data, f),
    selected = f.worker
      ? workers.find((n) => n.worker.id === f.worker)
      : undefined;
  const history = selected ? workerPaymentHistory(data, selected.items) : [];
  return (
    <>
      <WorkshopFilters
        scope="worker-cash"
        filters={f}
        fixed={{ view: "workers" }}
        workers={data.workers.map((w) => ({
          id: w.id,
          name: workerDisplayName(w),
        }))}
      />
      {!selected ? (
        <>
          <MoneyGrid
            items={[
              ["Qazanılmış", sumMoney(workers.map((n) => n.earned))],
              [
                "Seçilən işlərə ödənilib (bütün tarixçə)",
                sumMoney(workers.map((n) => n.paid)),
              ],
              ["Qalıq alacaq", sumMoney(workers.map((n) => n.outstanding))],
            ]}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead>
                <tr className="text-[var(--muted)]">
                  {[
                    "İşçi / ixtisas",
                    "Aktiv iş",
                    "Tamamlanmış",
                    "Qazanılmış",
                    "Ödənilib",
                    "Qalıq alacaq",
                  ].map((label) => (
                    <th key={label} className="py-3 pr-4">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows(workers, f).map((n) => (
                  <tr
                    key={n.worker.id}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="py-4 pr-4">
                      <Link
                        className="font-semibold text-[var(--accent)]"
                        href={`/kassa?${filterQuery(f, { worker: n.worker.id })}`}
                      >
                        {workerDisplayName(n.worker)}
                      </Link>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {n.worker.worker_roles?.name || "-"}
                      </p>
                      {n.missing ? (
                        <p className="mt-1 text-xs text-[var(--warning)]">
                          Maya daxil edilməyib: {n.missing} iş
                        </p>
                      ) : null}
                    </td>
                    <td>{n.active.length}</td>
                    <td>{n.done.length}</td>
                    <td>{formatMoney(n.earned)}</td>
                    <td>{formatMoney(n.paid)}</td>
                    <td className="font-semibold">
                      {formatMoney(n.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!workers.length ? (
            <p className="py-5 text-[var(--muted)]">
              Seçilmiş filtrlərə uyğun işçi yoxdur.
            </p>
          ) : null}
          <Pagination filters={f} total={workers.length} />
        </>
      ) : (
        <>
          <Link
            href={`/kassa?${filterQuery(f, { worker: "" })}`}
            className="mb-4 inline-flex items-center gap-2 text-sm text-[var(--muted)]"
          >
            <ArrowLeft size={16} /> İşçilər
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                {workerDisplayName(selected.worker)}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {selected.worker.worker_roles?.name || "-"}
              </p>
            </div>
            <Link
              href={`/workers/${selected.worker.id}`}
              className="btn btn-secondary"
            >
              İşçi kartı
            </Link>
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">
            Servis kartı:{" "}
            {new Set(selected.items.map((w) => w.service_job_id)).size} · İş:{" "}
            {selected.items.length} · Aktiv: {selected.active.length} ·
            Tamamlanmış: {selected.done.length}
          </p>
          <MoneyGrid
            items={[
              ["Qazanılmış", selected.earned],
              ["Seçilən işlərə ödənilib (bütün tarixçə)", selected.paid],
              ["Qalıq alacaq", selected.outstanding],
              ["Aktiv işlərin gözlənilən məbləği", selected.expected],
            ]}
          />
          <section className="mt-5">
            <h2 className="border-b border-[var(--border)] pb-3 text-lg font-semibold">
              İşlər üzrə hesablaşma
            </h2>
            {pageRows(selected.items, f).map((work) => {
              const job = data.jobs.find((j) => j.id === work.service_job_id),
                n = workerWorkFinance(work, data.cash);
              return (
                <article
                  key={work.id}
                  id={`work-${work.id}`}
                  className="scroll-mt-5 border-b border-[var(--border)] py-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                      href={`/vehicles/${work.service_job_id}`}
                      className="font-mono font-semibold text-[var(--accent)]"
                    >
                      {job?.vehicles?.plate} · {job?.vehicles?.make}{" "}
                      {job?.vehicles?.model}
                    </Link>
                    <StatusBadge>{statusLabels[work.status]}</StatusBadge>
                  </div>
                  <h3 className="mt-3 font-semibold">{workTitle(work)}</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {job?.job_no} ·{" "}
                    {formatDate(work.completed_at || work.planned_at)}
                  </p>
                  <MoneyGrid
                    items={[
                      ["Müştəriyə deyilən qiymət", work.quoted_price],
                      ["Usta mayası", n.known ? work.labor_cost : null],
                      ["Qazanılmış", n.earned],
                      ["Ustaya ödənilib", n.paid],
                      ["Ustaya qalıq", n.outstanding],
                    ]}
                  />
                  {!n.known ? (
                    <p className="text-sm text-[var(--warning)]">
                      Maya daxil edilməyib
                    </p>
                  ) : null}
                  <WorkerCostForm work={work} paid={n.paid} />
                  <PaymentForm
                    job={work.service_job_id}
                    type="WORKER_WORK_ITEM"
                    target={work.id}
                    remaining={n.outstanding}
                    label="Ustaya ödəniş et"
                  />
                </article>
              );
            })}
            {!selected.items.length ? (
              <p className="py-5 text-[var(--muted)]">Bu dövrdə iş yoxdur.</p>
            ) : null}
            <Pagination filters={f} total={selected.items.length} />
          </section>
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">
              Seçilmiş işlərin ödəniş tarixçəsi
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead>
                  <tr className="text-[var(--muted)]">
                    {[
                      "Tarix",
                      "Avtomobil",
                      "İş",
                      "Qazanılmış (cari)",
                      "Ödəniş",
                      "Qalıq (cari)",
                      "Qeyd",
                    ].map((label) => (
                      <th key={label} className="py-3 pr-4">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(
                    ({ payment: t, item, job, earned, outstanding }) => (
                      <tr
                        key={t.id}
                        className={`border-t border-[var(--border)] ${t.voided_at ? "opacity-60" : ""}`}
                      >
                        <td className="py-4 pr-4">
                          {formatDate(t.transaction_date)}
                        </td>
                        <td className="pr-4">
                          <Link
                            className="text-[var(--accent)]"
                            href={`/vehicles/${item.service_job_id}`}
                          >
                            {job?.vehicles?.plate}
                          </Link>
                        </td>
                        <td className="max-w-60 pr-4">
                          <Link
                            href={`/vehicles/${item.service_job_id}#work-${item.id}`}
                            className="hover:underline"
                          >
                            {workTitle(item)}
                          </Link>
                        </td>
                        <td className="pr-4">{formatMoney(earned)}</td>
                        <td className="pr-4">
                          {formatMoney(t.amount)}
                          {t.voided_at ? (
                            <p className="text-xs">Ləğv edilib</p>
                          ) : null}
                        </td>
                        <td className="pr-4">{formatMoney(outstanding)}</td>
                        <td className="max-w-60 break-words">
                          {t.notes || "-"}
                          {t.voided_at ? <p>{t.void_reason}</p> : null}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            {!history.length ? (
              <p className="py-5 text-[var(--muted)]">Ödəniş yoxdur.</p>
            ) : null}
          </section>
        </>
      )}
    </>
  );
}
