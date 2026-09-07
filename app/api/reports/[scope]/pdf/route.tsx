import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/lib/report-pdf";
import { getJobs, getPurchases, getSuppliers, getWorkItems, getWorkers } from "@/lib/supabase/queries";

export async function GET(_request: Request, { params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  const [jobs, purchases, workItems, workers, suppliers] = await Promise.all([getJobs(), getPurchases(), getWorkItems(), getWorkers(), getSuppliers()]);
  const buffer = await renderToBuffer(<ReportDocument scope={scope} jobs={jobs} purchases={purchases} workItems={workItems} workers={workers} suppliers={suppliers} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="prime-flow-${scope}.pdf"`
    }
  });
}
