import Link from "next/link";
import { Filter, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { PageHeader, StatusBadge } from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { FilterForm } from "@/components/filter-form";
import {
  auditActions,
  auditDescription,
  auditEntities,
  auditQuery,
  getAudit,
} from "@/lib/audit";
import { formatReportDateTime } from "@/lib/reports/report-format";
import type { SearchParams } from "@/lib/filters";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { logs, total, filters: f } = await getAudit(await searchParams);
  const select = (
    name: "actor" | "role" | "action" | "entity",
    label: string,
    values: readonly string[],
  ) => (
    <label className="text-xs text-[var(--muted)]">
      {label}
      <select className="field mt-1" name={name} defaultValue={f[name]}>
        <option value="">Hamısı</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <PageHeader
        title="Audit jurnalı"
        eyebrow="Əməliyyat tarixçəsi"
        actions={<ReportActions report="audit" query={auditQuery(f)} />}
      />
      <FilterForm>
        <label className="text-xs text-[var(--muted)]">
          Başlanğıc
          <input
            className="field mt-1"
            type="date"
            name="from"
            defaultValue={f.from}
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Son
          <input
            className="field mt-1"
            type="date"
            name="to"
            defaultValue={f.to}
          />
        </label>
        {select("actor", "İstifadəçi", ["admin", "kassa", "qeydiyyat"])}
        {select("role", "Rol", ["ADMIN", "CASHIER", "INTAKE"])}
        {select("action", "Əməliyyat", auditActions)}
        {select("entity", "Obyekt", auditEntities)}
        <label className="text-xs text-[var(--muted)]">
          Avtomobil
          <input
            className="field mt-1"
            name="plate"
            defaultValue={f.plate}
            maxLength={9}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="financial"
            value="1"
            defaultChecked={f.financial}
          />
          Yalnız maliyyə
        </label>
        <div className="flex gap-2">
          <button className="btn btn-primary">
            <Filter size={16} />
            Tətbiq et
          </button>
          <Link
            href="/audit"
            className="btn btn-secondary btn-icon"
            title="Filtrləri sıfırla"
            aria-label="Filtrləri sıfırla"
          >
            <RotateCcw size={16} />
          </Link>
        </div>
      </FilterForm>
      <p className="my-4 text-sm text-[var(--muted)]">
        {total} qeyd · Səhifə {f.page} / {Math.max(1, Math.ceil(total / 50))}
      </p>
      <div
        className="table-scroll"
        role="region"
        aria-label="Audit jurnalı"
        tabIndex={0}
      >
        <table className="data-table w-full min-w-[950px] text-left text-sm">
          <thead>
            <tr>
              {[
                "Tarix/saat",
                "İstifadəçi / rol",
                "Əməliyyat",
                "Obyekt",
                "Avtomobil",
                "Təfərrüat",
              ].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap">
                  {formatReportDateTime(log.created_at)}
                </td>
                <td>
                  {log.actor_username_snapshot}
                  <p className="text-xs text-[var(--muted)]">
                    {log.actor_role_snapshot}
                  </p>
                </td>
                <td>
                  <p className="mb-2 max-w-80">{auditDescription(log)}</p>
                  <StatusBadge
                    tone={
                      log.action.includes("VOID") ||
                      log.action.includes("REVERSED")
                        ? "danger"
                        : log.action.includes("PAYMENT")
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {log.action}
                  </StatusBadge>
                </td>
                <td>{log.entity_type}</td>
                <td>
                  {log.service_job_id ? (
                    <Link
                      className="text-[var(--accent)]"
                      href={`/vehicles/${log.service_job_id}`}
                    >
                      {log.plate || "Servis kartı"}
                    </Link>
                  ) : (
                    log.plate || "-"
                  )}
                </td>
                <td>
                  <details>
                    <summary className="cursor-pointer">Bax</summary>
                    <p className="my-2 break-all">{log.entity_id}</p>
                    <pre className="max-w-96 whitespace-pre-wrap break-words text-xs">
                      {JSON.stringify(
                        { changes: log.changes, metadata: log.metadata },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!logs.length ? (
        <p className="py-6 text-[var(--muted)]">Uyğun qeyd yoxdur.</p>
      ) : null}
      <nav
        aria-label="Audit səhifələri"
        className="mt-6 flex justify-end gap-2"
      >
        {f.page > 1 ? (
          <Link
            className="btn btn-secondary btn-icon"
            title="Əvvəlki səhifə"
            aria-label="Əvvəlki səhifə"
            href={`/audit?${auditQuery(f, f.page - 1)}`}
          >
            <ChevronLeft size={16} />
          </Link>
        ) : null}
        {f.page * 50 < total ? (
          <Link
            className="btn btn-secondary btn-icon"
            title="Növbəti səhifə"
            aria-label="Növbəti səhifə"
            href={`/audit?${auditQuery(f, f.page + 1)}`}
          >
            <ChevronRight size={16} />
          </Link>
        ) : null}
      </nav>
    </>
  );
}
