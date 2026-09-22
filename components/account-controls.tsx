"use client";
import { useActionState, useState } from "react";
import { KeyRound, LockKeyhole, LockKeyholeOpen, X } from "lucide-react";
import { manageAccountAction } from "@/app/actions/security";
import { SubmitButton } from "@/components/submit-button";

export function AccountControls({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const [state, action, pending] = useActionState(manageAccountAction, {});
  const [dismissed, setDismissed] = useState<string>();
  return (
    <div className="mt-4 space-y-3">
      <form
        action={action}
        onSubmit={(e) => {
          if (!window.confirm("Hesabın girişini dəyişmək istəyirsiniz?"))
            e.preventDefault();
        }}
        className="flex flex-wrap gap-2"
      >
        <input type="hidden" name="target" value={id} />
        <SubmitButton
          name="operation"
          value={active ? "disable" : "enable"}
          variant="secondary"
          disabled={pending}
        >
          {active ? <LockKeyhole size={16} /> : <LockKeyholeOpen size={16} />}
          {active ? "Deaktiv et" : "Aktiv et"}
        </SubmitButton>
        <SubmitButton
          name="operation"
          value="reset"
          variant="secondary"
          disabled={pending}
        >
          <KeyRound size={16} />
          Müvəqqəti şifrə
        </SubmitButton>
      </form>
      {state.error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm text-[var(--success)]">
          {state.success}
        </p>
      ) : null}
      {state.password && dismissed !== state.password ? (
        <div
          role="status"
          className="flex items-start justify-between gap-3 border-l-2 border-[var(--accent)] pl-3"
        >
          <div className="min-w-0">
            <p className="text-sm">Yeni müvəqqəti şifrə</p>
            <output className="select-all break-all font-mono">
              {state.password}
            </output>
          </div>
          <button
            className="btn btn-secondary btn-icon"
            title="Şifrəni gizlət"
            aria-label="Şifrəni gizlət"
            onClick={() => setDismissed(state.password)}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
