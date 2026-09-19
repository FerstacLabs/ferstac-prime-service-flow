import { FilePenLine } from "lucide-react";
import { ReportActions } from "@/components/report-actions";
import { canGenerateHandover } from "@/lib/workshop";
import type { DbServiceJob } from "@/lib/supabase/queries";

export function HandoverAction({ job }: { job: DbServiceJob }) {
  if (!canGenerateHandover(job.status))
    return (
      <div className="max-w-sm">
        <button
          type="button"
          disabled
          className="btn btn-secondary"
          aria-describedby="handover-unavailable"
        >
          <FilePenLine size={16} /> Təhvil-təslim aktı
        </button>
        <p
          id="handover-unavailable"
          className="mt-2 text-xs text-[var(--muted)]"
        >
          Təhvil-təslim aktı yalnız servis işi tamamlandıqdan sonra yaradılır.
        </p>
      </div>
    );
  return (
    <details className="relative">
      <summary className="btn btn-secondary cursor-pointer list-none">
        <FilePenLine size={16} /> Təhvil-təslim aktı
      </summary>
      <div className="mt-3">
        <ReportActions report="handover" query={`job=${job.id}`} />
      </div>
    </details>
  );
}
