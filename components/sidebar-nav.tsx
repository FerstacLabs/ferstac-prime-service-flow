"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CarFront,
  ClipboardList,
  LayoutDashboard,
  ShoppingCart,
  Users,
  Wallet,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { canAccessPath, type AppRole } from "@/lib/security";

const items = [
  { href: "/vehicles", label: "Avtomobillər", icon: CarFront },
  { href: "/purchases", label: "Satınalma", icon: ShoppingCart },
  { href: "/workers", label: "İşçilər", icon: Users },
  { href: "/work", label: "Görüləcək işlər", icon: ClipboardList },
  { href: "/overview", label: "İcmal", icon: LayoutDashboard },
  { href: "/kassa", label: "Kassa", icon: Wallet },
  { href: "/audit", label: "Audit", icon: ScrollText },
  { href: "/security", label: "Təhlükəsizlik", icon: ShieldCheck },
];

export function SidebarNav({ role }: { role: AppRole }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Əsas naviqasiya" className="sidebar-nav">
      {items
        .filter(({ href }) => canAccessPath(role, href))
        .map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="sidebar-link"
            aria-current={
              pathname === href || pathname.startsWith(`${href}/`)
                ? "page"
                : undefined
            }
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </Link>
        ))}
    </nav>
  );
}
