import type { AuditLog } from "@/lib/audit";
import { auditDetail } from "@/lib/audit-display";

export function AuditDetail({ log }: { log: AuditLog }) {
  const { details, changes } = auditDetail(log);
  return (
    <details className="audit-detail min-w-48 max-w-lg">
      <summary className="cursor-pointer text-[var(--accent)]">Bax</summary>
      <dl className="my-3 grid gap-2 text-xs">
        {details.map((row, i) => (
          <div key={`${row.label}-${i}`} className="break-words">
            <dt className="text-[var(--muted)]">{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {changes.length ? (
        <div className="my-3 text-xs">
          <h3 className="mb-2 font-semibold">Dəyişikliklər</h3>
          <ul className="grid gap-2">
            {changes.map((row) => (
              <li key={row.label} className="break-words">
                <strong>{row.label}: </strong>
                {row.before === null && row.after === null ? (
                  "Dəyişdirilib; əvvəlki və yeni dəyərlər saxlanmayıb."
                ) : (
                  <>
                    {row.before} → {row.after}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}
