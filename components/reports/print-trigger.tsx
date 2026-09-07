"use client";

import { useEffect } from "react";

export function PrintTrigger() {
  useEffect(() => {
    window.setTimeout(() => window.print(), 250);
  }, []);

  return null;
}

export function PrintButton() {
  return (
    <button type="button" className="btn btn-secondary print-report-action" onClick={() => window.print()}>
      Çap
    </button>
  );
}
