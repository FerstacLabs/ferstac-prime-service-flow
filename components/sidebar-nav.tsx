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
} from "lucide-react";

const items = [
  { href: "/vehicles", label: "Avtomobillər", icon: CarFront },
  { href: "/purchases", label: "Satınalma", icon: ShoppingCart },
  { href: "/workers", label: "İşçilər", icon: Users },
  { href: "/work", label: "Görüləcək işlər", icon: ClipboardList },
  { href: "/overview", label: "İcmal", icon: LayoutDashboard },
  { href: "/kassa", label: "Kassa", icon: Wallet },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Əsas naviqasiya" className="sidebar-nav">
      {items.map(({ href, label, icon: Icon }) => (
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
