import { selectSupplierFinances } from "@/lib/supplier-finance";
import { supplierDisplayName } from "@/lib/supabase/queries";
import { sumMoney } from "@/lib/workshop";
import { formatReportMoney as money } from "@/lib/reports/report-format";
import type { WorkshopData } from "@/lib/supabase/workshop";
import type { WorkshopFilters } from "@/lib/filters";
import type { PrimeReport } from "@/lib/reports/report-types";

export function supplierReport(
  report: PrimeReport,
  data: WorkshopData,
  f: WorkshopFilters,
): PrimeReport {
  const rows = selectSupplierFinances(data, f);
  return {
    ...report,
    title: "Təchizatçılar üzrə ümumi hesabat",
    subtitle:
      f.from || f.to
        ? "Seçilən dövrün alışları və həmin alışlar üzrə bütün ödənişlər."
        : undefined,
    summary: [
      { label: "Təchizatçı sayı", value: String(rows.length) },
      {
        label: "Aktiv",
        value: String(rows.filter((n) => n.supplier.active).length),
      },
      {
        label: "Arxiv",
        value: String(rows.filter((n) => !n.supplier.active).length),
      },
      {
        label: "Ümumi alış məbləği",
        value: money(sumMoney(rows.map((n) => n.cost))),
      },
      { label: "Ödənilib", value: money(sumMoney(rows.map((n) => n.paid))) },
      {
        label: "Qalıq borc",
        value: money(sumMoney(rows.map((n) => n.remaining))),
      },
    ],
    sections: [
      {
        title: "Təchizatçılar",
        table: {
          columns: [
            "Təchizatçı",
            "VÖEN",
            "Telefon",
            "Status",
            "Alış sayı",
            "Alış məbləği",
            "Ödənilib",
            "Qalıq borc",
          ].map((label, i) => ({
            key: String(i),
            label,
            width: [22, 12, 14, 9, 7, 12, 12, 12][i],
            align: i >= 4 ? "right" : "left",
          })),
          rows: rows.map((n) => ({
            id: n.supplier.id,
            cells: Object.fromEntries(
              [
                supplierDisplayName(n.supplier),
                n.supplier.tax_id_voen || "-",
                n.supplier.phone || "-",
                n.supplier.active ? "Aktiv" : "Arxiv",
                String(n.items.length),
                money(n.cost),
                money(n.paid),
                money(n.remaining),
              ].map((value, i) => [String(i), value]),
            ),
          })),
        },
      },
    ],
  };
}
