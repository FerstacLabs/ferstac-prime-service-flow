import { notFound } from "next/navigation";
import { getReconciliation } from "@/lib/supabase/reconciliation";
import { PrintReport } from "@/components/reports/print-report";
import { savedReconciliationReport } from "@/lib/reconciliation";
export const dynamic = "force-dynamic";
export default async function ReconciliationPrint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const document = await getReconciliation((await params).id);
  if (!document?.report_snapshot) notFound();
  return <PrintReport report={savedReconciliationReport(document)!} />;
}
