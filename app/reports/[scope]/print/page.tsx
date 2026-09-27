import { notFound } from "next/navigation";
import { PrintReport } from "@/components/reports/print-report";
import { loadWorkshopReport } from "@/lib/reports/workshop-report";
import { parseFilters, type SearchParams } from "@/lib/filters";
import type { ReportScope } from "@/lib/reports/report-types";
import { loadAuditReport } from "@/lib/audit";
import { loadFinanceReport } from "@/lib/reports/finance-report";
import { cache } from "react";
import { documentFilename } from "@/lib/reports/document-filename";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ scope: string }>;
  searchParams: Promise<SearchParams>;
};
const loadPrint = cache(async (scope: string, query: string) => {
  const searchParams = JSON.parse(query) as SearchParams;
  if (
    ![
      "finance",
      "overview",
      "purchases",
      "workers",
      "work",
      "quotation",
      "handover",
      "kassa",
      "audit",
    ].includes(scope)
  )
    notFound();
  const report =
    scope === "finance" || scope === "kassa"
      ? await loadFinanceReport(searchParams)
      : scope === "audit"
        ? await loadAuditReport(searchParams)
        : await loadWorkshopReport(
            scope as ReportScope,
            parseFilters(searchParams),
          );
  if (!report) notFound();
  return report;
});
export async function generateMetadata({ params, searchParams }: Props) {
  const report = await loadPrint(
    (await params).scope,
    JSON.stringify(await searchParams),
  );
  return { title: documentFilename(report).replace(/\.pdf$/, "") };
}
export default async function ReportPrintPage({ params, searchParams }: Props) {
  const report = await loadPrint(
    (await params).scope,
    JSON.stringify(await searchParams),
  );
  return <PrintReport report={report} />;
}
