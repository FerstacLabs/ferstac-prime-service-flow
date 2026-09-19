import Image from "next/image";
import Link from "next/link";
import { LogOut, Search } from "lucide-react";
import { QuickActions } from "@/components/quick-actions";
import { SidebarNav } from "@/components/sidebar-nav";
import { signOutAction } from "@/app/actions/auth";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="app-sidebar no-print border-b border-[var(--border)] bg-[rgba(17,19,24,0.92)] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-4 lg:block lg:px-5 lg:pb-3">
          <Link href="/overview" className="flex items-center gap-3 lg:block">
            <Image
              src="/brand/prime-logo.png"
              alt="PRIME"
              width={224}
              height={65}
              className="h-auto w-[9.75rem] max-w-full object-contain lg:w-[14rem]"
              priority
            />
            <span className="sr-only">PRIME Flow</span>
          </Link>
          <div className="status-badge border-[var(--border)] text-[var(--muted)] lg:mt-4">
            PRIME Flow
          </div>
        </div>

        <SidebarNav />

        <div
          className="pointer-events-none mt-auto hidden w-full shrink-0 px-2 pb-5 pt-4 lg:block"
          aria-hidden="true"
        >
          <div className="flex justify-center">
            <Image
              src="/brand/prime-bot-icon.png"
              alt=""
              width={256}
              height={256}
              className="sidebar-bot"
              loading="eager"
            />
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="app-toolbar no-print sticky top-0 z-20 border-b border-[var(--border)] bg-[rgba(7,8,10,0.88)] px-4 py-3 backdrop-blur lg:px-8">
          <div className="toolbar-content">
            <form
              action="/vehicles"
              className="toolbar-search flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--muted)]"
            >
              <Search size={16} />
              <input
                name="plate"
                aria-label="Nömrə axtarışı"
                className="w-full bg-transparent text-white outline-none placeholder:text-[var(--muted)]"
                placeholder="Nömrə ilə axtar: 10-PR-030"
              />
            </form>
            <QuickActions />
            <form action={signOutAction}>
              <button className="btn btn-secondary text-[var(--muted)]">
                <LogOut size={16} />
                Çıxış
              </button>
            </form>
          </div>
        </header>
        <div className="app-content px-4 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  eyebrow,
  actions,
}: {
  title: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-[1_1_20rem]">
        {eyebrow ? (
          <p className="mb-2 text-sm font-medium text-[var(--accent)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-normal text-white md:text-3xl">
          {title}
        </h1>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const colors = {
    neutral: "border-[var(--border)] text-[var(--silver)]",
    success: "border-[rgba(69,201,121,0.45)] text-[var(--success)]",
    warning: "border-[rgba(232,169,59,0.45)] text-[var(--warning)]",
    danger: "border-[rgba(232,91,91,0.45)] text-[var(--danger)]",
  };
  return <span className={`status-badge ${colors[tone]}`}>{children}</span>;
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`print-surface min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 ${className}`}
    >
      {children}
    </section>
  );
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
  CANCELLED: "Ləğv edildi",
} as const;

export const fundingLabels = {
  CUSTOMER_FUNDED: "Müştəri hesabına",
  INSURANCE_CLAIM: "Sığorta hadisəsi üzrə",
} as const;
