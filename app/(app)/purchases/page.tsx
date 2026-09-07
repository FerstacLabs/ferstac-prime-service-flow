import { deletePurchaseAction, savePurchaseAction, saveSupplierAction } from "@/app/actions/purchases";
import { PageHeader, Panel, StatusBadge } from "@/components/app-shell";
import { ConfirmButton } from "@/components/confirm-button";
import { ReportActions } from "@/components/report-actions";
import { SubmitButton } from "@/components/submit-button";
import { dbPurchaseOutstanding, dbPurchaseTotal } from "@/lib/supabase/finance";
import { formatDate, formatMoney } from "@/lib/format";
import { getJobs, getMasterData, getPurchases, getSuppliers, getWorkers, partTitle, supplierDisplayName, workerDisplayName } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

const paymentLabels = { PAID: "Ödənilib", UNPAID: "Ödənilməyib", PARTIAL: "Qismən ödənilib" } as const;

export default async function PurchasesPage() {
  const [jobs, purchases, suppliers, workers, master] = await Promise.all([getJobs(), getPurchases(), getSuppliers(), getWorkers(), getMasterData()]);
  return (
    <>
      <PageHeader title="Satınalma" eyebrow="Detal, material və təchizatçılar" actions={<ReportActions report="purchases" />} />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Yeni alış</h2>
          <form action={savePurchaseAction} className="grid gap-3 md:grid-cols-3">
            <select name="service_job_id" required className="field"><option value="">Hansı avtomobil üçün?</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.vehicles?.plate} - {job.vehicles?.make} {job.vehicles?.model}</option>)}</select>
            <select name="part_catalog_id" className="field"><option value="">Detal / material</option>{master.partCatalog.map((part) => <option key={part.id} value={part.id}>{part.name}</option>)}</select>
            <input name="custom_item_name" className="field" placeholder="Digər detal" />
            <input name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" className="field" placeholder="Miqdar" />
            <input name="unit_price" type="number" min="0" step="0.01" defaultValue="0" className="field" placeholder="Vahid qiymət" />
            <select name="source_type" className="field"><option value="SUPPLIER">Təchizatçı</option><option value="INTERNAL_STOCK">Servis daxili ehtiyat</option><option value="CUSTOMER_PROVIDED">Müştərinin təqdim etdiyi detal</option></select>
            <select name="supplier_id" className="field"><option value="">Kimdən alınıb?</option>{suppliers.filter((item) => item.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplierDisplayName(supplier)}</option>)}</select>
            <select name="purchased_by" className="field"><option value="admin">Mən / Administrator</option><option value="worker">İşçi</option></select>
            <select name="purchased_by_worker_id" className="field"><option value="">Kim alıb?</option>{workers.filter((item) => item.active).map((worker) => <option key={worker.id} value={worker.id}>{workerDisplayName(worker)}</option>)}</select>
            <select name="payment_status" className="field"><option value="PAID">Ödənilib</option><option value="UNPAID">Ödənilməyib</option><option value="PARTIAL">Qismən ödənilib</option></select>
            <input name="paid_amount" type="number" min="0" step="0.01" className="field" placeholder="Qismən ödənən məbləğ" />
            <input name="purchase_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="field" />
            <input name="part_code_oem" className="field" placeholder="OEM kodu" />
            <input name="brand_model" className="field" placeholder="Brend/model" />
            <input name="serial_no" className="field" placeholder="Serial nömrəsi" />
            <input name="document_no" className="field" placeholder="Qaimə/sənəd" />
            <input name="notes" className="field md:col-span-2" placeholder="Qeyd" />
            <SubmitButton pendingText="Saxlanır...">Alışı saxla</SubmitButton>
          </form>
        </Panel>
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Yeni təchizatçı</h2>
          <form action={saveSupplierAction} className="grid gap-3 md:grid-cols-2">
            <select name="entity_type" className="field"><option value="LEGAL_ENTITY">Hüquqi şəxs</option><option value="INDIVIDUAL">Fiziki şəxs</option></select>
            <input name="company_name" className="field" placeholder="Firma adı" />
            <input name="shop_name" className="field" placeholder="Mağaza adı" />
            <input name="tax_id_voen" className="field" placeholder="VÖEN" />
            <input name="first_name" className="field" placeholder="Ad" />
            <input name="last_name" className="field" placeholder="Soyad" />
            <input name="father_name" className="field" placeholder="Ata adı" />
            <input name="phone" className="field" placeholder="Əlaqə nömrəsi" />
            <input name="address" className="field md:col-span-2" placeholder="Ünvan" />
            <input name="notes" className="field md:col-span-2" placeholder="Qeyd" />
            <SubmitButton variant="secondary" pendingText="Saxlanır..." className="md:col-span-2">Təchizatçını saxla</SubmitButton>
          </form>
        </Panel>
      </div>

      <Panel className="my-5">
        <h2 className="mb-4 text-lg font-semibold">Təchizatçılar <span className="text-sm font-normal text-[var(--muted)]">Kontragentlər</span></h2>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {suppliers.map((supplier) => {
            const supplierPurchases = purchases.filter((purchase) => purchase.supplier_id === supplier.id);
            const total = supplierPurchases.reduce((sum, purchase) => sum + dbPurchaseTotal(purchase), 0);
            const outstanding = supplierPurchases.reduce((sum, purchase) => sum + dbPurchaseOutstanding(purchase), 0);
            return <div key={supplier.id} className="rounded-lg border border-[var(--border)] p-3"><div className="font-semibold">{supplierDisplayName(supplier)}</div><div className="mt-1 text-sm text-[var(--muted)]">{supplier.entity_type === "LEGAL_ENTITY" ? "Hüquqi şəxs" : "Fiziki şəxs"}</div><div className="mt-3 text-sm">Cəm: {formatMoney(total)}</div><div className="text-sm text-[var(--warning)]">Borc: {formatMoney(outstanding)}</div></div>;
          })}
        </div>
      </Panel>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="text-[var(--muted)]"><tr><th className="py-2">Tarix</th><th>Avtomobil</th><th>Detal</th><th>Mənbə / təchizatçı</th><th>Miqdar</th><th>Cəm</th><th>Status</th><th>Ödənib</th><th>Qalıq</th><th>Kim alıb?</th><th></th></tr></thead>
            <tbody>{purchases.map((purchase) => {
              const job = jobs.find((item) => item.id === purchase.service_job_id);
              return (
                <tr key={purchase.id} className="border-t border-[var(--border)]">
                  <td className="py-3">{formatDate(purchase.purchase_date)}</td>
                  <td className="font-mono font-semibold">{job?.vehicles?.plate ?? "-"}</td>
                  <td>{partTitle(purchase)}</td>
                  <td>{purchase.source_type === "SUPPLIER" ? supplierDisplayName(purchase.suppliers) : purchase.source_type === "INTERNAL_STOCK" ? "Servis daxili ehtiyat" : "Müştərinin təqdim etdiyi detal"}</td>
                  <td>{purchase.quantity}</td>
                  <td>{formatMoney(dbPurchaseTotal(purchase))}</td>
                  <td><StatusBadge tone={purchase.payment_status === "PAID" ? "success" : purchase.payment_status === "PARTIAL" ? "warning" : "danger"}>{paymentLabels[purchase.payment_status]}</StatusBadge></td>
                  <td>{formatMoney(purchase.paid_amount)}</td>
                  <td>{formatMoney(dbPurchaseOutstanding(purchase))}</td>
                  <td>{purchase.purchased_by_admin ? "Mən / Administrator" : workerDisplayName(purchase.workers)}</td>
                  <td><form action={deletePurchaseAction}><input type="hidden" name="id" value={purchase.id} /><ConfirmButton message="Bu alış silinsin?" /></form></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
