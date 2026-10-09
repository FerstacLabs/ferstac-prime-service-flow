import type { FinanceData } from "@/lib/finance";
import { journalFilters } from "@/lib/finance";
import { financeReport } from "@/lib/reports/finance-report";
import type { PrimeReport } from "@/lib/reports/report-types";
import {
  formatReportDate,
  formatReportDateTime,
} from "@/lib/reports/report-format";

export type ReconciliationDocument = {
  id: string;
  organization_id: string;
  document_number: string;
  entity_type: "worker" | "supplier";
  entity_id: string;
  entity_name_snapshot: string;
  entity_snapshot: Record<string, unknown>;
  period_from: string;
  period_to: string;
  service_job_id: string | null;
  source_snapshot: FinanceData;
  report_snapshot: PrimeReport | null;
  totals_snapshot: PrimeReport["summary"] | null;
  status: "DRAFT" | "CONFIRMED";
  created_at: string;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
  signed_file_path: string | null;
  version: number;
  supersedes_document_id: string | null;
  superseded_by: string | null;
  outdated: boolean;
};
export type ReconciliationListItem = Omit<
  ReconciliationDocument,
  "source_snapshot" | "report_snapshot" | "entity_snapshot"
>;
export function reconciliationStatus(
  d: Pick<ReconciliationDocument, "status" | "superseded_by" | "outdated">,
) {
  return d.superseded_by
    ? "Əvəz edilib"
    : d.outdated
      ? "Yenilənmə tələb olunur"
      : d.status === "CONFIRMED"
        ? "Təsdiqlənib"
        : "Qaralama";
}
export function reconciliationReport(d: ReconciliationDocument): PrimeReport {
  // Only the creation/sealing path uses source data. Opening a saved document uses report_snapshot.
  const report = financeReport(
    d.source_snapshot,
    journalFilters({
      reportType: d.entity_type,
      [d.entity_type]: d.entity_id,
      from: d.period_from,
      to: d.period_to,
      job: d.service_job_id ?? "",
    }),
  )!;
  report.generatedAt = formatReportDateTime(d.created_at);
  report.documentContext = [
    d.document_number,
    d.entity_name_snapshot,
    d.period_from,
    d.period_to,
  ];
  report.sections.unshift({
    title: "Sənəd məlumatları",
    fields: [
      { label: "Sənəd №", value: d.document_number },
      { label: "Tərəf", value: d.entity_name_snapshot },
      {
        label: "Dövr",
        value: `${formatReportDate(d.period_from)} - ${formatReportDate(d.period_to)}`,
      },
      { label: "Versiya", value: String(d.version) },
      { label: "Status", value: "İmzalanma üçün hazırlanıb" },
      ...(d.entity_snapshot.tax_id_voen || d.entity_snapshot.tax_id
        ? [
            {
              label: "VÖEN",
              value: String(
                d.entity_snapshot.tax_id_voen || d.entity_snapshot.tax_id,
              ),
            },
          ]
        : []),
      ...(d.entity_snapshot.phone
        ? [{ label: "Telefon", value: String(d.entity_snapshot.phone) }]
        : []),
    ],
  });
  return report;
}
export function savedReconciliationReport(
  d: ReconciliationDocument,
): PrimeReport | null {
  if (!d.report_snapshot) return null;
  const report = structuredClone(d.report_snapshot);
  // Redact legacy internal account balances only at presentation time, never rewrite signed snapshots.
  const internalBalance = (label: string) =>
    /hesab üzrə qalıq|account[_ ]?balance|cash balance|bank balance|ƏDV depozit.*qal|vat[_ ]?(deposit[_ ]?)?balance/i.test(
      label,
    );
  report.summary = report.summary.filter(
    (item) => !internalBalance(item.label),
  );
  for (const section of report.sections) {
    section.summary = section.summary?.filter(
      (item) => !internalBalance(item.label),
    );
    section.fields = section.fields?.filter(
      (item) => !internalBalance(item.label),
    );
    if (!section.table) continue;
    const table = section.table;
    const paymentTable = table.columns.some(
      (c) => c.key === "in" || c.key === "out",
    );
    const privateKey = (key: string) =>
      internalBalance(key) || (paymentTable && key === "balance");
    const removed = new Set(
      table.columns
        .filter((c) => internalBalance(c.label) || privateKey(c.key))
        .map((c) => c.key),
    );
    table.columns = table.columns.filter((c) => !removed.has(c.key));
    for (const row of table.rows) {
      row.cells = Object.fromEntries(
        Object.entries(row.cells).filter(
          ([key]) => !removed.has(key) && !privateKey(key),
        ),
      );
      row.details = row.details?.filter((item) => !internalBalance(item.label));
    }
  }
  report.generatedAt = formatReportDateTime(d.created_at);
  // Lifecycle metadata may evolve; all financial values and rows remain the stored snapshot.
  const metadata = report.sections.find((s) => s.title === "Sənəd məlumatları");
  const status = metadata?.fields?.find((f) => f.label === "Status");
  if (status) status.value = reconciliationStatus(d);
  if (d.confirmed_at)
    metadata?.fields?.push({
      label: "Təsdiqlənib",
      value: `${formatReportDateTime(d.confirmed_at)} · ${d.confirmed_by_name ?? "PRIME"}`,
    });
  return report;
}
export const signedPdfLimit = 10 * 1024 * 1024;
export function validateSignedPdf(bytes: Uint8Array, mime: string) {
  if (bytes.length < 5 || bytes.length > signedPdfLimit)
    throw new Error("PDF ölçüsü 10 MB-dan çox olmamalıdır.");
  const header = new TextDecoder().decode(bytes.subarray(0, 5));
  const tail = new TextDecoder().decode(
    bytes.subarray(Math.max(0, bytes.length - 1024)),
  );
  if (
    mime !== "application/pdf" ||
    header !== "%PDF-" ||
    !tail.includes("%%EOF")
  )
    throw new Error("Yalnız düzgün PDF sənədi yükləyin.");
}
