import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/lib/report-pdf";
import { getJob, getPurchases, getSuppliers, getWorkItems, getWorkers } from "@/lib/supabase/queries";

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Servis kartı tapılmadı." }, { status: 404 });
  const [purchases, workItems, workers, suppliers] = await Promise.all([getPurchases(jobId), getWorkItems(jobId), getWorkers(), getSuppliers()]);
  const buffer = await renderToBuffer(<ReportDocument scope="vehicle" jobs={[job]} purchases={purchases} workItems={workItems} workers={workers} suppliers={suppliers} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="prime-flow-vehicle-${jobId}.pdf"`
    }
  });
}
