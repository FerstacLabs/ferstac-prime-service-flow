import type { PrimeReport, ReportField, ReportSection, ReportTable } from "@/lib/reports/report-types";
import { PrintButton, PrintTrigger } from "@/components/reports/print-trigger";

export function PrintReport({ report }: { report: PrimeReport }) {
  return (
    <main className="print-report">
      <PrintTrigger />
      <header className="print-report-header">
        <div>
          <div className="print-report-brand">PRIME Tuning & Detailing</div>
          <h1>{report.title}</h1>
          <p>Yaradılma tarixi: {report.generatedAt} | Valyuta: AZN</p>
        </div>
        <PrintButton />
      </header>

      <Summary items={report.summary} />
      {report.sections.map((section) => <Section key={section.title} section={section} />)}
      <footer className="print-report-footer">PRIME Tuning & Detailing | PRIME Flow</footer>
    </main>
  );
}

function Summary({ items = [] }: { items?: Array<{ label: string; value: string }> }) {
  if (!items.length) return null;
  return (
    <div className="print-summary">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="print-summary-item">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function Section({ section }: { section: ReportSection }) {
  return (
    <section className="print-section">
      <h2>{section.title}</h2>
      <Summary items={section.summary} />
      {section.fields?.length ? <Fields fields={section.fields} /> : null}
      {section.table ? <Table table={section.table} /> : null}
    </section>
  );
}

function Fields({ fields }: { fields: ReportField[] }) {
  return (
    <dl className="print-fields">
      {fields.map((field) => (
        <div key={field.label}>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ table }: { table: ReportTable }) {
  if (!table.rows.length) return <div className="print-empty">Məlumat yoxdur.</div>;
  return (
    <table className="print-table">
      <thead>
        <tr>{table.columns.map((column) => <th key={column.key} style={{ width: `${column.width ?? 10}%` }}>{column.label}</th>)}</tr>
      </thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={row.id}>
            {table.columns.map((column, index) => (
              <td key={column.key} data-label={column.label} className={index === 0 ? "print-primary-cell" : undefined}>
                {row.cells[column.key] || "-"}
                {index === 0 && row.details?.length ? (
                  <div className="print-row-details">
                    {row.details.map((detail) => <span key={detail.label}>{detail.label}: {detail.value}</span>)}
                  </div>
                ) : null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
