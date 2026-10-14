import Image from "next/image";
import { ExternalLink } from "lucide-react";

const FERSTACLABS_URL = "https://www.ferstaclabs.com/";

export function FerstacLabsAttribution({
  className = "",
}: {
  className?: string;
}) {
  return (
    <a
      href={FERSTACLABS_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="FerstacLabs — proqram təminatının tərtibatçısı"
      className={`group flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-white/[0.04] ${className}`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04]">
        <Image
          src="/brand/ferstaclabs-mark.svg"
          alt=""
          width={18}
          height={20}
          aria-hidden="true"
          className="h-5 w-auto brightness-0 invert opacity-90"
        />
      </span>

      <span className="min-w-0 leading-tight">
        <span className="block text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
          Developed by
        </span>
        <span className="mt-0.5 block text-xs font-semibold text-[var(--silver)] transition group-hover:text-white">
          FerstacLabs
        </span>
      </span>

      <ExternalLink
        size={11}
        aria-hidden="true"
        className="ml-auto shrink-0 text-[var(--muted)] opacity-60 transition group-hover:opacity-100"
      />
    </a>
  );
}
