import Link from "next/link";
import { ArrowUpRight, CarFront, CircleDollarSign, ClipboardCheck, WalletCards } from "lucide-react";
import { fundingLabels, PageHeader, Panel, StatusBadge, statusLabels } from "@/components/app-shell";
import { PdfLink } from "@/components/pdf-link";
import { ReportActions } from "@/components/report-actions";
import { formatDate, formatMoney } from "@/lib/format";
import { dbFinancialSummary } from "@/lib/supabase/finance";
import { getJobs, getPurchases, getWorkItems } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [jobs, allPurchases, allWorkItems] = await Promise.all([getJobs(), getPurchases(), getWorkItems()]);
  const activeJobs = jobs.filter((job) => job.status !== "DELIVERED");
  const totals = activeJobs.reduce(
    (acc, job) => {
      const jobPurchases = allPurchases.filter((purchase) => purchase.service_job_id === job.id);
      const jobWork = allWorkItems.filter((item) => item.service_job_id === job.id);
      const financial = dbFinancialSummary(job.agreed_budget, jobPurchases, jobWork);
      acc.budget += job.agreed_budget;
      acc.cost += financial.totalCost;
      acc.outstanding += financial.unpaidSupplierAmount;
      acc.profit += financial.estimatedGrossProfit;
      acc.done += jobWork.filter((work) => work.status === "DONE").length;
      acc.totalWork += jobWork.length;
      return acc;
    },
    { budget: 0, cost: 0, outstanding: 0, profit: 0, done: 0, totalWork: 0 }
  );

  return (
    <>
      <PageHeader title="İcmal" eyebrow="Management overview" actions={<ReportActions report="overview" />} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Kpi icon={<CarFront />} label="Aktiv avtomobillər" value={String(activeJobs.length)} />
        <Kpi icon={<WalletCards />} label="Razılaşdırılmış büdcə" value={formatMoney(totals.budget)} />
        <Kpi icon={<CircleDollarSign />} label="Ümumi xərclər" value={formatMoney(totals.cost)} />
        <Kpi icon={<CircleDollarSign />} label="Ödənilməmiş alışlar" value={formatMoney(totals.outstanding)} tone="warning" />
        <Kpi icon={<ArrowUpRight />} label="Təxmini mənfəət" value={formatMoney(totals.profit)} tone={totals.profit >= 0 ? "success" : "danger"} />
        <Kpi icon={<ClipboardCheck />} label="Tamamlanmış işlər" value={`${totals.done} / ${totals.totalWork}`} />
      </div>
      <div className="mt-6 grid gap-4">
        {activeJobs.length === 0 ? <Panel>Aktiv servis kartı yoxdur.</Panel> : null}
        {activeJobs.map((job) => {
          const vehicle = job.vehicles!;
          const jobWork = allWorkItems.filter((item) => item.service_job_id === job.id);
          const jobPurchases = allPurchases.filter((purchase) => purchase.service_job_id === job.id);
          const financial = dbFinancialSummary(job.agreed_budget, jobPurchases, jobWork);
          const done = jobWork.filter((item) => item.status === "DONE").length;
          const progress = jobWork.length ? Math.round((done / jobWork.length) * 100) : 0;
          return (
            <Panel key={job.id}>
              <div className="grid gap-4 xl:grid-cols-[1.1fr_2fr_auto] xl:items-center">
                <div>
                  <div className="font-mono text-3xl font-bold text-white">{vehicle.plate}</div>
                  <div className="mt-1 text-[var(--muted)]">{vehicle.make} {vehicle.model}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge>{fundingLabels[job.funding_source]}</StatusBadge>
                    <StatusBadge tone={job.status === "READY" ? "success" : job.status === "WAITING_PARTS" ? "warning" : "neutral"}>{statusLabels[job.status]}</StatusBadge>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  <Money label="Büdcə" value={job.agreed_budget} />
                  <Money label="Detal" value={financial.partsCost} />
                  <Money label="Əmək" value={financial.laborCost} />
                  <Money label="Cəm xərc" value={financial.totalCost} />
                  <Money label="Qalıq" value={financial.remainingBudget} />
                  <Money label="Borc" value={financial.unpaidSupplierAmount} />
                </div>
                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <PdfLink href={`/api/reports/vehicle/${job.id}/pdf`} compact />
                  <Link href={`/vehicles/${job.id}`} className="btn btn-secondary">Aç</Link>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex justify-between text-sm text-[var(--muted)]">
                  <span>İş gedişi: {done} / {jobWork.length}</span>
                  <span>Son aktivlik: {formatDate(job.received_at)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/35">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function Kpi({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const toneColor = tone === "success" ? "text-[var(--success)]" : tone === "warning" ? "text-[var(--warning)]" : tone === "danger" ? "text-[var(--danger)]" : "text-white";
  return <Panel className="min-h-32"><div className="mb-4 text-[var(--accent)] [&_svg]:size-5">{icon}</div><div className="text-sm text-[var(--muted)]">{label}</div><div className={`mt-2 text-xl font-semibold ${toneColor}`}>{value}</div></Panel>;
}

function Money({ label, value }: { label: string; value: number }) {
  return <div><div className="text-xs text-[var(--muted)]">{label}</div><div className="mt-1 font-semibold text-white">{formatMoney(value)}</div></div>;
}
