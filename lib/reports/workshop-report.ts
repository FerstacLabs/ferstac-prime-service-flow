import {
  getWorkshop,
  selectJobs,
  selectWork,
  selectCash,
  type WorkshopData,
} from "@/lib/supabase/workshop";
import {
  workTitle,
  partTitle,
  workerDisplayName,
  supplierDisplayName,
  type DbServiceJob,
} from "@/lib/supabase/queries";
import { parseFilters, type WorkshopFilters } from "@/lib/filters";
import {
  jobFinance,
  cashFlow,
  purchaseCost,
  costKnown,
  sumMoney,
  subtractMoney,
  allocationLabels,
  missingValue,
  missingCostDescription,
  canGenerateHandover,
} from "@/lib/workshop";
import {
  selectWorkerFinances,
  workerWorkFinance,
  workerPaymentHistory,
} from "@/lib/worker-finance";
import {
  formatReportMoney as money,
  formatReportDate as date,
  formatReportDateTime,
  reportWorkStatusLabels,
  reportJobStatusLabels,
  reportFundingLabels,
  reportPaymentLabels,
} from "@/lib/reports/report-format";
import { handoverReport } from "@/lib/reports/handover";
import { customerQuotation } from "@/lib/reports/customer-quotation";
import { purchaseReport } from "@/lib/reports/purchase-report";
import { formatQuantity } from "@/lib/decimal";
import { requireAccess } from "@/lib/supabase/auth";
import { loadFinanceReport } from "@/lib/reports/finance-report";
import { appRoles, canReport } from "@/lib/security";
import type {
  PrimeReport,
  ReportScope,
  ReportSection,
  ReportTable,
} from "@/lib/reports/report-types";
const value = (n: number | null | undefined) =>
  n == null ? missingValue : money(n);
const missingCostFields = (n: {
  missingWork: number;
  missingParts: number;
}): Array<[string, string]> => {
  const description = missingCostDescription(n);
  return description ? [["Maya daxil edilməyib", description]] : [];
};
const pairs = (entries: Array<[string, string]>) =>
  entries.map(([label, value]) => ({ label, value }));
