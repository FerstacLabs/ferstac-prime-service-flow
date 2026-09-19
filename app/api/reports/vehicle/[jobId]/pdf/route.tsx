import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/lib/report-pdf";
import { buildVehicleReportForJob } from "@/lib/reports/report-data";
import { getCurrentUser } from "@/lib/supabase/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  if (!(await getCurrentUser()))
    return NextResponse.json({ error: "Giriş tələb olunur." }, { status: 401 });
  const { jobId } = await params;
  const report = await buildVehicleReportForJob(jobId);
  if (!report)
    return NextResponse.json(
      { error: "Servis kartı tapılmadı." },
      { status: 404 },
    );
  const buffer = await renderToBuffer(<ReportDocument report={report} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="prime-flow-vehicle-${jobId}.pdf"`,
    },
  });
}
