"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

async function preparePrint() {
  await document.fonts.ready;
  await Promise.all(
    Array.from(
      document.querySelectorAll<HTMLImageElement>(".print-report img"),
    ).map((image) => image.decode().catch(() => undefined)),
  );
}

export function PrintTrigger() {
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      await preparePrint();
      if (!cancelled) window.print();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}

export function PrintButton() {
  return (
    <button
      type="button"
      className="btn btn-secondary print-report-action"
      onClick={async () => {
        await preparePrint();
        window.print();
      }}
    >
      <Printer size={16} aria-hidden="true" /> Çap
    </button>
  );
}
