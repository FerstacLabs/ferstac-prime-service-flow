import Link from "next/link";
import { FileDown, FileCheck } from "lucide-react";
import { requireAccess } from "@/lib/supabase/auth";
import {
  reconciliationStatus,
  type ReconciliationListItem,
} from "@/lib/reconciliation";
import { journalFilters } from "@/lib/finance";
import type { SearchParams } from "@/lib/filters";
import { formatDate } from "@/lib/format";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { saveReconciliationAction } from "@/app/actions/reconciliation";

export async function ReconciliationHistory({
  params,
}: {
  params: SearchParams;
}) {
  const { supabase } = await requireAccess(["ADMIN", "CASHIER"]);
  const f = journalFilters(params);
  const type = f.reportType === "supplier" ? "supplier" : "worker";
  const entity = type === "supplier" ? f.supplier : f.worker;
  const page = Math.floor(
    Math.max(0, Math.min(100000, Number(params.historyPage) || 0)),
  );
  let query = supabase
    .from("reconciliation_documents")
    .select(
      "id,organization_id,document_number,entity_type,entity_id,entity_name_snapshot,period_from,period_to,service_job_id,totals_snapshot,status,created_at,confirmed_at,signed_file_path,version,supersedes_document_id,superseded_by,outdated",
      { count: "exact" },
    )
    .eq("entity_type", type)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 30, page * 30 + 29);
  if (entity) query = query.eq("entity_id", entity);
  if (f.from) query = query.gte("period_to", f.from);
  if (f.to) query = query.lte("period_from", f.to);
  if (f.job) query = query.eq("service_job_id", f.job);
  const status =
    typeof params.documentStatus === "string" ? params.documentStatus : "";
  if (["DRAFT", "CONFIRMED"].includes(status))
    query = query.eq("status", status);
  const number =
    typeof params.documentNumber === "string"
      ? params.documentNumber.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40)
      : "";
  if (number) query = query.ilike("document_number", `%${number}%`);
  const { data, error, count } = await query;
  if (error)
    return (
      <p role="alert" className="my-4 text-amber-300">
        Hesablaşma arxivi müvəqqəti əlçatan deyil. Yenidən cəhd edin.
      </p>
    );
  const documents = (data ?? []) as ReconciliationListItem[];
  // Check exact scope independently from history pagination and status/number filters.
  const exactScope = () =>
    supabase
      .from("reconciliation_documents")
      .select(
        "id,status,version,document_number,signed_file_path,outdated,confirmed_at,confirmed_by_name",
      )
      .eq("entity_type", type)
      .eq("entity_id", entity)
      .eq("period_from", f.from)
      .eq("period_to", f.to)
      .is("superseded_by", null)
      [f.job ? "eq" : "is"]("service_job_id", f.job || null)
      .order("version", { ascending: false })
      .limit(1);
  const [{ data: latest }, { data: confirmed }] =
    entity && f.from && f.to
      ? await Promise.all([
          exactScope().maybeSingle(),
          exactScope().eq("status", "CONFIRMED").maybeSingle(),
        ])
      : [{ data: null }, { data: null }];
  const existing = confirmed || latest;
  const href = (p: number) =>
    "/kassa?" +
    new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(params).filter(([, v]) => typeof v === "string") as [
          string,
          string,
        ][],
      ),
      historyPage: String(p),
    });
  return (
    <section className="my-6 border-y border-[var(--border)] py-5">
      {existing ? (
        <div
          role="status"
          className="mb-5 flex flex-wrap items-center gap-3 border-l-2 border-amber-400 pl-3"
        >
          <span>
            Bu dövr üçün{" "}
            {existing.status === "CONFIRMED"
              ? "təsdiqlənmiş hesablaşma sənədi"
              : "sənəd"}{" "}
            mövcuddur: {existing.document_number} · v{existing.version}
            {existing.confirmed_at
              ? ` · ${formatDate(existing.confirmed_at)} · ${existing.confirmed_by_name ?? "PRIME"}`
              : ""}
          </span>
          <Link
            className="btn btn-secondary"
            href={`/kassa/reconciliations/${existing.id}`}
          >
            Aç
          </Link>
          <a
            className="btn btn-secondary"
            href={`/api/reconciliations/${existing.id}/pdf`}
          >
            PDF
          </a>
          {existing.signed_file_path ? (
            <a
              className="btn btn-secondary"
              href={`/api/reconciliations/${existing.id}/signed`}
            >
              İmzalı sənəd
            </a>
          ) : null}
        </div>
      ) : null}
      {entity && f.from && f.to ? (
        <ActionForm
          action={saveReconciliationAction}
          className="mb-5 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="entity_type" value={type} />
          <input type="hidden" name="entity_id" value={entity} />
          <input type="hidden" name="from" value={f.from} />
          <input type="hidden" name="to" value={f.to} />
          <input type="hidden" name="job" value={f.job} />
          {latest ? (
            <input type="hidden" name="previous" value={latest.id} />
          ) : null}
          <label className="text-sm">
            Qeyd
            <input className="field mt-1" name="note" maxLength={1000} />
          </label>
          <SubmitButton>
            {latest ? "Yeni versiya yarat" : "Hesablaşmanı yadda saxla"}
          </SubmitButton>
        </ActionForm>
      ) : (
        <p className="mb-4 text-sm text-[var(--muted)]">
          Sənədi saxlamaq üçün tərəfi, başlanğıc və son tarixi seçin.
        </p>
      )}
      <h2 className="mb-3 text-base font-semibold">Hesablaşma tarixçəsi</h2>
      <form className="mb-4 flex flex-wrap items-end gap-3">
        {Object.entries({
          view: "workers",
          reportType: type,
          [type]: entity,
          from: f.from,
          to: f.to,
          job: f.job,
        }).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="text-sm">
          Sənəd №
          <input
            className="field mt-1"
            name="documentNumber"
            defaultValue={number}
            maxLength={40}
          />
        </label>
        <label className="text-sm">
          Status
          <select
            className="field mt-1"
            name="documentStatus"
            defaultValue={status}
          >
            <option value="">Hamısı</option>
            <option value="DRAFT">Qaralama</option>
            <option value="CONFIRMED">Təsdiqlənib</option>
          </select>
        </label>
        <button className="btn btn-secondary">Axtar</button>
      </form>
      {documents.length ? (
        <div className="table-scroll">
          <table className="data-table w-full min-w-[980px] text-sm">
            <thead>
              <tr>
                {[
                  "Sənəd №",
                  "Tərəf",
                  "Növ",
                  "Dövr",
                  "Son qalıq",
                  "Status",
                  "Yaradılıb",
                  "Təsdiqlənib",
                  "Versiya",
                  "Sənədlər",
                ].map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link
                      className="text-[var(--accent)]"
                      href={`/kassa/reconciliations/${d.id}`}
                    >
                      {d.document_number}
                    </Link>
                  </td>
                  <td>{d.entity_name_snapshot}</td>
                  <td>{d.entity_type === "worker" ? "İşçi" : "Təchizatçı"}</td>
                  <td>
                    {formatDate(d.period_from)} - {formatDate(d.period_to)}
                  </td>
                  <td>
                    {d.totals_snapshot?.find((s) =>
                      /son.*qalıq borc/i.test(s.label),
                    )?.value ?? "-"}
                  </td>
                  <td>{reconciliationStatus(d)}</td>
                  <td>{formatDate(d.created_at)}</td>
                  <td>{d.confirmed_at ? formatDate(d.confirmed_at) : "-"}</td>
                  <td>{d.version}</td>
                  <td>
                    <div className="flex gap-2">
                      <a
                        className="btn btn-secondary"
                        title="PDF"
                        aria-label="PDF"
                        href={`/api/reconciliations/${d.id}/pdf`}
                      >
                        <FileDown size={16} />
                      </a>
                      {d.signed_file_path ? (
                        <a
                          className="btn btn-secondary"
                          title="İmzalı sənəd"
                          aria-label="İmzalı sənəd"
                          href={`/api/reconciliations/${d.id}/signed`}
                        >
                          <FileCheck size={16} />
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Bu seçim üzrə hesablaşma sənədi yoxdur.
        </p>
      )}
      <div className="mt-3 flex gap-3">
        {page > 0 ? <Link href={href(page - 1)}>Əvvəlki</Link> : null}
        {(count ?? 0) > (page + 1) * 30 ? (
          <Link href={href(page + 1)}>Növbəti</Link>
        ) : null}
      </div>
    </section>
  );
}
