"use client";

import { Trash2 } from "lucide-react";

export function ConfirmButton({
  message,
  children,
  danger = false
}: {
  message: string;
  children?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      className={danger ? "inline-flex items-center gap-2 rounded-lg border border-[rgba(232,91,91,.45)] px-3 py-2 text-sm text-[var(--danger)]" : undefined}
      title={typeof children === "string" ? children : undefined}
    >
      {children ?? <Trash2 size={16} />}
    </button>
  );
}
