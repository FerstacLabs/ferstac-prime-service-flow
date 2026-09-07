"use client";

import { Printer } from "lucide-react";
import { PdfLink } from "@/components/pdf-link";

export function ReportActions({ report }: { report: string }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => window.print()} className="btn btn-secondary report-button">
        <Printer size={16} />
        Çap
      </button>
      <PdfLink href={`/api/reports/${report}/pdf`} />
    </div>
  );
}
