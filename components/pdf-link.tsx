"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { WorkshopLoader } from "@/components/workshop-loader";
import { cn } from "@/lib/format";

export function PdfLink({ href, compact = false }: { href: string; compact?: boolean }) {
  const [pending, setPending] = useState(false);
  return (
    <a
      href={href}
      onClick={() => {
        setPending(true);
        window.setTimeout(() => setPending(false), 3500);
      }}
      aria-disabled={pending}
      className={cn("btn btn-secondary report-button border-[rgba(229,193,77,.58)] text-[var(--accent)]", compact && "min-w-[4.6rem]")}
    >
      {pending ? <WorkshopLoader label="PDF..." compact /> : <><Download size={16} />PDF</>}
    </a>
  );
}
