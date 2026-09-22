import { requireAccess } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { PurchaseList } from "@/components/purchase-list";
import {
  WorkshopFilters,
  Pagination,
  pageRows,
} from "@/components/workshop-filters";
import { parseFilters, filterQuery, type SearchParams } from "@/lib/filters";
import { getWorkshop, selectPurchases } from "@/lib/supabase/workshop";
import { supplierDisplayName } from "@/lib/supabase/queries";
import { purchaseCost, paidFor, sumMoney, subtractMoney } from "@/lib/workshop";
import { formatMoney, formatDate } from "@/lib/format";
export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAccess(["ADMIN"]);
  const { supplierId } = await params,
    f = parseFilters({ ...(await searchParams), supplier: supplierId }),
    data = await getWorkshop(),
    supplier = data.suppliers.find((s) => s.id === supplierId);
  if (!supplier) notFound();
  const items = selectPurchases(data, f),
    cost = sumMoney(items.map(purchaseCost)),
    paid = sumMoney(
      items.map((p) => paidFor(data.cash, "SUPPLIER_PURCHASE", p.id)),
    );
  return (
    <>
      <PageHeader
        title={supplierDisplayName(supplier)}
        eyebrow="Təchizatçı"
        actions={<ReportActions report="purchases" query={filterQuery(f)} />}
      />
      <dl className="identity-grid grid gap-4 border-b border-[var(--border)] pb-5 text-sm sm:grid-cols-3">
        {[
          [
            "Növ",
            supplier.entity_type === "LEGAL_ENTITY"
              ? "Hüquqi şəxs"
              : "Fiziki şəxs",
          ],
          ["Əlaqə", supplier.phone],
          ["VÖEN", supplier.tax_id_voen],
          ["Mağaza", supplier.shop_name],
          [
            "Ad, soyad, ata adı",
            [supplier.first_name, supplier.last_name, supplier.father_name]
              .filter(Boolean)
              .join(" "),
          ],
          ["Ünvan", supplier.address],
          ["Qeyd", supplier.notes],
        ].map(([k, v]) => (
          <div key={k} className={k === "Qeyd" ? "wide-detail" : undefined}>
            <dt className="text-[var(--muted)]">{k}</dt>
            <dd>{v || "-"}</dd>
          </div>
        ))}
      </dl>
      <WorkshopFilters
        scope="purchases"
        filters={f}
        fixed={{ supplier: supplierId }}
        jobs={data.jobs.map((j) => ({
          id: j.id,
          name: j.vehicles?.plate ?? j.job_no,
        }))}
      />
      <dl className="metric-grid grid grid-cols-2 gap-4 border-b border-[var(--border)] pb-5 md:grid-cols-3 2xl:grid-cols-6">
        {[
          ["Alış sayı", String(items.length)],
          ["Maya", formatMoney(cost)],
          ["Ödənilib", formatMoney(paid)],
          ["Qalıq", formatMoney(subtractMoney(cost, paid))],
          [
            "Avtomobil",
            String(new Set(items.map((p) => p.service_job_id)).size),
          ],
          ["Son alış", items[0] ? formatDate(items[0].purchase_date) : "-"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-sm text-[var(--muted)]">{k}</dt>
            <dd className="mt-1 font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <PurchaseList data={data} items={pageRows(items, f)} />
      <Pagination filters={f} total={items.length} />
    </>
  );
}
