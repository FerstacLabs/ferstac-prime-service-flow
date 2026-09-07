"use client";

import Link from "next/link";
import { Car, ShoppingCart } from "lucide-react";

export function QuickActions() {
  return (
    <div className="flex items-center gap-2">
      <Link className="btn btn-primary" href="/vehicles/new">
        <Car size={16} />
        Yeni avtomobil
      </Link>
      <Link className="btn btn-secondary" href="/purchases">
        <ShoppingCart size={16} />
        Yeni alış
      </Link>
    </div>
  );
}
