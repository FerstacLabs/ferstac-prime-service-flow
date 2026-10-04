import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Printer, FileCheck, GitBranch } from "lucide-react";
import { getReconciliation } from "@/lib/supabase/reconciliation";
import { reconciliationStatus } from "@/lib/reconciliation";
import { PageHeader } from "@/components/app-shell";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ReconciliationUpload } from "@/components/reconciliation-upload";
import { ReconciliationTables } from "@/components/reconciliation-tables";
import {
  confirmReconciliationAction,
  saveReconciliationAction,
} from "@/app/actions/reconciliation";
import { formatDate } from "@/lib/format";
export const dynamic = "force-dynamic";
export default async function ReconciliationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const d = await getReconciliation((await params).id, true);
  if (!d) notFound();
  return (
    <>
      <PageHeader
        title={d.document_number}
        eyebrow={`${d.entity_name_snapshot} · ${formatDate(d.period_from)} - ${formatDate(d.period_to)}`}
      />
      <Link
        className="text-sm text-[var(--accent)]"
        href={`/kassa?view=workers&reportType=${d.entity_type}&${d.entity_type}=${d.entity_id}&from=${d.period_from}&to=${d.period_to}`}
      >
        Hesablaşma tarixçəsi
      </Link>
      <section className="my-5 flex flex-wrap items-center gap-3 border-b border-[var(--border)] pb-5">
        <span>
          {reconciliationStatus(d)} · v{d.version}
        </span>
        <a
          className="btn btn-secondary"
          href={`/api/reconciliations/${d.id}/pdf`}
        >
          <FileDown size={16} />
          PDF
        </a>
        <a
          className="btn btn-secondary"
          href={`/reconciliations/${d.id}/print`}
          target="_blank"
          rel="noreferrer"
        >
          <Printer size={16} />
          Çap
        </a>
        {d.signed_file_path ? (
          <a
            className="btn btn-secondary"
            href={`/api/reconciliations/${d.id}/signed`}
          >
            <FileCheck size={16} />
            İmzalı sənəd
          </a>
        ) : null}
        <ActionForm action={saveReconciliationAction}>
          <input type="hidden" name="previous" value={d.id} />
          <SubmitButton>
            <GitBranch size={16} />
            Yeni versiya
          </SubmitButton>
        </ActionForm>
      </section>
      {d.outdated ? (
        <p
          role="status"
          className="mb-5 border-l-2 border-amber-400 pl-3 text-amber-300"
        >
          Yenilənmə tələb olunur. Dövrün məlumatları dəyişib; saxlanmış sənəd
          dəyişməyib.
        </p>
      ) : null}
      <dl className="my-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {d.report_snapshot?.summary.map((s) => (
          <div key={s.label}>
            <dt className="text-sm text-[var(--muted)]">{s.label}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      {d.status === "DRAFT" && !d.outdated ? (
        <section className="my-6 space-y-5 border-y border-[var(--border)] py-5">
          <ReconciliationUpload id={d.id} />
          {d.signed_file_path && !d.outdated ? (
            <ActionForm
              action={confirmReconciliationAction}
              className="space-y-3"
            >
              <input type="hidden" name="id" value={d.id} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" required />
                İmzalı sənədi yoxladım və hesablaşmanı təsdiqləyirəm.
              </label>
              <SubmitButton>Təsdiqlə</SubmitButton>
            </ActionForm>
          ) : null}
        </section>
      ) : d.status === "CONFIRMED" ? (
        <p className="my-4 text-sm text-[var(--muted)]">
          Təsdiqlənib: {d.confirmed_at ? formatDate(d.confirmed_at) : "-"}
        </p>
      ) : null}
      {d.report_snapshot ? (
        <ReconciliationTables report={d.report_snapshot} />
      ) : null}
    </>
  );
}
