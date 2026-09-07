import { notFound } from "next/navigation";
import { archiveServiceJobAction } from "@/app/actions/vehicles";
import { fundingLabels, PageHeader, Panel, StatusBadge, statusLabels } from "@/components/app-shell";
import { ConfirmButton } from "@/components/confirm-button";
import { ReportActions } from "@/components/report-actions";
import { dbFinancialSummary, dbPurchaseOutstanding, dbPurchaseTotal } from "@/lib/supabase/finance";
import { formatDate, formatMoney } from "@/lib/format";
import { getJob, getPurchases, getWorkItems, partTitle, supplierDisplayName, workerDisplayName, workTitle } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function VehicleDetailPage({ params, searchParams }: { params: Promise<{ jobId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { jobId } = await params;
  const { saved } = await searchParams;
  const job = await getJob(jobId);
  if (!job) notFound();
  const [jobWork, jobPurchases] = await Promise.all([getWorkItems(job.id), getPurchases(job.id)]);
  const vehicle = job.vehicles!;
  const financial = dbFinancialSummary(job.agreed_budget, jobPurchases, jobWork);

  return (
    <>
      <PageHeader title={`${vehicle.plate} - ${job.job_no}`} eyebrow={`${vehicle.make} ${vehicle.model}`} actions={<ReportActions report={`vehicle/${job.id}`} />} />
      {saved ? <div className="mb-4 rounded-lg border border-[rgba(69,201,121,.45)] bg-[rgba(69,201,121,.08)] p-3 text-sm text-[var(--success)]">Servis kartı saxlanıldı.</div> : null}
      <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Avtomobil / servis məlumatı</h2>
            <form action={archiveServiceJobAction}>
              <input type="hidden" name="id" value={job.id} />
              <ConfirmButton message="Bu servis kartı arxivlənsin?" danger>Arxivlə</ConfirmButton>
            </form>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Müştəri" value={job.customer_name ?? "-"} />
            <Info label="Telefon" value={job.customer_phone ?? "-"} />
            <Info label="Mənbə" value={fundingLabels[job.funding_source]} />
            <Info label="Status" value={statusLabels[job.status]} />
            <Info label="Qəbul tarixi" value={formatDate(job.received_at)} />
            <Info label="Rəng" value={vehicle.color ?? "-"} />
            <Info label="VIN / ban" value={vehicle.vin_body_number ?? "-"} />
            <Info label="Qeydiyyat sahibi" value={vehicle.registered_owner_full_name ?? "-"} />
          </dl>
          {job.insurance_company ? <p className="mt-4 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--muted)]">{job.insurance_company} / {job.insurance_claim_no} / {formatMoney(job.insurance_approved_amount ?? 0)}</p> : null}
        </Panel>
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Maliyyə xülasəsi</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Money label="Razılaşdırılmış büdcə" value={job.agreed_budget} />
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
            <tbody>{jobWork.map((item) => <tr key={item.id} className="border-t border-[var(--border)]"><td className="py-3">{workTitle(item)}</td><td>{workerDisplayName(item.workers)}</td><td><StatusBadge>{statusLabels[item.status]}</StatusBadge></td><td>{formatMoney(item.labor_cost)}</td><td>{formatDate(item.planned_at)}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
      <Panel className="mt-4">
        <h2 className="mb-4 text-lg font-semibold">Satınalmalar</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-[var(--muted)]"><tr><th className="py-2">Tarix</th><th>Detal</th><th>Mənbə</th><th>Miqdar</th><th>Cəm</th><th>Ödənib</th><th>Qalıq</th><th>Alan</th></tr></thead>
            <tbody>{jobPurchases.map((purchase) => <tr key={purchase.id} className="border-t border-[var(--border)]"><td className="py-3">{formatDate(purchase.purchase_date)}</td><td>{partTitle(purchase)}</td><td>{purchase.source_type === "SUPPLIER" ? supplierDisplayName(purchase.suppliers) : purchase.source_type === "INTERNAL_STOCK" ? "Servis daxili ehtiyat" : "Müştərinin təqdim etdiyi detal"}</td><td>{purchase.quantity}</td><td>{formatMoney(dbPurchaseTotal(purchase))}</td><td>{formatMoney(purchase.paid_amount)}</td><td>{formatMoney(dbPurchaseOutstanding(purchase))}</td><td>{purchase.purchased_by_admin ? "Mən / Administrator" : workerDisplayName(purchase.workers)}</td></tr>)}</tbody>
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
