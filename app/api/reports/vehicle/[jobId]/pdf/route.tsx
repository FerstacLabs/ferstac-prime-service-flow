import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/lib/report-pdf";
import { buildVehicleReportForJob } from "@/lib/reports/report-data";

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const report = await buildVehicleReportForJob(jobId);
  if (!report) return NextResponse.json({ error: "Servis kartı tapılmadı." }, { status: 404 });
  const buffer = await renderToBuffer(<ReportDocument report={report} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="prime-flow-vehicle-${jobId}.pdf"`
    }
  });
}
