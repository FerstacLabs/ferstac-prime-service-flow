"use client";

import { useFormStatus } from "react-dom";
import { WorkshopLoader } from "@/components/workshop-loader";
import { cn } from "@/lib/format";

export function SubmitButton({
  children,
  pendingText = "Saxlanır...",
  variant = "primary",
  className
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={cn("btn", `btn-${variant}`, className)} disabled={pending} aria-disabled={pending}>
      {pending ? <WorkshopLoader label={pendingText} compact /> : children}
    </button>
  );
}

