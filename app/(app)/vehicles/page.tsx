import { requireAccess } from "@/lib/supabase/auth";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  PageHeader,
  Panel,
  StatusBadge,
  statusLabels,
  fundingLabels,
} from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import {
  WorkshopFilters,
  Pagination,
  pageRows,
} from "@/components/workshop-filters";
import { parseFilters, type SearchParams } from "@/lib/filters";
import { getWorkshop, selectJobs } from "@/lib/supabase/workshop";
import { jobFinance } from "@/lib/workshop";
import { formatDate, formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
export const dynamic = "force-dynamic";
export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { profile } = await requireAccess(["ADMIN", "INTAKE"]);
  const f = parseFilters(await searchParams),
    data = await getWorkshop(),
    jobs = selectJobs(data, f);
  return (
    <>
      <PageHeader
        title="Avtomobillər"
        eyebrow="Servis kartları"
        actions={
          <Link href="/vehicles/new" className="btn btn-primary">
            <Plus size={16} />
            Yeni avtomobil / servis kartı
          </Link>
        }
      />
      <WorkshopFilters scope="vehicles" filters={f} />
      <div className="grid gap-4 lg:grid-cols-2">
        {!jobs.length ? <EmptyState>Servis kartı tapılmadı.</EmptyState> : null}
        {pageRows(jobs, f).map((job) => {
          const n = jobFinance(
            job,
            data.work,
            data.parts,
            data.purchases,
            data.cash,
          );
          const work = data.work.filter((w) => w.service_job_id === job.id);
          return (
            <Panel key={job.id} className="vehicle-card">
              <div className="vehicle-card-head">
                <Link href={`/vehicles/${job.id}`}>
                  <h2 className="font-mono text-2xl font-bold">
                    {job.vehicles?.plate}
                  </h2>
                  <p className="text-[var(--muted)]">
                    {job.vehicles?.make} {job.vehicles?.model}
                  </p>
                </Link>
                <StatusBadge>{fundingLabels[job.funding_source]}</StatusBadge>
                {job.archived_at ? (
                  <StatusBadge tone="warning">Arxivdə</StatusBadge>
                ) : null}
              </div>
              <p className="mt-2 text-sm">{job.customer_name}</p>
              <dl className="metric-grid my-5 grid grid-cols-2 gap-4 text-sm 2xl:grid-cols-4">
                {[
                  [
                    n.detailed ? "Təklif" : "Əvvəlki büdcə",
                    formatMoney(n.quotedTotal),
                  ],
                  ...(profile.role === "ADMIN"
                    ? [["Məlum maya", formatMoney(n.totalCost)]]
                    : []),
                  [
                    "İş",
                    `${work.filter((w) => w.status === "DONE").length}/${work.length}`,
                  ],
                  ["Qəbul", formatDate(job.received_at)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[var(--muted)]">{label}</dt>
                    <dd className="mt-1 font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="vehicle-card-actions flex flex-wrap items-center justify-between gap-3">
                <StatusBadge
                  tone={job.status === "READY" ? "success" : "neutral"}
                >
                  {statusLabels[job.status]}
                </StatusBadge>
                <Link
                  className="btn btn-secondary"
                  href={`/vehicles/${job.id}`}
                >
                  Aç
                </Link>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                <span className="text-sm text-[var(--muted)]">
                  Qiymət təklifi
                </span>
                <ReportActions report="quotation" query={`job=${job.id}`} />
              </div>
            </Panel>
          );
        })}
      </div>
      <Pagination filters={f} total={jobs.length} />
    </>
  );
}
