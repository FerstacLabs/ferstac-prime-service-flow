import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/lib/report-pdf";
import { buildVehicleReportForJob } from "@/lib/reports/report-data";
import { getCurrentAccess } from "@/lib/supabase/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const access = await getCurrentAccess();
  if (!access)
    return NextResponse.json({ error: "Giriş tələb olunur." }, { status: 401 });
  const { jobId } = await params;
  if (
    !access.profile.is_active ||
    !access.profile.session_valid ||
    access.profile.must_change_password ||
    access.profile.role !== "ADMIN"
  )
    return NextResponse.json(
      { error: "Giriş icazəsi yoxdur." },
      { status: 403 },
    );
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
