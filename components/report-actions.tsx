"use client";

import { Download, Printer } from "lucide-react";

export function ReportActions({ report }: { report: string }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-white">
        <Printer size={16} />
        Çap
      </button>
      <a href={`/api/reports/${report}/pdf`} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black">
        <Download size={16} />
        PDF
      </a>
    </div>
  );
}
