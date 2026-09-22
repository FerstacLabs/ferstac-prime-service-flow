"use client";

import { useFormStatus } from "react-dom";
import { WorkshopLoader } from "@/components/workshop-loader";
import { cn } from "@/lib/format";

export function SubmitButton({
  children,
  pendingText = "Saxlanır...",
  variant = "primary",
  className,
  name,
  value,
  disabled = false,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={cn("btn", `btn-${variant}`, className)}
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      aria-busy={pending}
    >
      <span className="button-state">
        <span aria-hidden={pending}>{children}</span>
        <span aria-hidden={!pending}>
          <WorkshopLoader label={pendingText} compact />
        </span>
      </span>
    </button>
  );
}
