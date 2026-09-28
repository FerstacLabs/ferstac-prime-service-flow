import Link from "next/link";
import { Filter, RotateCcw } from "lucide-react";
import { requireAccess } from "@/lib/supabase/auth";
import { getWorkshop } from "@/lib/supabase/workshop";
import { supplierDisplayName } from "@/lib/supabase/queries";
import { selectSupplierFinances } from "@/lib/supplier-finance";
import { PageHeader } from "@/components/app-shell";
import { SupplierForm } from "@/components/supplier-form";
import { FilterForm } from "@/components/filter-form";
import { ReportActions } from "@/components/report-actions";
import { Pagination, pageRows } from "@/components/workshop-filters";
import { parseFilters, filterQuery, type SearchParams } from "@/lib/filters";
import { formatMoney } from "@/lib/format";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAccess(["ADMIN"]);
  const f = parseFilters(await searchParams),
    data = await getWorkshop(),
    rows = selectSupplierFinances(data, f);
  return (
    <>
      <PageHeader
        title="Təchizatçılar"
        eyebrow="Təchizatçı məlumatları"
        actions={<ReportActions report="suppliers" query={filterQuery(f)} />}
      />
      <FilterForm key={filterQuery(f)}>
        <label className="text-xs text-[var(--muted)]">
          Ad / VÖEN / telefon
          <input name="q" defaultValue={f.q} className="field mt-1" />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Status
          <select name="status" defaultValue={f.status} className="field mt-1">
            <option value="">Hamısı</option>
            <option value="active">Aktiv</option>
            <option value="archived">Arxiv</option>
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Borclanma
          <select
            name="balance"
            defaultValue={f.balance}
            className="field mt-1"
          >
            <option value="">Hamısı</option>
            <option value="outstanding">Borc var</option>
            <option value="closed">Borc yoxdur</option>
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Başlanğıc
          <input
            type="date"
            name="from"
            defaultValue={f.from}
            className="field mt-1"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Son
          <input
            type="date"
            name="to"
            defaultValue={f.to}
            className="field mt-1"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary">
            <Filter size={16} />
            Tətbiq et
          </button>
          <Link
            href="/suppliers"
            className="btn btn-secondary"
            data-filter-reset
          >
            <RotateCcw size={16} />
            Sıfırla
          </Link>
        </div>
      </FilterForm>
      {(f.from || f.to) && (
        <p className="mb-4 text-sm text-[var(--muted)]">
          Seçilən dövrün alışları və həmin alışlar üzrə bütün ödənişlər.
        </p>
      )}
      <details className="mb-6 border-y border-[var(--border)] py-4">
        <summary className="cursor-pointer font-semibold">
          Yeni təchizatçı
        </summary>
        <SupplierForm />
      </details>
      <div className="table-scroll">
        <table className="data-table w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr>
              {[
                "Təchizatçı",
                "VÖEN / Telefon",
                "Status",
                "Alış məbləği",
                "Ödənilib",
                "Qalıq borc",
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows(rows, f).map((n) => (
              <tr key={n.supplier.id}>
                <td>
                  <Link href={`/suppliers/${n.supplier.id}`}>
                    {supplierDisplayName(n.supplier)}
                  </Link>
                </td>
                <td>
                  {n.supplier.tax_id_voen || "-"}
                  <br />
                  {n.supplier.phone || "-"}
                </td>
                <td>{n.supplier.active ? "Aktiv" : "Arxiv"}</td>
                <td className="numeric">{formatMoney(n.cost)}</td>
                <td className="numeric">{formatMoney(n.paid)}</td>
                <td className="numeric">{formatMoney(n.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className="py-5 text-sm">
          Seçilmiş filtrlərə uyğun təchizatçı yoxdur.
        </p>
      )}
      <Pagination filters={f} total={rows.length} />
    </>
  );
}
