import { Plus } from "lucide-react";
import { PageHeader, Panel, StatusBadge } from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { getPartName, getSupplierName, getVehicle, getWorkerName, purchases, serviceJobs, suppliers } from "@/lib/demo-data";
import { purchaseOutstanding, purchaseTotal } from "@/lib/finance";
import { formatDate, formatMoney } from "@/lib/format";

const paymentLabels = { PAID: "Ödənilib", UNPAID: "Ödənilməyib", PARTIAL: "Qismən ödənilib" } as const;

export default function PurchasesPage() {
  return (
    <>
      <PageHeader title="Satınalma" eyebrow="Detal, material və təchizatçılar" actions={<ReportActions report="purchases" />} />
      <div className="mb-5 flex flex-wrap gap-3">
        <button className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"><Plus size={16} />Yeni alış</button>
        <input className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 outline-none" placeholder="Nömrə, detal, təchizatçı" />
        <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option>Ödəniş statusu</option></select>
        <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><option>Mənbə</option></select>
      </div>

      <Panel className="mb-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Təchizatçılar <span className="text-sm font-normal text-[var(--muted)]">Kontragentlər</span></h2>
          <button className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">Yeni təchizatçı</button>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {suppliers.map((supplier) => (
            <div key={supplier.id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="font-semibold">{getSupplierName(supplier.id)}</div>
              <div className="mt-1 text-sm text-[var(--muted)]">{supplier.entityType === "LEGAL_ENTITY" ? "Hüquqi şəxs" : "Fiziki şəxs"}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="text-[var(--muted)]"><tr><th className="py-2">Tarix</th><th>Avtomobil</th><th>Detal</th><th>Mənbə / təchizatçı</th><th>Miqdar</th><th>Cəm</th><th>Status</th><th>Ödənib</th><th>Qalıq</th><th>Kim alıb?</th></tr></thead>
            <tbody>
              {purchases.map((purchase) => {
                const job = serviceJobs.find((item) => item.id === purchase.serviceJobId)!;
                const vehicle = getVehicle(job);
                return (
                  <tr key={purchase.id} className="border-t border-[var(--border)]">
                    <td className="py-3">{formatDate(purchase.purchaseDate)}</td>
                    <td className="font-mono font-semibold">{vehicle.plate}</td>
                    <td>{getPartName(purchase)}</td>
                    <td>{purchase.sourceType === "SUPPLIER" ? getSupplierName(purchase.supplierId) : purchase.sourceType === "INTERNAL_STOCK" ? "Servis daxili ehtiyat" : "Müştərinin təqdim etdiyi detal"}</td>
                    <td>{purchase.quantity}</td>
                    <td>{formatMoney(purchaseTotal(purchase))}</td>
                    <td><StatusBadge tone={purchase.paymentStatus === "PAID" ? "success" : purchase.paymentStatus === "PARTIAL" ? "warning" : "danger"}>{paymentLabels[purchase.paymentStatus]}</StatusBadge></td>
                    <td>{formatMoney(purchase.paidAmount)}</td>
                    <td>{formatMoney(purchaseOutstanding(purchase))}</td>
                    <td>{purchase.purchasedByAdmin ? "Mən / Administrator" : getWorkerName(purchase.purchasedByWorkerId)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
