"use client";

import Link from "next/link";
import { Car, Plus, ShoppingCart } from "lucide-react";

export function QuickActions() {
  return (
    <div className="flex items-center gap-2">
      <Link className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black" href="/vehicles/new">
        <Car size={16} />
        Yeni avtomobil
      </Link>
      <Link className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-white" href="/purchases">
        <ShoppingCart size={16} />
        Yeni alış
      </Link>
      <button aria-label="Əlavə et" className="grid size-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)]">
        <Plus size={16} />
      </button>
    </div>
  );
}
