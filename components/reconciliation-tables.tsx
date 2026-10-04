import type { PrimeReport } from "@/lib/reports/report-types";
export function ReconciliationTables({ report }: { report: PrimeReport }) {
  return report.sections
    .filter((s) => s.table)
    .map((s, index) => (
      <section key={index} className="my-6">
        <h3 className="mb-3 text-base font-semibold">{s.title}</h3>
        {s.table!.rows.length ? (
          <div className="table-scroll">
            <table className="data-table w-full min-w-[1000px] text-sm">
              <thead>
                <tr>
                  {s.table!.columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.table!.rows.map((r) => (
                  <tr key={r.id}>
                    {s.table!.columns.map((c) => (
                      <td className="max-w-64 break-words" key={c.key}>
                        {r.cells[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Bu dövr üzrə əməliyyat yoxdur.
          </p>
        )}
      </section>
    ));
}
