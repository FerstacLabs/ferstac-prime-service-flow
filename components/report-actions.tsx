import { Printer } from "lucide-react";
import Link from "next/link";
import { PdfLink } from "@/components/pdf-link";

export function ReportActions({ report }: { report: string }) {
  return (
    <div className="flex items-center gap-2">
      <Link href={`/reports/${report}/print`} target="_blank" className="btn btn-secondary report-button">
        <Printer size={16} />
        Çap
      </Link>
      <PdfLink href={`/api/reports/${report}/pdf`} />
    </div>
  );
}
