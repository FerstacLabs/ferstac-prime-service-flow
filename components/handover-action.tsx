import { FilePenLine } from "lucide-react";
import { ReportActions } from "@/components/report-actions";
import type { DbServiceJob } from "@/lib/supabase/queries";

export function HandoverAction({ job }: { job: DbServiceJob }) {
  return (
    <details className="relative">
      <summary className="btn btn-secondary cursor-pointer list-none">
        <FilePenLine size={16} /> Təhvil-təslim aktı (PDF / Çap)
      </summary>
      <div className="mt-3">
        <ReportActions report="handover" query={`job=${job.id}`} />
      </div>
    </details>
  );
}
