import {
  selectWorkerFinances,
  workerWorkFinance,
  workerPaymentHistory,
} from "@/lib/worker-finance";
import { workerDisplayName, workTitle } from "@/lib/supabase/queries";
import { sumMoney } from "@/lib/workshop";
import {
  formatReportMoney as money,
  formatReportDate as date,
  reportWorkStatusLabels,
} from "@/lib/reports/report-format";
import type { WorkshopData } from "@/lib/supabase/workshop";
import type { WorkshopFilters } from "@/lib/filters";
import type { PrimeReport, ReportTable } from "@/lib/reports/report-types";

// Explicit line breaks also work with the PDF font's no-hyphenation policy.
const wrapReference = (value?: string | null) =>
  value?.replace(/(.{16})(?=.)/g, "$1\n");

function table(
  labels: string[],
  widths: number[],
  rows: { id: string; values: string[] }[],
  numeric: number[],
): ReportTable {
  return {
    columns: labels.map((label, i) => ({
      key: String(i),
      label,
      width: widths[i],
      align: numeric.includes(i) ? "right" : "left",
    })),
    rows: rows.map((r) => ({
      id: r.id,
      cells: Object.fromEntries(
        r.values.map((v, i) => [
          String(i),
          numeric.includes(i) ? v.replace(/ AZN$/, "") : v,
        ]),
      ),
    })),
  };
}
export function workerReport(
  report: PrimeReport,
  data: WorkshopData,
  f: WorkshopFilters,
): PrimeReport {
  const rows = selectWorkerFinances(data, f),
    individual =
      !!f.worker && (f.detail === "worker" || report.scope === "kassa"),
    n = rows[0];
  const metrics = [
    [
      individual ? "İş sayı" : "İşçi sayı",
      String(individual ? (n?.items.length ?? 0) : rows.length),
    ],
    ...(!individual
      ? [
          [
            "Aktiv işçi sayı",
            String(
              rows.filter((r) => r.worker.active && !r.worker.deleted_at)
                .length,
            ),
          ],
        ]
      : []),
    ["Tamamlanıb", String(rows.reduce((s, r) => s + r.done.length, 0))],
    ["Aktiv işlər", String(rows.reduce((s, r) => s + r.active.length, 0))],
    ["Qazanılmış", money(sumMoney(rows.map((r) => r.earned)))],
    ["Ödənilib", money(sumMoney(rows.map((r) => r.paid)))],
    ["Avans", money(sumMoney(rows.map((r) => r.advance)))],
    ["Qalıq borc", money(sumMoney(rows.map((r) => r.outstanding)))],
  ];
  report.title =
    individual && n
      ? `İşçi - ${workerDisplayName(n.worker)}`
      : "İşçilər üzrə ümumi hesabat";
  report.summary = metrics.map(([label, value]) => ({ label, value }));
  report.subtitle =
    "Ödənilib: seçilmiş işlərə tətbiq edilmiş məbləğ. Avans: aktiv iş avansı və bölüşdürülməmiş ümumi avans.";
  const missing = rows.reduce((sum, row) => sum + row.missing, 0);
  if (missing)
    report.subtitle += ` ${missing} işdə maya məlumatı natamamdır; yekun məbləğlər qisməndir.`;
  if (!individual) {
    report.orientation = "landscape";
    report.sections = [
      {
        title: "İşçilər",
        table: table(
          [
            "İşçi",
            "İxtisas / rol",
            "Status",
            "İş sayı",
            "Tamamlanıb",
            "Aktiv",
            "Qazanılmış",
            "Ödənilib",
            "Avans",
            "Qalıq borc",
          ],
          [16, 12, 8, 6, 8, 6, 11, 11, 11, 11],
          rows.map((r) => ({
            id: r.worker.id,
            values: [
              workerDisplayName(r.worker),
              r.worker.worker_roles?.name || "-",
              r.worker.active ? "Aktiv" : "Arxiv",
              String(r.items.length),
              String(r.done.length),
              String(r.active.length),
              money(r.earned),
              money(r.paid),
              money(r.advance),
              money(r.outstanding),
            ],
          })),
          [3, 4, 5, 6, 7, 8, 9],
        ),
      },
    ];
    return report;
  }
  if (!n) {
    report.sections = [];
    return report;
  }
  report.sections = [
    {
      title: `${n.worker.worker_roles?.name || "İşçi"} · ${n.worker.active ? "Aktiv" : "Arxiv"}`,
      fields: [
        { label: "Telefon", value: n.worker.phone || "-" },
        { label: "İşə başlama", value: date(n.worker.hire_date) || "-" },
        ...(n.worker.notes ? [{ label: "Qeyd", value: n.worker.notes }] : []),
      ],
    },
    {
      title: "İşlər",
      table: table(
        [
          "Avtomobil",
          "İş",
          "Status",
          "Hesablama",
          "Qazanılmış",
          "Ödənilib",
          "Qalıq",
          "Plan / tamamlanma",
        ],
        [12, 20, 12, 10, 11, 11, 11, 13],
        n.items.map((w) => {
          const v = workerWorkFinance(w, data.cash);
          return {
            id: w.id,
            values: [
              data.jobs.find((j) => j.id === w.service_job_id)?.vehicles
                ?.plate || "-",
              workTitle(w),
              reportWorkStatusLabels[w.status],
              w.compensation_mode === "PERCENTAGE" ? "Faizli" : "Sabit",
              v.known ? money(v.earned) : "Maya natamamdır",
              money(v.paid),
              money(v.outstanding),
              `${date(w.planned_at) || "-"} / ${date(w.completed_at) || "-"}`,
            ],
          };
        }),
        [4, 5, 6],
      ),
    },
  ];
  const history = workerPaymentHistory(data, n.items).map(
    ({ payment: t, item, job }) => ({
      id: t.id,
      values: [
        date(t.transaction_date),
        `${job?.vehicles?.plate || "-"} · ${workTitle(item)}`,
        t.voided_at
          ? "Ləğv edilib"
          : t.counterparty_details?.payment_kind === "WORKER_ADVANCE"
            ? "Usta avansı"
            : "Usta ödənişi",
        t.counterparty_details?.payment_kind === "WORKER_ADVANCE"
          ? "-"
          : money(t.amount),
        t.counterparty_details?.payment_kind === "WORKER_ADVANCE"
          ? money(t.amount)
          : "-",
        [wrapReference(t.reference_number), t.notes, t.void_reason]
          .filter(Boolean)
          .join(" · ") || "-",
      ],
    }),
  );
  for (const t of data.cash.filter(
    (t) =>
      t.allocation_type === "GENERAL_OUT" &&
      t.worker_identity_id === n.worker.id,
  ))
    history.push({
      id: t.id,
      values: [
        date(t.transaction_date),
        "Ümumi avans",
        t.voided_at ? "Ləğv edilib" : "Usta avansı",
        "-",
        money(t.amount),
        [wrapReference(t.reference_number), t.notes, t.void_reason]
          .filter(Boolean)
          .join(" · ") || "-",
      ],
    });
  report.sections.push({
    title: "Ödəniş tarixçəsi",
    table: table(
      [
        "Tarix",
        "Avtomobil / İş",
        "Təyinat",
        "Ödəniş",
        "Avans",
        "Qeyd / Reference",
      ],
      [12, 26, 15, 11, 11, 25],
      history,
      [3, 4],
    ),
  });
  return report;
}
