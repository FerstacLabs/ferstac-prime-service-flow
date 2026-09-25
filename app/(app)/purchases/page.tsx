import { requireAccess } from "@/lib/supabase/auth";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { SearchSelect } from "@/components/search-select";
import { ReportActions } from "@/components/report-actions";
import { PurchaseEntry } from "@/components/purchase-entry";
import { PurchaseList } from "@/components/purchase-list";
import { WorkerCostForm, AdditionalWorkForm } from "@/components/work-costing";
import { paidFor, purchaseCost } from "@/lib/workshop";
import { formatQuantity } from "@/lib/decimal";
import { formatMoney } from "@/lib/format";
import {
  WorkshopFilters,
  Pagination,
  pageRows,
} from "@/components/workshop-filters";
import { parseFilters, filterQuery, type SearchParams } from "@/lib/filters";
import { getWorkshop, selectPurchases } from "@/lib/supabase/workshop";
import {
  supplierDisplayName,
  workerDisplayName,
  getMasterData,
} from "@/lib/supabase/queries";
export const dynamic = "force-dynamic";
export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAccess(["ADMIN"]);
  const params = await searchParams;
  const workTab = params.tab === "work";
  const f = parseFilters(params),
    data = await getWorkshop(),
    items = selectPurchases(data, f),
    master = await getMasterData();
  const jobs = data.jobs
      .filter((j) => !j.archived_at && !j.deleted_at)
      .map((j) => ({
        id: j.id,
        name: `${j.vehicles?.plate} · ${j.vehicles?.make} ${j.vehicles?.model} · ${j.job_no}`,
      })),
    suppliers = data.suppliers
      .filter((s) => s.active)
      .map((s) => ({
        id: s.id,
        name: supplierDisplayName(s),
      })),
    workers = data.workers
      .filter((w) => w.active)
      .map((w) => ({
        id: w.id,
        name: workerDisplayName(w),
      }));
  const selectedJob = data.jobs.find(
    (j) => j.id === f.job && !j.archived_at && !j.deleted_at,
  );
  const requirements = data.parts.filter(
    (p) => p.service_job_id === selectedJob?.id,
  );
  return (
    <>
      <PageHeader
        title="Satınalma"
        eyebrow="Alışlar və əməliyyat mayası"
        actions={<ReportActions report="purchases" query={filterQuery(f)} />}
      />
      <nav
        aria-label="Satınalma bölmələri"
        className="mb-5 flex flex-wrap gap-4 border-b border-[var(--border)] pb-3"
      >
        <Link
          aria-current={!workTab ? "page" : undefined}
          className={
            !workTab
              ? "font-semibold text-[var(--accent)]"
              : "text-[var(--muted)]"
          }
          href={`/purchases?job=${f.job}`}
        >
          Detallar / alışlar
        </Link>
        <Link
          aria-current={workTab ? "page" : undefined}
          className={
            workTab
              ? "font-semibold text-[var(--accent)]"
              : "text-[var(--muted)]"
          }
          href={`/purchases?tab=work&job=${f.job}`}
        >
          İşçilik / usta maya
        </Link>
      </nav>
      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">
          {workTab ? "İşçilik / usta maya" : "Yeni alış"}
        </h2>
        <form className="mb-4 grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          {workTab ? <input type="hidden" name="tab" value="work" /> : null}
          <SearchSelect
            name="job"
            label="Avtomobil / servis kartı"
            required
            options={jobs}
            defaultValue={f.job}
          />
          <button className="btn btn-primary">Seç</button>
        </form>
        {workTab ? (
          <>
            {data.work
              .filter((w) => w.service_job_id === selectedJob?.id)
              .map((work) => (
                <article
                  key={work.id}
                  className="border-t border-[var(--border)] py-4"
                >
                  <WorkerCostForm
                    work={work}
                    paid={paidFor(data.cash, "WORKER_WORK_ITEM", work.id)}
                    workers={data.workers
                      .filter(
                        (w) => w.active || w.id === work.assigned_worker_id,
                      )
                      .map((w) => ({ id: w.id, name: workerDisplayName(w) }))}
                  />
                </article>
              ))}
            {selectedJob ? (
              <details className="mt-4 border-t border-[var(--border)] pt-4">
                <summary className="cursor-pointer font-semibold">
                  Təklifdən kənar əlavə iş
                </summary>
                <AdditionalWorkForm
                  jobId={selectedJob.id}
                  catalog={master.workCatalog}
                  units={master.units}
                  workers={workers}
                />
              </details>
            ) : null}
          </>
        ) : (
          <>
            {requirements.map((part) => {
              const purchase = data.purchases.find(
                (p) => p.required_part_id === part.id,
              );
              return (
                <div
                  key={part.id}
                  className="border-t border-[var(--border)] py-4"
                >
                  <h3 className="mb-3 font-semibold">
                    {part.part_catalog?.name}
                  </h3>
                  {purchase ? (
                    <div>
                      <p className="text-sm text-[var(--success)]">
                        {purchase.source_type === "CUSTOMER_PROVIDED"
                          ? "Müştəri təqdim edib"
                          : "Alınıb"}
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {formatQuantity(part.quantity ?? 1)}{" "}
                        {part.unit_catalog?.name ?? "Ədəd"} · Müştəri vahid
                        qiyməti:{" "}
                        {formatMoney(
                          part.customer_unit_price ?? part.quoted_price,
                        )}{" "}
                        · Müştəri məbləği: {formatMoney(part.quoted_price)} ·
                        Faktiki maya: {formatMoney(purchaseCost(purchase))}
                      </p>
                      {part.cost_note ? (
                        <p className="mt-2 text-sm">
                          <strong>Maya qeydi: </strong>
                          {part.cost_note}
                        </p>
                      ) : null}
                      {part.is_additional ? (
                        <span className="text-xs text-[var(--accent)]">
                          Əlavə alış
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <PurchaseEntry
                      jobId={part.service_job_id}
                      part={part}
                      suppliers={suppliers}
                      workers={workers}
                    />
                  )}
                </div>
              );
            })}
            {selectedJob && !requirements.length ? (
              <p className="text-sm text-[var(--muted)]">
                Bu servis kartında tələb olunan detal yoxdur.
              </p>
            ) : null}
            {selectedJob ? (
              <details className="mt-4 border-t border-[var(--border)] pt-4">
                <summary className="cursor-pointer text-sm text-[var(--muted)]">
                  Təklifdən kənar əlavə alış
                </summary>
                <div className="mt-4">
                  <PurchaseEntry
                    jobId={f.job}
                    catalog={master.partCatalog}
                    suppliers={suppliers}
                    workers={workers}
                    units={master.units}
                  />
                </div>
              </details>
            ) : null}
          </>
        )}
      </section>
      {!workTab ? (
        <>
          <Link
            href="/suppliers"
            className="mb-5 inline-block text-sm text-[var(--accent)]"
          >
            Təchizatçıları idarə et
          </Link>
          <h2 className="text-lg font-semibold">Alış tarixçəsi</h2>
          <WorkshopFilters
            scope="purchases"
            filters={f}
            jobs={jobs}
            suppliers={suppliers}
          />
          <PurchaseList data={data} items={pageRows(items, f)} editable />
          <Pagination filters={f} total={items.length} />
        </>
      ) : null}
    </>
  );
}
