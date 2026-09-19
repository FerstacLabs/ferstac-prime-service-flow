import { Printer } from "lucide-react";
import Link from "next/link";
import { PdfLink } from "@/components/pdf-link";

export function ReportActions({
  report,
  query = "",
}: {
  report: string;
  query?: string;
}) {
  const suffix = query ? `?${query}` : "";
  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/reports/${report}/print${suffix}`}
        target="_blank"
        className="btn btn-secondary report-button"
      >
        <Printer size={16} />
        Çap
      </Link>
      <PdfLink href={`/api/reports/${report}/pdf${suffix}`} />
    </div>
  );
}
