import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/lib/report-pdf";
import { loadWorkshopReport } from "@/lib/reports/workshop-report";
import { parseFilters } from "@/lib/filters";
import type { ReportScope } from "@/lib/reports/report-types";
import { getCurrentAccess } from "@/lib/supabase/auth";
import { canReport } from "@/lib/security";
import { loadAuditReport } from "@/lib/audit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scope: string }> },
) {
  const access = await getCurrentAccess();
  if (!access)
    return NextResponse.json({ error: "Giriş tələb olunur." }, { status: 401 });
  const { scope } = await params;
  if (
    !access.profile.is_active ||
    !access.profile.session_valid ||
    access.profile.must_change_password ||
    !canReport(access.profile.role, scope)
  )
    return NextResponse.json(
      { error: "Giriş icazəsi yoxdur." },
      { status: 403 },
    );
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
  ) {
    return NextResponse.json(
      { error: "Hesabat növü tapılmadı." },
      { status: 404 },
    );
  }
  const report =
    scope === "audit"
      ? await loadAuditReport(
          Object.fromEntries(new URL(_request.url).searchParams),
        )
      : await loadWorkshopReport(
          scope as ReportScope,
          parseFilters(Object.fromEntries(new URL(_request.url).searchParams)),
        );
  if (!report)
    return NextResponse.json(
      { error: "Hesabat tapılmadı və ya servis hazır deyil." },
      { status: 404 },
    );
  const buffer = await renderToBuffer(<ReportDocument report={report} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="prime-flow-${scope}.pdf"`,
    },
  });
}
