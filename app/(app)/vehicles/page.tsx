import Link from "next/link";
import { Plus } from "lucide-react";
import { fundingLabels, PageHeader, Panel, StatusBadge, statusLabels } from "@/components/app-shell";
import { calculateFinancialSummary } from "@/lib/finance";
import { formatDate, formatMoney } from "@/lib/format";
import { getVehicle, purchases, serviceJobs, workItems } from "@/lib/demo-data";

export default function VehiclesPage() {
  return (
    <>
      <PageHeader
        title="Avtomobillər"
        eyebrow="Servis kartları"
        actions={<Link href="/vehicles/new" className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"><Plus size={16} />Yeni avtomobil / servis kartı</Link>}
      />
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <input className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none" placeholder="Nömrə axtarışı" />
        <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option>Status</option><option>İş gedir</option><option>Hazırdır</option></select>
        <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option>Mənbə</option><option>Müştəri hesabına</option><option>Sığorta hadisəsi üzrə</option></select>
        <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option>Ən yenilər</option><option>Ən köhnələr</option></select>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {serviceJobs.map((job) => {
          const vehicle = getVehicle(job);
          const jobWork = workItems.filter((item) => item.serviceJobId === job.id);
          const done = jobWork.filter((item) => item.status === "DONE").length;
          const financial = calculateFinancialSummary(job.agreedBudget, purchases.filter((purchase) => purchase.serviceJobId === job.id), jobWork);
          return (
            <Link key={job.id} href={`/vehicles/${job.id}`}>
              <Panel className="transition hover:border-[var(--accent)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-mono text-3xl font-bold">{vehicle.plate}</div>
                    <p className="mt-1 text-[var(--muted)]">{vehicle.make} {vehicle.model}</p>
                    <p className="mt-2 text-sm text-[var(--silver)]">{job.customerName}</p>
                  </div>
                  <StatusBadge>{fundingLabels[job.fundingSource]}</StatusBadge>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Metric label="Büdcə" value={formatMoney(job.agreedBudget)} />
                  <Metric label="Xərc" value={formatMoney(financial.totalCost)} />
                  <Metric label="İş" value={`${done} / ${jobWork.length}`} />
                  <Metric label="Qəbul" value={formatDate(job.receivedAt)} />
                </div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/40">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${jobWork.length ? (done / jobWork.length) * 100 : 0}%` }} />
                  </div>
                  <StatusBadge tone={job.status === "READY" ? "success" : "neutral"}>{statusLabels[job.status]}</StatusBadge>
                </div>
              </Panel>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-[var(--muted)]">{label}</div><div className="mt-1 text-sm font-semibold">{value}</div></div>;
}
