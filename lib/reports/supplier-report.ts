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
    orientation: "landscape",
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
        label: "Net alış (qaytarmalar çıxılıb)",
        value: money(sumMoney(rows.map((n) => n.cost))),
      },
      { label: "Giriş ƏDV-si", value: money(sumMoney(rows.map((n) => n.vat))) },
      { label: "Yekun alış", value: money(sumMoney(rows.map((n) => n.gross))) },
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
            "Net alış",
            "ƏDV",
            "Yekun alış",
            "Net ödənilib",
            "ƏDV ödənilib",
            "Yekun ödənilib",
            "Qalıq net",
            "Qalıq ƏDV",
            "Yekun borc",
          ].map((label, i) => ({
            key: String(i),
            label,
            width: i === 0 ? 19 : i === 1 ? 9 : 8,
            align: i >= 2 ? "right" : "left",
          })),
          rows: rows.map((n) => ({
            id: n.supplier.id,
            cells: Object.fromEntries(
              [
                supplierDisplayName(n.supplier),
                n.supplier.tax_id_voen || "-",
                money(n.cost),
                money(n.vat),
                money(n.gross),
                money(n.paidNet),
                money(n.paidVat),
                money(n.paid),
                money(n.remainingNet),
                money(n.remainingVat),
                money(n.remaining),
              ].map((value, i) => [String(i), value]),
            ),
          })),
        },
      },
    ],
  };
}
