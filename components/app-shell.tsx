import Image from "next/image";
import Link from "next/link";
import { CarFront, ClipboardList, LayoutDashboard, LogOut, Search, ShoppingCart, Users } from "lucide-react";
import { QuickActions } from "@/components/quick-actions";
import { signOutAction } from "@/app/actions/auth";

const navItems = [
  { href: "/vehicles", label: "Avtomobillər", icon: CarFront },
  { href: "/purchases", label: "Satınalma", icon: ShoppingCart },
  { href: "/workers", label: "İşçilər", icon: Users },
  { href: "/work", label: "Görüləcək işlər", icon: ClipboardList },
  { href: "/overview", label: "İcmal", icon: LayoutDashboard }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="no-print border-b border-[var(--border)] bg-[rgba(17,19,24,0.92)] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 px-4 py-4 lg:block lg:px-5">
          <Link href="/overview" className="flex items-center gap-3">
            <Image src="/brand/prime-logo.png" alt="PRIME" width={116} height={32} className="h-8 w-auto object-contain" style={{ width: "auto", height: "auto" }} priority />
            <span className="sr-only">PRIME Flow</span>
          </Link>
          <div className="rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)] lg:mt-4 lg:inline-flex">
            PRIME Flow
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:px-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-w-max items-center gap-3 rounded-lg px-3 py-3 text-sm text-[var(--muted)] transition duration-150 hover:bg-[var(--elevated)] hover:text-white active:scale-[0.985] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] lg:mb-1"
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden px-5 pb-5 lg:absolute lg:bottom-0 lg:block">
          <div className="flex justify-center border-t border-[var(--border)] pt-5">
            <div className="sidebar-bot-frame">
              <Image src="/brand/prime-bot-icon.png" alt="" width={96} height={96} className="h-[76px] w-[76px] object-contain drop-shadow-[0_0_20px_rgba(229,193,77,0.22)]" />
            </div>
          </div>
        </div>
      </aside>

      <main>
        <header className="no-print sticky top-0 z-20 border-b border-[var(--border)] bg-[rgba(7,8,10,0.88)] px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-w-[16rem] flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
              <Search size={16} />
              <input className="w-full bg-transparent text-white outline-none placeholder:text-[var(--muted)]" placeholder="Nömrə ilə axtar: 10-PR-030" />
            </label>
            <QuickActions />
            <form action={signOutAction}>
              <button className="btn btn-secondary text-[var(--muted)]">
                <LogOut size={16} />
                Çıxış
              </button>
            </form>
          </div>
        </header>
        <div className="px-4 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ title, eyebrow, actions }: { title: string; eyebrow?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="mb-2 text-sm font-medium text-[var(--accent)]">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-normal text-white md:text-3xl">{title}</h1>
      </div>
      {actions}
    </div>
  );
}

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const colors = {
    neutral: "border-[var(--border)] text-[var(--silver)]",
    success: "border-[rgba(69,201,121,0.45)] text-[var(--success)]",
    warning: "border-[rgba(232,169,59,0.45)] text-[var(--warning)]",
    danger: "border-[rgba(232,91,91,0.45)] text-[var(--danger)]"
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${colors[tone]}`}>{children}</span>;
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`print-surface rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl shadow-black/20 ${className}`}>{children}</section>;
}

export const statusLabels = {
  RECEIVED: "Qəbul edilib",
  WAITING: "İş gözləyir",
  IN_PROGRESS: "İş gedir",
  WAITING_PARTS: "Detal gözləyir",
  READY: "Hazırdır",
  DELIVERED: "Təhvil verilib",
  PAUSED: "Dayandırılıb",
  TODO: "Gözləyir",
  DONE: "Tamamlandı",
  CANCELLED: "Ləğv edildi"
} as const;

export const fundingLabels = {
  CUSTOMER_FUNDED: "Müştəri hesabına",
  INSURANCE_CLAIM: "Sığorta hadisəsi üzrə"
} as const;
