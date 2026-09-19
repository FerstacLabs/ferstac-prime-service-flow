"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

export function PrintTrigger() {
  useEffect(() => {
    window.setTimeout(() => window.print(), 250);
  }, []);

  return null;
}

export function PrintButton() {
  return (
    <button
      type="button"
      className="btn btn-secondary print-report-action"
      onClick={() => window.print()}
    >
      <Printer size={16} aria-hidden="true" /> Çap
    </button>
  );
}
