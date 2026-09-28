"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { removeServiceRowAction } from "@/app/actions/vehicles";

export function RemoveServiceRow({
  job,
  id,
  kind,
}: {
  job: string;
  id: string;
  kind: "work" | "part";
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="pb-4">
      <button
        type="button"
        className="btn btn-secondary"
        title="Servis kartından sil"
        aria-label="Servis kartından sil"
        onClick={() => setConfirm(!confirm)}
      >
        <Trash2 size={16} />
      </button>
      {confirm && (
        <ActionForm
          action={removeServiceRowAction}
          onSuccess={() => setConfirm(false)}
          className="mt-3 flex flex-wrap items-center gap-3"
        >
          <input type="hidden" name="service_job_id" value={job} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="kind" value={kind} />
          <p className="w-full text-sm">
            Bu {kind === "work" ? "işi" : "detalı"} servis kartından silmək
            istəyirsiniz?
          </p>
          <SubmitButton variant="danger" pendingText="Silinir...">
            Sil
          </SubmitButton>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirm(false)}
          >
            İmtina
          </button>
        </ActionForm>
      )}
    </div>
  );
}
