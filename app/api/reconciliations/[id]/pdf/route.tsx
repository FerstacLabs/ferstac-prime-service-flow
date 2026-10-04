import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentAccess } from "@/lib/supabase/auth";
import { getReconciliation } from "@/lib/supabase/reconciliation";
import { ReportDocument } from "@/lib/report-pdf";
import { documentDisposition } from "@/lib/reports/document-filename";
import { savedReconciliationReport } from "@/lib/reconciliation";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getCurrentAccess();
  if (
    !access ||
    !access.profile.is_active ||
    !access.profile.session_valid ||
    access.profile.must_change_password ||
    !["ADMIN", "CASHIER"].includes(access.profile.role)
  )
    return NextResponse.json(
      { error: "Giriş icazəsi yoxdur." },
      { status: 403 },
    );
  const d = await getReconciliation((await params).id);
  if (!d?.report_snapshot)
    return NextResponse.json({ error: "Hesabat tapılmadı." }, { status: 404 });
  const report = savedReconciliationReport(d)!;
  const buffer = await renderToBuffer(<ReportDocument report={report} />);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": documentDisposition(report),
    },
  });
}
