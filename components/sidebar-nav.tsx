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
  Truck,
} from "lucide-react";
import { canAccessPath, type AppRole } from "@/lib/security";
import { useModuleHref } from "@/components/workflow-navigation";

const items = [
  { href: "/vehicles", label: "Avtomobillər", icon: CarFront },
  { href: "/purchases", label: "Satınalma", icon: ShoppingCart },
  { href: "/suppliers", label: "Təchizatçılar", icon: Truck },
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
        .map((item) => <ModuleLink key={item.href} item={item} pathname={pathname} />)}
    </nav>
  );
}
function ModuleLink({ item: { href, label, icon: Icon }, pathname }: { item: typeof items[number]; pathname: string }) {
  const remembered = useModuleHref(href);
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return <div className="flex items-center">
    <Link href={remembered} className="sidebar-link min-w-0 flex-1" aria-current={active ? "page" : undefined}>
      <Icon size={18} aria-hidden="true" />{label}
    </Link>
    {remembered !== href && <Link href={href} className="p-2 text-[var(--muted)]" title={`${label}: əsas siyahı`} aria-label={`${label}: əsas siyahı`}><ClipboardList size={16} /></Link>}
  </div>;
}
