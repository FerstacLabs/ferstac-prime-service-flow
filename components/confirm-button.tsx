"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { WorkshopLoader } from "@/components/workshop-loader";

export function ConfirmButton({
  message,
  children,
  danger = false,
}: {
  message: string;
  children?: React.ReactNode;
  danger?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      disabled={pending}
      aria-disabled={pending}
      aria-busy={pending}
      aria-label={children ? undefined : pending ? "Gözləyin..." : "Sil"}
      className={
        danger || children ? "btn btn-danger" : "btn btn-danger btn-icon"
      }
      title={typeof children === "string" ? children : undefined}
    >
      <span className="button-state">
        <span aria-hidden={pending}>{children ?? <Trash2 size={16} />}</span>
        <span aria-hidden={!pending}>
          <WorkshopLoader label={children ? "Gözləyin..." : ""} compact />
        </span>
      </span>
    </button>
  );
}
