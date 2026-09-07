import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/lib/report-pdf";
import { buildReportForScope } from "@/lib/reports/report-data";
import type { ReportScope } from "@/lib/reports/report-types";

export async function GET(_request: Request, { params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  if (!["overview", "purchases", "workers", "work"].includes(scope)) {
    return NextResponse.json({ error: "Hesabat növü tapılmadı." }, { status: 404 });
  }
  const report = await buildReportForScope(scope as ReportScope);
  const buffer = await renderToBuffer(<ReportDocument report={report} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="prime-flow-${scope}.pdf"`
    }
  });
}
