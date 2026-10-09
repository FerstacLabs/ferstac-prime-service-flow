import type { FinanceData, JournalFilters } from "@/lib/finance";
import { moneySum } from "@/lib/finance";
import { vatEventLabels, vatLedgerPosition } from "@/lib/vat-ledger";
import {
  formatReportDate,
  formatReportDateTime,
  formatReportMoney,
} from "@/lib/reports/report-format";
import type { PrimeReport } from "@/lib/reports/report-types";

export function vatReport(
  data: FinanceData,
  filters: JournalFilters,
): PrimeReport {
  const position = vatLedgerPosition(data.vatLedger ?? [], filters);
  const sum = (kind: string) =>
    moneySum(
      position.period.filter((r) => r.kind === kind).map((r) => r.amount),
    );
  const other = (direction: "IN" | "OUT") =>
    moneySum(
      position.period
        .filter(
          (r) =>
            r.direction === direction &&
            ![
              "CUSTOMER_RECEIPT",
              "SUPPLIER_PAYMENT",
              "BUDGET_PAYMENT",
            ].includes(r.kind),
        )
        .map((r) => r.amount),
    );
  return {
    scope: "finance",
    title: "ƏDV hesabatı",
    generatedAt: formatReportDateTime().replaceAll("/", "."),
    orientation: "landscape",
    filters: [
      filters.from && `Başlanğıc: ${formatReportDate(filters.from).replaceAll("/", ".")}`,
      filters.to && `Son: ${formatReportDate(filters.to).replaceAll("/", ".")}`,
      vatEventLabels[filters.vatKind ?? ""],
      data.jobs.find((j) => j.id === filters.job)?.plate,
      data.purchases.find((p) => p.supplier_id === filters.supplier)?.supplier,
      filters.channel,
    ]
      .filter(Boolean)
      .join(" | "),
    summary: [
      ["Dövrün əvvəlində ƏDV depozit qalığı", position.opening],
      ["Müştərilərdən daxil olan ƏDV", sum("CUSTOMER_RECEIPT")],
      ["Təchizatçılara ödənilən ƏDV", sum("SUPPLIER_PAYMENT")],
      ["Digər ƏDV mədaxili", other("IN")],
      ["Büdcəyə ödəniş", sum("BUDGET_PAYMENT")],
      ["Digər ƏDV məxarici", other("OUT")],
      ["Dövrün sonunda ƏDV depozit qalığı", position.closing],
    ].map(([label, amount]) => ({
      label: String(label),
      value: formatReportMoney(Number(amount)),
    })),
    sections: [
      {
        title: "ƏDV depozit hərəkətləri",
        table: {
          columns: [
            "Tarix",
            "Əməliyyat",
            "Tərəf",
            "Avtomobil / sənəd",
            "İstinad",
            "ƏDV mədaxili",
            "ƏDV məxarici",
            "ƏDV qalığı",
            "Daxil edən",
          ].map((label, i) => ({
            key: String(i),
            label,
            width: [11, 17, 12, 12, 13, 9, 9, 9, 8][i],
            align: i >= 5 && i <= 7 ? ("right" as const) : ("left" as const),
          })),
          rows: position.rows.map((r) => ({
            id: r.id,
            cells: {
              "0": formatReportDateTime(r.occurred_at).replaceAll("/", "."),
              "1": vatEventLabels[r.kind] ?? r.kind,
              "2": r.party || "-",
              "3": r.plate || "-",
              "4": r.reference_number.replace(/([^\s]{16})(?=\S)/g, "$1\n"),
              "5": formatReportMoney(r.direction === "IN" ? r.amount : 0),
              "6": formatReportMoney(r.direction === "OUT" ? r.amount : 0),
              "7": formatReportMoney(r.balance),
              "8": r.created_by_name,
            },
          })),
        },
      },
    ],
  };
}
