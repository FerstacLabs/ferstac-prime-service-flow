"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { actionFailure } from "@/lib/action-errors";
export function ReconciliationUpload({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        const file = new FormData(e.currentTarget).get("file");
        if (!(file instanceof File) || !file.size) return;
        setBusy(true);
        setError("");
        try {
          const response = await fetch(`/api/reconciliations/${id}/signed`, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          });
          const result = await response.json();
          if (!response.ok) setError(result.error || actionFailure);
          else router.refresh();
        } catch {
          setError(actionFailure);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="min-w-0 text-sm">
        İmzalı PDF
        <input
          className="field mt-1 w-full min-w-0"
          name="file"
          type="file"
          accept="application/pdf"
          required
          disabled={busy}
        />
      </label>
      <button className="btn btn-primary self-end" disabled={busy}>
        <Upload size={16} aria-hidden />
        {busy ? "Yüklənir..." : "İmzalı sənədi yüklə"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-400 sm:col-span-2">
          {error}
        </p>
      ) : null}
    </form>
  );
}
