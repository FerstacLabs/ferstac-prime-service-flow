import Link from "next/link";
import { ArrowUpRight, CarFront, CircleDollarSign, ClipboardCheck, WalletCards } from "lucide-react";
import { fundingLabels, PageHeader, Panel, StatusBadge, statusLabels } from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { calculateFinancialSummary } from "@/lib/finance";
import { formatDate, formatMoney } from "@/lib/format";
import { getVehicle, purchases, serviceJobs, workItems } from "@/lib/demo-data";

export default function OverviewPage() {
  const activeJobs = serviceJobs.filter((job) => job.status !== "DELIVERED");
  const summaries = activeJobs.map((job) => ({
    job,
    vehicle: getVehicle(job),
    work: workItems.filter((item) => item.serviceJobId === job.id),
    purchases: purchases.filter((purchase) => purchase.serviceJobId === job.id)
  }));

  const totals = summaries.reduce(
    (acc, item) => {
      const financial = calculateFinancialSummary(item.job.agreedBudget, item.purchases, item.work);
      acc.budget += item.job.agreedBudget;
      acc.cost += financial.totalCost;
      acc.outstanding += financial.unpaidSupplierAmount;
      acc.profit += financial.estimatedGrossProfit;
      acc.done += item.work.filter((work) => work.status === "DONE").length;
      acc.totalWork += item.work.length;
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
        {summaries.map(({ job, vehicle, work, purchases: jobPurchases }) => {
          const financial = calculateFinancialSummary(job.agreedBudget, jobPurchases, work);
          const done = work.filter((item) => item.status === "DONE").length;
          const progress = work.length ? Math.round((done / work.length) * 100) : 0;
          return (
            <Panel key={job.id}>
              <div className="grid gap-4 xl:grid-cols-[1.1fr_2fr_auto] xl:items-center">
                <div>
                  <div className="font-mono text-3xl font-bold text-white">{vehicle.plate}</div>
                  <div className="mt-1 text-[var(--muted)]">{vehicle.make} {vehicle.model}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge>{fundingLabels[job.fundingSource]}</StatusBadge>
                    <StatusBadge tone={job.status === "READY" ? "success" : job.status === "WAITING_PARTS" ? "warning" : "neutral"}>{statusLabels[job.status]}</StatusBadge>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  <Money label="Büdcə" value={job.agreedBudget} />
                  <Money label="Detal" value={financial.partsCost} />
                  <Money label="Əmək" value={financial.laborCost} />
                  <Money label="Cəm xərc" value={financial.totalCost} />
                  <Money label="Qalıq" value={financial.remainingBudget} />
                  <Money label="Borc" value={financial.unpaidSupplierAmount} />
                </div>
                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <a href={`/api/reports/vehicle/${job.id}/pdf`} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black">PDF</a>
                  <Link href={`/vehicles/${job.id}`} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-white">Aç</Link>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex justify-between text-sm text-[var(--muted)]">
                  <span>İş gedişi: {done} / {work.length}</span>
                  <span>Son aktivlik: {formatDate(job.receivedAt)}</span>
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
  return (
    <Panel className="min-h-32">
      <div className="mb-4 text-[var(--accent)] [&_svg]:size-5">{icon}</div>
      <div className="text-sm text-[var(--muted)]">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${toneColor}`}>{value}</div>
    </Panel>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-1 font-semibold text-white">{formatMoney(value)}</div>
    </div>
  );
}
