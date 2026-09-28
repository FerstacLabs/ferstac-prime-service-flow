"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { actionFailure, visibleActionError } from "@/lib/action-errors";
export function ActionForm({
  action,
  children,
  className,
  reset = false,
  onSuccess,
}: {
  action: (form: FormData) => Promise<void | { error: string }>;
  children: React.ReactNode;
  className?: string;
  reset?: boolean;
  onSuccess?: () => void;
}) {
  const [error, setError] = useState("");
  const key = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const allowReset = useRef(false);
  const router = useRouter();
  return (
    <form
      ref={formRef}
      className={className}
      onReset={(event) => {
        if (!allowReset.current) event.preventDefault();
      }}
      action={async (form) => {
        setError("");
        key.current ??= crypto.randomUUID();
        form.set("idempotency_key", key.current);
        try {
          const result = await action(form);
          if (result?.error) {
            setError(visibleActionError(result.error));
            return;
          }
          key.current = null;
          if (reset) {
            allowReset.current = true;
            formRef.current?.reset();
            allowReset.current = false;
          }
          router.refresh();
          onSuccess?.();
        } catch (e) {
          if (e instanceof Error && e.message.includes("NEXT_REDIRECT"))
            throw e;
          setError(actionFailure);
        }
      }}
    >
      {children}
      {error ? (
        <p
          role="alert"
          className="col-span-full rounded border border-red-500/40 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
