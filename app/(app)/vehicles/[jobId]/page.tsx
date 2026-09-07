import { notFound } from "next/navigation";
import { fundingLabels, PageHeader, Panel, StatusBadge, statusLabels } from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { calculateFinancialSummary, purchaseOutstanding, purchaseTotal } from "@/lib/finance";
import { formatDate, formatMoney } from "@/lib/format";
import { getPartName, getSupplierName, getVehicle, getWorkerName, getWorkName, purchases, serviceJobs, workItems } from "@/lib/demo-data";

export default async function VehicleDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = serviceJobs.find((item) => item.id === jobId);
  if (!job) notFound();
  const vehicle = getVehicle(job);
  const jobWork = workItems.filter((item) => item.serviceJobId === job.id);
  const jobPurchases = purchases.filter((purchase) => purchase.serviceJobId === job.id);
  const financial = calculateFinancialSummary(job.agreedBudget, jobPurchases, jobWork);

  return (
    <>
      <PageHeader title={`${vehicle.plate} - ${job.jobNo}`} eyebrow={`${vehicle.make} ${vehicle.model}`} actions={<ReportActions report={`vehicle/${job.id}`} />} />
      <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Avtomobil / servis məlumatı</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Müştəri" value={job.customerName ?? "-"} />
            <Info label="Telefon" value={job.customerPhone ?? "-"} />
            <Info label="Mənbə" value={fundingLabels[job.fundingSource]} />
            <Info label="Status" value={statusLabels[job.status]} />
            <Info label="Qəbul tarixi" value={formatDate(job.receivedAt)} />
            <Info label="Rəng" value={vehicle.color ?? "-"} />
            <Info label="VIN / ban" value={vehicle.vinBodyNumber ?? "-"} />
            <Info label="Qeydiyyat sahibi" value={vehicle.registeredOwnerFullName ?? "-"} />
          </dl>
          {job.insuranceCompany ? <p className="mt-4 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--muted)]">{job.insuranceCompany} / {job.insuranceClaimNo} / {formatMoney(job.insuranceApprovedAmount ?? 0)}</p> : null}
        </Panel>
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Maliyyə xülasəsi</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Money label="Razılaşdırılmış büdcə" value={job.agreedBudget} />
            <Money label="Detal xərci" value={financial.partsCost} />
            <Money label="Əmək xərci" value={financial.laborCost} />
            <Money label="Cəm xərc" value={financial.totalCost} />
            <Money label="Təchizatçı borcu" value={financial.unpaidSupplierAmount} />
            <Money label="Təxmini mənfəət" value={financial.estimatedGrossProfit} />
          </div>
        </Panel>
      </div>
      <Panel className="mt-4">
        <h2 className="mb-4 text-lg font-semibold">Görüləcək işlər</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-[var(--muted)]"><tr><th className="py-2">İş</th><th>Usta</th><th>Status</th><th>Əmək xərci</th><th>Plan</th></tr></thead>
            <tbody>{jobWork.map((item) => <tr key={item.id} className="border-t border-[var(--border)]"><td className="py-3">{getWorkName(item)}</td><td>{getWorkerName(item.assignedWorkerId)}</td><td><StatusBadge>{statusLabels[item.status]}</StatusBadge></td><td>{formatMoney(item.laborCost)}</td><td>{formatDate(item.plannedAt)}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
      <Panel className="mt-4">
        <h2 className="mb-4 text-lg font-semibold">Satınalmalar</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-[var(--muted)]"><tr><th className="py-2">Tarix</th><th>Detal</th><th>Mənbə</th><th>Miqdar</th><th>Cəm</th><th>Ödənib</th><th>Qalıq</th><th>Alan</th></tr></thead>
            <tbody>{jobPurchases.map((purchase) => <tr key={purchase.id} className="border-t border-[var(--border)]"><td className="py-3">{formatDate(purchase.purchaseDate)}</td><td>{getPartName(purchase)}</td><td>{purchase.sourceType === "SUPPLIER" ? getSupplierName(purchase.supplierId) : purchase.sourceType === "INTERNAL_STOCK" ? "Servis daxili ehtiyat" : "Müştərinin təqdim etdiyi detal"}</td><td>{purchase.quantity}</td><td>{formatMoney(purchaseTotal(purchase))}</td><td>{formatMoney(purchase.paidAmount)}</td><td>{formatMoney(purchaseOutstanding(purchase))}</td><td>{purchase.purchasedByAdmin ? "Mən / Administrator" : getWorkerName(purchase.purchasedByWorkerId)}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[var(--muted)]">{label}</dt><dd className="mt-1 font-medium text-white">{value}</dd></div>;
}

function Money({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-[var(--border)] p-3"><div className="text-xs text-[var(--muted)]">{label}</div><div className="mt-2 text-lg font-semibold">{formatMoney(value)}</div></div>;
}
