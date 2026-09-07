import { notFound } from "next/navigation";
import { PrintReport } from "@/components/reports/print-report";
import { buildReportForScope } from "@/lib/reports/report-data";
import type { ReportScope } from "@/lib/reports/report-types";

export const dynamic = "force-dynamic";

export default async function ReportPrintPage({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  if (!["overview", "purchases", "workers", "work"].includes(scope)) notFound();
  const report = await buildReportForScope(scope as ReportScope);
  return <PrintReport report={report} />;
}
