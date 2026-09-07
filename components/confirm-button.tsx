"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { WorkshopLoader } from "@/components/workshop-loader";

export function ConfirmButton({
  message,
  children,
  danger = false
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
      className={danger ? "btn btn-danger" : "btn btn-danger !min-h-0 !p-2"}
      title={typeof children === "string" ? children : undefined}
    >
      {pending ? <WorkshopLoader label="Gözləyin..." compact /> : children ?? <Trash2 size={16} />}
    </button>
  );
}
