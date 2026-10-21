"use client";
import { useEffect, useRef, useState } from "react";
import { FormDraft, captureDraft, restoreDraftFields, useFormDraft } from "@/components/form-draft";
import { useRouter } from "next/navigation";
import { actionFailure, visibleActionError } from "@/lib/action-errors";
export function ActionForm({
  draftKey,
  ...props
}: React.ComponentProps<typeof ActionFormInner> & { draftKey?: string }) {
  return draftKey ? <FormDraft id={draftKey}><ActionFormInner {...props} /></FormDraft> : <ActionFormInner {...props} />;
}
function ActionFormInner({
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
  const draft = useFormDraft();
  const submitting = useRef(false);
  useEffect(() => {
    if (draft && formRef.current) {
      key.current = draft.draft.key;
      restoreDraftFields(formRef.current, draft);
    }
  }, [draft]);
  return (
    <form
      ref={formRef}
      className={className}
      onChange={() => { if (draft && formRef.current) captureDraft(formRef.current, draft); }}
      onInput={() => { if (draft && formRef.current) captureDraft(formRef.current, draft); }}
      onReset={(event) => {
        if (!allowReset.current) event.preventDefault();
      }}
      action={async (form) => {
        if (submitting.current) return;
        submitting.current = true;
        draft?.setPending(true);
        setError("");
        key.current ??= crypto.randomUUID();
        draft?.persist();
        form.set("idempotency_key", key.current);
        try {
          const result = await action(form);
          if (result?.error) {
            setError(visibleActionError(result.error));
            return;
          }
          key.current = null;
          draft?.complete();
          if (reset) {
            allowReset.current = true;
            formRef.current?.reset();
            allowReset.current = false;
          }
          router.refresh();
          onSuccess?.();
        } catch (e) {
          if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) {
            draft?.complete();
            throw e;
          }
          setError(actionFailure);
        } finally {
          submitting.current = false;
          draft?.setPending(false);
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
