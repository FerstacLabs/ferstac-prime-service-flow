import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/lib/report-pdf";
import { getJobs, getPurchases, getWorkItems } from "@/lib/supabase/queries";

export async function GET(_request: Request, { params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  const [jobs, purchases, workItems] = await Promise.all([getJobs(), getPurchases(), getWorkItems()]);
  const buffer = await renderToBuffer(<ReportDocument scope={scope} jobs={jobs} purchases={purchases} workItems={workItems} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="prime-flow-${scope}.pdf"`
    }
  });
}
