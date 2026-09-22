"use client";

import Link from "next/link";
import { Car, ShoppingCart } from "lucide-react";
import type { AppRole } from "@/lib/security";

export function QuickActions({ role }: { role: AppRole }) {
  if (role === "CASHIER") return null;
  return (
    <div className="flex items-center gap-2">
      <Link className="btn btn-primary" href="/vehicles/new">
        <Car size={16} />
        Yeni avtomobil
      </Link>
      {role === "ADMIN" ? (
        <Link className="btn btn-secondary" href="/purchases">
          <ShoppingCart size={16} />
          Yeni alış
        </Link>
      ) : null}
    </div>
  );
}
