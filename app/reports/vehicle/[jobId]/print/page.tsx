import { notFound } from "next/navigation";
import { PrintReport } from "@/components/reports/print-report";
import { buildVehicleReportForJob } from "@/lib/reports/report-data";

export const dynamic = "force-dynamic";

export default async function VehicleReportPrintPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const report = await buildVehicleReportForJob(jobId);
  if (!report) notFound();
  return <PrintReport report={report} />;
}