const table = (
  labels: string[],
  rows: Array<{
    id: string;
    values: string[];
    details?: Array<[string, string]>;
  }>,
): ReportTable => ({
  columns: labels.map((label, i) => ({
    key: String(i),
    label,
    width: 100 / labels.length,
  })),
  rows: rows.map((r) => ({
    id: r.id,
    cells: Object.fromEntries(r.values.map((v, i) => [String(i), v])),
    details: r.details ? pairs(r.details) : undefined,
  })),
});
export async function loadWorkshopReport(
  scope: ReportScope,
  f = parseFilters({}),
) {
  const { profile } = await requireAccess(
    appRoles.filter((role) => canReport(role, scope)),
  );
  if (
    scope === "kassa" ||
    scope === "finance" ||
    (scope === "workers" && profile.role === "CASHIER")
  )
    return loadFinanceReport({
      from: f.from,
      to: f.to,
      job: f.job,
      worker: f.worker,
      supplier: f.supplier,
    });
  const data = await getWorkshop(f.job || undefined);
  if (
    (scope === "quotation" || scope === "handover" || scope === "vehicle") &&
    !data.jobs.some((j) => j.id === f.job)
  )
    return null;
  if (
    scope === "handover" &&
    !data.jobs.some((j) => j.id === f.job && canGenerateHandover(j.status))
  )
    return null;
  if (scope === "vehicle") {
    const finance = await loadFinanceReport({
      from: f.from,
      to: f.to,
      job: f.job,
    });
    if (!finance) return null;
    const job = data.jobs.find((j) => j.id === f.job)!;
    const n = jobFinance(job, data.work, data.parts, data.purchases, data.cash);
    finance.title = "Servis kartı maliyyə hesabatı";
    finance.summary = pairs([
      ["Müştəri yekun məbləği", money(n.quotedTotal)],
      ["Məlum ümumi maya", money(n.totalCost)],
      ["Brüt mənfəət", value(n.grossProfit)],
      ["Müştəridən alınıb", money(n.customerPaid)],
    ]);
    return finance;
  }
  const report = buildWorkshopReport(scope, data, f);
  if (scope === "workers") {
    const finance = await loadFinanceReport({
      from: f.from,
      to: f.to,
      job: f.job,
      worker: f.worker,
      supplier: f.supplier,
    });
    if (finance) report.sections.push(...finance.sections);
  }
  return report;
}
function filterText(f: WorkshopFilters, data: WorkshopData) {
  const entries: Array<[string, string | undefined]> = [
    ["Nömrə", f.plate],
    ["Avtomobil", data.jobs.find((j) => j.id === f.job)?.vehicles?.plate],
    [
      "Usta",
      f.worker
        ? workerDisplayName(data.workers.find((w) => w.id === f.worker))
        : undefined,
    ],
    [
      "Təchizatçı",
      f.supplier
        ? supplierDisplayName(data.suppliers.find((s) => s.id === f.supplier))
        : undefined,
    ],
    [
      "İş",
      data.work.find((w) => w.work_catalog_id === f.work)?.work_catalog?.name,
    ],
    [
      "Status",
      (reportWorkStatusLabels as Record<string, string>)[f.status] ||
        (reportJobStatusLabels as Record<string, string>)[f.status],
    ],
    ["Mənbə", (reportFundingLabels as Record<string, string>)[f.source]],
    ["Ödəniş", (reportPaymentLabels as Record<string, string>)[f.payment]],
    ["Başlanğıc", date(f.from)],
    ["Son", date(f.to)],
    [
      "İstiqamət",
      f.direction === "IN" ? "Mədaxil" : f.direction === "OUT" ? "Məxaric" : "",
    ],
    ["Əməliyyat", (allocationLabels as Record<string, string>)[f.type]],
    [
      "Qalıqlar",
      (
        {
          outstanding: "Yalnız borclar",
          closed: "Bağlanmış",
          customer: "Müştəri borcları",
          supplier: "Təchizatçı borcları",
          worker: "Usta borcları",
          paid: "Tam ödənilənlər",
          advance: "Avansı olanlar",
        } as Record<string, string>
      )[f.balance],
    ],
  ];
  return (
    entries
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ") || "Bütün qeydlər"
  );
}
export function buildWorkshopReport(
  scope: ReportScope,
  data: WorkshopData,
  f = parseFilters({}),
): PrimeReport {
  const title = {
    finance: "Mədaxil / Məxaric hesabatı",
    audit: "Audit jurnalı",
    overview: "İcmal hesabatı",
    purchases: "Satınalma hesabatı",
    workers: "İşçilər hesabatı",
    work: "Görüləcək işlər hesabatı",
    vehicle: "Servis kartı maliyyə hesabatı",
    quotation: "Qiymət təklifi",
    handover: "TƏHVİL-TƏSLİM AKTI",
    kassa: "Kassa hesabatı",
  }[scope];
  const report: PrimeReport = {
    scope,
    title,
    generatedAt: formatReportDateTime(),
    filters: filterText(f, data),
    summary: [],
    sections: [],
    orientation: "portrait",
  };
  const job = data.jobs.find((j) => j.id === f.job) ?? data.jobs[0];
  if (scope === "handover") return handoverReport(job?.vehicles?.plate ?? "");
  if (scope === "quotation") {
    if (!job) return report;
    const works = data.work
        .filter((w) => w.service_job_id === job.id)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
      parts = data.parts
        .filter((p) => p.service_job_id === job.id)
        .sort((a, b) => a.display_order - b.display_order);
    return customerQuotation(job, works, parts);
  }
  if (scope === "vehicle") {
    if (job) {
      report.summary = pairs([
        [
          "Avtomobil",
          `${job.vehicles?.plate} · ${job.vehicles?.make} ${job.vehicles?.model}`,
        ],
        ["Müştəri", job.customer_name || "-"],
        ["Telefon", job.customer_phone || "-"],
        ["Status", reportJobStatusLabels[job.status]],
      ]);
      report.sections = vehicleSections(job, data);
    }
    return report;
  }
  if (scope === "work") {
    const works = selectWork(data, f);
    report.summary = pairs([["İş sayı", String(works.length)]]);
    report.sections = [
      {
        title: "İş siyahısı",
        table: table(
          ["Avtomobil", "İş", "Usta", "Status", "Plan / tamamlanma"],
          works.map((w) => ({
            id: w.id,
            values: [
              data.jobs.find((j) => j.id === w.service_job_id)?.vehicles
                ?.plate || "-",
              workTitle(w),
              workerDisplayName(w.workers),
              reportWorkStatusLabels[w.status],
              `${date(w.planned_at)} / ${date(w.completed_at) || "-"}`,
            ],
            details: [
              [
                "Miqdar / vahid",
                `${formatQuantity(w.quantity ?? 1)} ${w.unit_catalog?.name ?? "Xidmət"}`,
              ],
              ["Mənbə", w.is_additional ? "Əlavə iş" : "İlkin təklif"],
              ["Müştəri qiyməti", value(w.quoted_price)],
              [
                "Usta mayası",
                costKnown(w) ? money(w.labor_cost) : missingValue,
              ],
              ["Qeyd", w.notes || "-"],
            ],
          })),
        ),
      },
    ];
    return report;
  }
  if (scope === "purchases") {
    report.filters = filterText({ ...f, job: "", supplier: "" }, data);
    return purchaseReport(report, data, f);
  }
  if (scope === "workers" || (scope === "kassa" && f.view === "workers")) {
    const workers = selectWorkerFinances(data, f);
    report.title = "İşçilərlə hesablaşma hesabatı";
    report.orientation = "landscape";
    report.summary = pairs([
      ["İşçi sayı", String(workers.length)],
      ["Qazanılmış", money(sumMoney(workers.map((n) => n.earned)))],
      [
        "Seçilən işlərə ödənilib (bütün tarixçə)",
        money(sumMoney(workers.map((n) => n.paid))),
      ],
      ["Avans", money(sumMoney(workers.map((n) => n.advance)))],
      [
        "Qazanılmış qalıq alacaq",
        money(sumMoney(workers.map((n) => n.outstanding))),
      ],
      [
        "Qalan razılaşdırılmış usta məbləği",
        money(sumMoney(workers.map((n) => n.remaining))),
      ],
    ]);
    report.sections = workers.flatMap((n) => {
      const w = n.worker;
      const workTable = table(
        [
          "Avtomobil / servis kartı",
          "İş",
          "Müştəri qiyməti",
          "Usta mayası",
          "Qazanılmış",
          "Ödənilib",
          "Avans",
          "Qazanılmış qalıq",
          "Qalan razılaşdırılmış usta məbləği",
        ],
        n.items.map((i) => {
          const job = data.jobs.find((j) => j.id === i.service_job_id),
            finance = workerWorkFinance(i, data.cash);
          return {
            id: i.id,
            values: [
              `${job?.vehicles?.plate || "-"} · ${job?.vehicles?.make || ""} ${job?.vehicles?.model || ""} · ${job?.job_no || "-"}`,
              workTitle(i),
              value(i.quoted_price),
              finance.known ? money(i.labor_cost) : missingValue,
              money(finance.earned),
              money(finance.paid),
              money(finance.advance),
              money(finance.outstanding),
              value(finance.remaining),
            ],
            details: [
              ["Status", reportWorkStatusLabels[i.status]],
              [
                "Plan / tamamlanma",
                `${date(i.planned_at)} / ${date(i.completed_at) || "-"}`,
              ],
              ["Qeyd", i.notes || "-"],
            ] as Array<[string, string]>,
          };
        }),
      );
      workTable.columns.forEach((column, i) => {
        column.width = [15, 17, 10, 9, 9, 9, 9, 11, 11][i];
      });
      const sections: ReportSection[] = [
        {
          title: workerDisplayName(w),
          fields: pairs([
            ["İxtisas / rol", w.worker_roles?.name || "-"],
            ["Telefon", w.phone || "-"],
            ["Ata adı", w.father_name || "-"],
            ["İşə başlama", date(w.hire_date)],
            ["Status", w.active ? "Aktiv" : "Deaktiv"],
            ["Qeyd", w.notes || "-"],
          ]),
          summary: pairs([
            ["Tapşırıqlar", String(n.items.length)],
            [
              "Servis kartları",
              String(new Set(n.items.map((i) => i.service_job_id)).size),
            ],
            ["Tamamlanıb", String(n.done.length)],
            ["Aktiv", String(n.active.length)],
            ["Ləğv", String(n.cancelled.length)],
            ["Qazanılmış", money(n.earned)],
            ["Seçilən işlərə ödənilib (bütün tarixçə)", money(n.paid)],
            ["Avans", money(n.advance)],
            ["Qazanılmış qalıq alacaq", money(n.outstanding)],
            ["Qalan razılaşdırılmış usta məbləği", money(n.remaining)],
            ["Aktiv işlərin razılaşdırılmış usta məbləği", money(n.expected)],
            ...(n.missing
              ? [
                  ["Maya daxil edilməyib", `${n.missing} iş`] as [
                    string,
                    string,
                  ],
                ]
              : []),
          ]),
          table: workTable,
        },
      ];
      const history = workerPaymentHistory(data, n.items);
      if (history.length) {
        const historyTable = table(
          [
            "Tarix",
            "Avtomobil / iş",
            "Qazanılmış (cari)",
            "Ödəniş",
            "Avans (cari)",
            "Qazanılmış qalıq (cari)",
            "Qalan usta məbləği (cari)",
            "Qeyd / vəziyyət",
          ],
          history.map(
            ({
              payment: t,
              item,
              job,
              earned,
              advance,
              outstanding,
              remaining,
            }) => ({
              id: t.id,
              values: [
                date(t.transaction_date),
                `${job?.vehicles?.plate || "-"} · ${job?.job_no || "-"} · ${workTitle(item)}`,
                money(earned),
                money(t.amount),
                money(advance),
                money(outstanding),
                value(remaining),
                [t.notes, t.voided_at ? `Ləğv: ${t.void_reason}` : ""]
                  .filter(Boolean)
                  .join(" · ") || "-",
              ],
            }),
          ),
        );
        historyTable.columns.forEach((column, i) => {
          column.width = [9, 23, 11, 9, 10, 12, 12, 14][i];
        });
        sections.push({
          title: `${workerDisplayName(w)}: seçilmiş işlərin ödəniş tarixçəsi`,
          table: historyTable,
        });
      }
      return sections;
    });
    return report;
  }
  const jobs = selectJobs(data, f, scope === "kassa").filter(
      (j) => scope !== "overview" || j.status !== "DELIVERED",
    ),
    totals = jobs.map((j) =>
      jobFinance(j, data.work, data.parts, data.purchases, data.cash),
    );
  report.summary = pairs([
    ["Avtomobil sayı", String(jobs.length)],
    [
      "Ümumi təklif / əvvəlki büdcə",
      money(sumMoney(totals.map((n) => n.quotedTotal))),
    ],
    ["Məlum maya", money(sumMoney(totals.map((n) => n.totalCost)))],
    ["Müştəri borcu", money(sumMoney(totals.map((n) => n.customerReceivable)))],
    ["Təchizatçı borcu", money(sumMoney(totals.map((n) => n.supplierPayable)))],
    ["Usta borcu", money(sumMoney(totals.map((n) => n.workerPayable)))],
    ["Usta avansı", money(sumMoney(totals.map((n) => n.workerAdvance)))],
    [
      "Brüt mənfəət",
      totals.some((n) => n.grossProfit == null)
        ? "Mənfəət tam hesablanmayıb"
        : money(sumMoney(totals.map((n) => n.grossProfit))),
    ],
  ]);
  report.sections = [
    {
      title: "Servis kartları",
      table: table(
        [
          "Avtomobil / status",
          "Təklif / maya",
          "Müştəri: alınıb / borc",
          "Təchizatçı / usta borcu",
          "Brüt mənfəət",
        ],
        jobs.map((j, i) => {
          const n = totals[i];
          return {
            id: j.id,
            values: [
              `${j.vehicles?.plate} · ${j.vehicles?.make} ${j.vehicles?.model} · ${reportJobStatusLabels[j.status]}`,
              `${money(n.quotedTotal)} / ${money(n.totalCost)}`,
              `${money(n.customerPaid)} / ${money(n.customerReceivable)}`,
              `${money(n.supplierPayable)} / ${money(n.workerPayable)}`,
              value(n.grossProfit),
            ],
            details: [
              ...missingCostFields(n),
              ["Usta avansı", money(n.workerAdvance)],
            ],
          };
        }),
      ),
    },
  ];
  if (scope === "kassa") {
    const cash = selectCash(data, f),
      flow = cashFlow(cash);
    report.summary.push(
      ...pairs([
        ["Mədaxil", money(flow.cashIn)],
        ["Məxaric", money(flow.cashOut)],
        ["Net kassa axını", money(flow.netCashFlow)],
      ]),
    );
    report.sections.push({
      title: "Kassa jurnalı",
      table: table(
        ["Tarix / avtomobil", "Əməliyyat / sətir", "İstiqamət", "Məbləğ"],
        cash.map((t) => ({
          id: t.id,
          values: [
            `${date(t.transaction_date)} · ${data.jobs.find((j) => j.id === t.service_job_id)?.vehicles?.plate}`,
            `${allocationLabels[t.allocation_type]} · ${t.work_item_id ? workTitle(data.work.find((w) => w.id === t.work_item_id)!) : t.required_part_id ? data.parts.find((p) => p.id === t.required_part_id)?.part_catalog?.name || "Detal" : t.purchase_id ? partTitle(data.purchases.find((p) => p.id === t.purchase_id)!) : "Əvvəlki büdcə"}`,
            t.voided_at
              ? "Ləğv edilib"
              : t.direction === "IN"
                ? "Mədaxil"
                : "Məxaric",
            money(t.amount),
          ],
          details: [
            ["Qeyd", t.notes || "-"],
            ...(t.void_reason
              ? [["Ləğv səbəbi", t.void_reason] as [string, string]]
              : []),
          ],
        })),
      ),
    });
    if (f.job && job) report.sections.push(...vehicleSections(job, data));
  }
  return report;
}
function vehicleSections(
  job: DbServiceJob,
  data: WorkshopData,
): ReportSection[] {
  const n = jobFinance(job, data.work, data.parts, data.purchases, data.cash),
    work = data.work.filter((w) => w.service_job_id === job.id),
    parts = data.parts.filter((p) => p.service_job_id === job.id);
  return [
    {
      title: "Müştəri / servis",
      fields: pairs([
        ["Mənbə", reportFundingLabels[job.funding_source]],
        ["Sığorta", job.insurance_company || "-"],
        ["Claim", job.insurance_claim_no || "-"],
        ["Qəbul", date(job.received_at)],
        ["Hədəf təhvil", date(job.target_delivery_date)],
        ["VIN", job.vehicles?.vin_body_number || "-"],
        ["Qeyd", job.notes || "-"],
      ]),
    },
    {
      title: "Maliyyə yekunu",
      summary: pairs([
        ["İş təklifi", n.detailed ? money(n.quotedWork) : missingValue],
        ["Detal təklifi", n.detailed ? money(n.quotedParts) : missingValue],
        ["Ümumi təklif / əvvəlki büdcə", money(n.quotedTotal)],
        ["Razılaşdırılmış büdcə", money(job.agreed_budget)],
        ["Detal mayası", money(n.partsCost)],
        ["Usta mayası", money(n.workCost)],
        ["Məlum ümumi maya", money(n.totalCost)],
        ["Müştəridən alınıb", money(n.customerPaid)],
        ["Müştərinin qalıq borcu", money(n.customerReceivable)],
        ["Təchizatçıya ödənilib", money(n.supplierPaid)],
        ["Təchizatçıya borc", money(n.supplierPayable)],
        ["Ustaya ödənilib", money(n.workerPaid)],
        ["Ustaya qazanılmış borc", money(n.workerPayable)],
        ["Usta avansı", money(n.workerAdvance)],
        ["Qalan razılaşdırılmış usta məbləği", money(n.workerRemaining)],
        ["İş mənfəəti", value(n.workProfit)],
        ["Detal mənfəəti", value(n.partProfit)],
        ["Brüt mənfəət", value(n.grossProfit)],
        ...missingCostFields(n),
      ]),
    },
    {
      title: "İşçilik",
      table: table(
        [
          "İş / usta / status",
          "Müştəri qiyməti",
          "Usta mayası",
          "Usta: ödənilib / qazanılmış qalıq",
        ],
        work.map((w) => {
          const finance = workerWorkFinance(w, data.cash);
          return {
            id: w.id,
            values: [
              `${workTitle(w)} · ${workerDisplayName(w.workers)} · ${reportWorkStatusLabels[w.status]}`,
              value(w.quoted_price),
              costKnown(w) ? money(w.labor_cost) : missingValue,
              `${money(finance.paid)} / ${money(finance.outstanding)}`,
            ],
            details: [
              ["Qazanılmış", money(finance.earned)],
              ["Avans", money(finance.advance)],
              ["Qalan razılaşdırılmış usta məbləği", value(finance.remaining)],
              ["Qeyd", w.notes || "-"],
              [
                "Plan / tamamlanma",
                `${date(w.planned_at)} / ${date(w.completed_at) || "-"}`,
              ],
              [
                "Marja",
                w.quoted_price != null && costKnown(w)
                  ? money(
                      subtractMoney(
                        w.quoted_price,
                        w.status === "CANCELLED" ? 0 : w.labor_cost,
                      ),
                    )
                  : missingValue,
              ],
            ],
          };
        }),
      ),
    },
    {
      title: "Tələb olunan detallar",
      table: table(
        ["Detal", "Müştəri qiyməti", "Maya / marja"],
        parts.map((r) => {
          const purchases = data.purchases.filter(
              (p) => p.required_part_id === r.id,
            ),
            cost = sumMoney(purchases.map(purchaseCost));
          return {
            id: r.id,
            values: [
              r.part_catalog?.name || "Detal",
              money(r.quoted_price),
              purchases.length
                ? `${money(cost)} / ${money(subtractMoney(r.quoted_price, cost))}`
                : missingValue,
            ],
            details: [["Qeyd", r.notes || "-"]],
          };
        }),
      ),
    },
    ...buildWorkshopReport("purchases", data, parseFilters({ job: job.id }))
      .sections,
  ];
}
