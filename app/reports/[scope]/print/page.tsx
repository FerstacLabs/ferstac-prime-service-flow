import { notFound } from "next/navigation";
import { PrintReport } from "@/components/reports/print-report";
import { loadWorkshopReport } from "@/lib/reports/workshop-report";
import { parseFilters, type SearchParams } from "@/lib/filters";
import type { ReportScope } from "@/lib/reports/report-types";
import { loadAuditReport } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function ReportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ scope: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { scope } = await params;
  if (
    ![
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
    scope === "audit"
      ? await loadAuditReport(await searchParams)
      : await loadWorkshopReport(
          scope as ReportScope,
          parseFilters(await searchParams),
        );
  if (!report) notFound();
  return <PrintReport report={report} />;
}
