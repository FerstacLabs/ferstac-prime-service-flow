import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/lib/report-pdf";
import { loadWorkshopReport } from "@/lib/reports/workshop-report";
import { parseFilters } from "@/lib/filters";
import type { ReportScope } from "@/lib/reports/report-types";
import { getCurrentUser } from "@/lib/supabase/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scope: string }> },
) {
  if (!(await getCurrentUser()))
    return NextResponse.json({ error: "Giriş tələb olunur." }, { status: 401 });
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
    ].includes(scope)
  ) {
    return NextResponse.json(
      { error: "Hesabat növü tapılmadı." },
      { status: 404 },
    );
  }
  const report = await loadWorkshopReport(
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
