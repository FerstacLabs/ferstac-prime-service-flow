import { requireAccess } from "@/lib/supabase/auth";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { JobFinance, MoneyGrid, CashHistory } from "@/components/job-finance";
import {
  WorkshopFilters,
  Pagination,
  pageRows,
} from "@/components/workshop-filters";
import { getWorkshop, selectJobs, selectCash } from "@/lib/supabase/workshop";
import { parseFilters, filterQuery, type SearchParams } from "@/lib/filters";
import { cashFlow, jobFinance } from "@/lib/workshop";
import { formatMoney } from "@/lib/format";
import { CashViews, WorkerCash } from "@/components/worker-cash";
import { EmptyState } from "@/components/empty-state";
export const dynamic = "force-dynamic";
export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { profile } = await requireAccess(["ADMIN", "CASHIER"]);
  const f = parseFilters(await searchParams),
    data = await getWorkshop(),
    jobs = selectJobs(data, f, true),
    cash = selectCash(data, f),
    flow = cashFlow(cash),
    selected = data.jobs.find((j) => j.id === f.job);
  if (f.view === "workers")
    return (
      <>
        <PageHeader
          title="Kassa"
          eyebrow="İşçilərlə hesablaşma"
          actions={<ReportActions report="kassa" query={filterQuery(f)} />}
        />
        <CashViews view={f.view} />
        <WorkerCash data={data} filters={f} admin={profile.role === "ADMIN"} />
      </>
    );
  return (
    <>
      <PageHeader
        title="Kassa"
        eyebrow="Ödənişlər və borclar"
        actions={<ReportActions report="kassa" query={filterQuery(f)} />}
      />
      <CashViews view={f.view} />
      <WorkshopFilters
        scope="kassa"
        filters={f}
        jobs={data.jobs.map((j) => ({
          id: j.id,
          name: `${j.vehicles?.plate} · ${j.job_no}`,
        }))}
      />
      <MoneyGrid
        items={[
          ["Mədaxil (seçilmiş dövr)", flow.cashIn],
          ["Məxaric (seçilmiş dövr)", flow.cashOut],
          ["Net kassa axını", flow.netCashFlow],
        ]}
      />
      {selected ? (
        <>
          <div className="my-4 flex flex-wrap items-center justify-between gap-3">
            <Link
              href={
                profile.role === "ADMIN"
                  ? `/vehicles/${selected.id}`
                  : `/kassa?job=${selected.id}`
              }
              className="font-mono text-xl font-semibold"
            >
              {selected.vehicles?.plate} · {selected.vehicles?.make}{" "}
              {selected.vehicles?.model}
            </Link>
            {profile.role === "ADMIN" ? (
              <ReportActions report={`vehicle/${selected.id}`} />
            ) : null}
          </div>
          <JobFinance
            job={selected}
            data={data}
            editable
            showQuotation={profile.role === "ADMIN"}
          />
        </>
      ) : (
        <>
          <div
            className="table-scroll"
            role="region"
            aria-label="Avtomobil balansları"
            tabIndex={0}
          >
            <table className="data-table vehicle-cash-table w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="text-[var(--muted)]">
                  {[
                    "Avtomobil",
                    "Təklif",
                    "Məlum maya",
                    "Müştəridən alınıb",
                    "Müştəri borcu",
                    "Təchizatçı borcu",
                    "Usta borcu",
                  ].map((s) => (
                    <th scope="col" key={s} className="py-3">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows(jobs, f).map((j) => {
                  const n = jobFinance(
                    j,
                    data.work,
                    data.parts,
                    data.purchases,
                    data.cash,
                  );
                  return (
                    <tr key={j.id} className="border-t border-[var(--border)]">
                      <td className="py-4">
                        <Link
                          href={`/kassa?job=${j.id}`}
                          className="font-mono font-semibold text-[var(--accent)]"
                        >
                          {j.vehicles?.plate}
                        </Link>
                        <p className="text-xs text-[var(--muted)]">
                          {j.vehicles?.make} {j.vehicles?.model}
                        </p>
                      </td>
                      {[
                        n.quotedTotal,
                        n.totalCost,
                        n.customerPaid,
                        n.customerReceivable,
                        n.supplierPayable,
                        n.workerPayable,
                      ].map((v, i) => (
                        <td key={i}>{formatMoney(v)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!jobs.length ? (
            <EmptyState>
              Seçilmiş filtrlərə uyğun servis kartı yoxdur.
            </EmptyState>
          ) : null}
          <Pagination filters={f} total={jobs.length} />
        </>
      )}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Kassa jurnalı</h2>
        <CashHistory
          cash={pageRows(cash, f)}
          data={data}
          editable={profile.role === "ADMIN"}
        />
        <Pagination filters={f} total={cash.length} />
      </section>
    </>
  );
}
