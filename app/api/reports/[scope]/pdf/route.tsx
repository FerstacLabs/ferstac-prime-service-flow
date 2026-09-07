import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/lib/report-pdf";

export async function GET(_request: Request, { params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  const buffer = await renderToBuffer(<ReportDocument scope={scope} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="prime-flow-${scope}.pdf"`
    }
  });
}
