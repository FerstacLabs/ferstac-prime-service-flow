import { notFound } from "next/navigation";
import { PrintReport } from "@/components/reports/print-report";
import { buildVehicleReportForJob } from "@/lib/reports/report-data";
import { cache } from "react";
import { documentFilename } from "@/lib/reports/document-filename";

export const dynamic = "force-dynamic";
const loadPrint = cache(buildVehicleReportForJob);
export async function generateMetadata({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const report = await loadPrint((await params).jobId);
  if (!report) notFound();
  return { title: documentFilename(report).replace(/\.pdf$/, "") };
}

export default async function VehicleReportPrintPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const report = await loadPrint(jobId);
  if (!report) notFound();
  return <PrintReport report={report} />;
}
