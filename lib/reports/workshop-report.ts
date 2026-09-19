import {
  getWorkshop,
  selectJobs,
  selectPurchases,
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
  paidFor,
  purchaseCost,
  costKnown,
  sumMoney,
  subtractMoney,
  allocationLabels,
  missingValue,
} from "@/lib/workshop";
import { workerFinance } from "@/lib/worker-finance";
import {
  formatReportMoney as money,
  formatReportDate as date,
  formatReportDateTime,
  reportWorkStatusLabels,
  reportJobStatusLabels,
  reportFundingLabels,
  reportPaymentLabels,
  reportPurchaseSourceLabels,
} from "@/lib/reports/report-format";
import { handoverReport } from "@/lib/reports/handover";
import type {
  PrimeReport,
  ReportScope,
  ReportSection,
  ReportTable,
} from "@/lib/reports/report-types";
const value = (n: number | null | undefined) =>
  n == null ? missingValue : money(n);
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
  const data = await getWorkshop(f.job || undefined);
  if (
    (scope === "quotation" || scope === "handover" || scope === "vehicle") &&
    !data.jobs.some((j) => j.id === f.job)
  )
    return null;
  if (
    scope === "handover" &&
    !data.jobs.some(
      (j) => j.id === f.job && ["READY", "DELIVERED"].includes(j.status),
    )
  )
    return null;
  return buildWorkshopReport(scope, data, f);
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
    // Customer document whitelist. No accounting objects or cost fields enter this model.
    report.filters = undefined;
    report.summary = pairs([
      [
        "Avtomobil",
        `${job.vehicles?.plate} · ${job.vehicles?.make} ${job.vehicles?.model}`,
      ],
      ["Müştəri", job.customer_name || "-"],
      ["Tarix", date(new Date().toISOString())],
      ["Servis kartı", job.job_no],
    ]);
    report.sections = [
      {
        title: "Planlaşdırılan işlər",
        table: table(
          ["İş / xidmət", "Müştəri qiyməti", "Qeyd"],
          works.map((w) => ({
            id: w.id,
            values: [workTitle(w), value(w.quoted_price), w.notes || "-"],
          })),
        ),
      },
      {
        title: "Alınacaq detallar",
        table: table(
          ["Detal", "Müştəri qiyməti", "Qeyd"],
          parts.map((p) => ({
            id: p.id,
            values: [
              p.part_catalog?.name || "Detal",
              money(p.quoted_price),
              p.notes || "-",
            ],
          })),
        ),
      },
      {
        title: "Təklifin yekunu",
        summary: pairs([
          [
            "İşlərin cəmi",
            job.has_line_quotes
              ? money(sumMoney(works.map((w) => w.quoted_price)))
              : missingValue,
          ],
          [
            "Detalların cəmi",
            job.has_line_quotes
              ? money(sumMoney(parts.map((p) => p.quoted_price)))
              : missingValue,
          ],
          [
            "Ümumi təklif məbləği",
            job.has_line_quotes
              ? money(
                  sumMoney([
                    ...works.map((w) => w.quoted_price),
                    ...parts.map((p) => p.quoted_price),
                  ]),
                )
              : missingValue,
          ],
          ["Razılaşdırılmış ümumi büdcə", money(job.agreed_budget)],
        ]),
      },
    ];
    return report;
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
            details: [["Qeyd", w.notes || "-"]],
          })),
        ),
      },
    ];
    return report;
  }
  if (scope === "purchases") {
    const purchases = selectPurchases(data, f),
      supplier = data.suppliers.find((s) => s.id === f.supplier),
      cost = sumMoney(purchases.map(purchaseCost)),
      paid = sumMoney(
        purchases.map((p) => paidFor(data.cash, "SUPPLIER_PURCHASE", p.id)),
      );
    report.summary = pairs([
      ["Alış sayı", String(purchases.length)],
      ["Faktiki maya", money(cost)],
      ["Təchizatçıya ödənilib", money(paid)],
      [
        "Təchizatçı borcu",
        money(
          sumMoney(
            purchases
              .filter((p) => p.source_type === "SUPPLIER")
              .map(purchaseCost),
          ) - paid,
        ),
      ],
    ]);
    if (supplier)
      report.sections.push({
        title: supplierDisplayName(supplier),
        fields: pairs([
          ["Telefon", supplier.phone || "-"],
          ["Ünvan", supplier.address || "-"],
          ["VÖEN", supplier.tax_id_voen || "-"],
          ["Qeyd", supplier.notes || "-"],
        ]),
      });
    report.sections.push({
      title: "Alış tarixçəsi",
      table: table(
        [
          "Tarix / avtomobil",
          "Detal",
          "Müştəri qiyməti",
          "Maya / marja",
          "Ödənilib / qalıq",
        ],
        purchases.map((p) => {
          const quote = data.parts.find(
              (r) => r.id === p.required_part_id,
            )?.quoted_price,
            paid = paidFor(data.cash, "SUPPLIER_PURCHASE", p.id),
            cost = purchaseCost(p),
            j = data.jobs.find((j) => j.id === p.service_job_id);
          return {
            id: p.id,
            values: [
              `${date(p.purchase_date)} · ${j?.vehicles?.plate} · ${j?.vehicles?.make} ${j?.vehicles?.model}`,
              partTitle(p),
              value(quote),
              `${money(cost)} / ${quote == null ? missingValue : money(subtractMoney(quote, cost))}`,
              `${money(paid)} / ${money(p.source_type === "SUPPLIER" ? subtractMoney(cost, paid) : 0)}`,
            ],
            details: [
              [
                "Mənbə",
                p.source_type === "SUPPLIER"
                  ? supplierDisplayName(p.suppliers)
                  : reportPurchaseSourceLabels[p.source_type],
              ],
              ["Ödəniş", reportPaymentLabels[p.payment_status]],
              [
                "Alan",
                p.purchased_by_admin
                  ? "Administrator"
                  : workerDisplayName(p.workers),
              ],
              [
                "Qaimə / OEM",
                [p.document_no, p.part_code_oem].filter(Boolean).join(" / ") ||
                  "-",
              ],
              ["Qeyd", p.notes || "-"],
            ],
          };
        }),
      ),
    });
    return report;
  }
  if (scope === "workers") {
    const workers = data.workers.filter((w) => !f.worker || w.id === f.worker);
    report.summary = pairs([["İşçi sayı", String(workers.length)]]);
    report.sections = workers.map((w) => {
      const n = workerFinance(data, w.id, f);
      return {
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
          ["Tamamlanıb", String(n.done.length)],
          ["Aktiv", String(n.active.length)],
          ["Ləğv", String(n.cancelled.length)],
          ["Qazanılmış", money(n.earned)],
          ["Seçilən işlərə ödənilib (bütün tarixçə)", money(n.paid)],
          ["Qalıq alacaq", money(n.outstanding)],
          ["Gözlənilən", money(n.expected)],
          ["Mayası bilinməyən tamamlanmış iş", String(n.missing)],
        ]),
        table: table(
          [
            "Avtomobil",
            "İş / status",
            "Plan / tamamlanma",
            "Usta mayası",
            "Ödənilib",
          ],
          n.items.map((i) => ({
            id: i.id,
            values: [
              data.jobs.find((j) => j.id === i.service_job_id)?.vehicles
                ?.plate || "-",
              `${workTitle(i)} · ${reportWorkStatusLabels[i.status]}`,
              `${date(i.planned_at)} / ${date(i.completed_at) || "-"}`,
              costKnown(i) ? money(i.labor_cost) : missingValue,
              money(paidFor(data.cash, "WORKER_WORK_ITEM", i.id)),
            ],
            details: [["Qeyd", i.notes || "-"]],
          })),
        ),
      };
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
              [
                "Maya daxil edilməyib",
                `${n.missingWork} iş, ${n.missingParts} detal`,
              ],
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
        ["Ustaya borc", money(n.workerPayable)],
        ["İş mənfəəti", value(n.workProfit)],
        ["Detal mənfəəti", value(n.partProfit)],
        ["Brüt mənfəət", value(n.grossProfit)],
        [
          "Maya daxil edilməyib",
          `${n.missingWork} iş, ${n.missingParts} detal`,
        ],
      ]),
    },
    {
      title: "İşçilik",
      table: table(
        [
          "İş / usta / status",
          "Müştəri qiyməti",
          "Usta mayası",
          "Müştəri: alınıb / qalıq",
          "Usta: ödənilib / qalıq",
        ],
        work.map((w) => {
          const received = paidFor(data.cash, "CUSTOMER_WORK", w.id),
            paid = paidFor(data.cash, "WORKER_WORK_ITEM", w.id);
          return {
            id: w.id,
            values: [
              `${workTitle(w)} · ${workerDisplayName(w.workers)} · ${reportWorkStatusLabels[w.status]}`,
              value(w.quoted_price),
              costKnown(w) ? money(w.labor_cost) : missingValue,
              `${money(received)} / ${w.quoted_price == null ? missingValue : money(subtractMoney(w.quoted_price, received))}`,
              `${money(paid)} / ${money(subtractMoney(w.status === "DONE" && costKnown(w) ? w.labor_cost : 0, paid))}`,
            ],
            details: [
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
        ["Detal", "Müştəri qiyməti", "Maya / marja", "Müştəri: alınıb / qalıq"],
        parts.map((r) => {
          const purchases = data.purchases.filter(
              (p) => p.required_part_id === r.id,
            ),
            cost = sumMoney(purchases.map(purchaseCost)),
            received = paidFor(data.cash, "CUSTOMER_PART", r.id);
          return {
            id: r.id,
            values: [
              r.part_catalog?.name || "Detal",
              money(r.quoted_price),
              purchases.length
                ? `${money(cost)} / ${money(subtractMoney(r.quoted_price, cost))}`
                : missingValue,
              `${money(received)} / ${money(subtractMoney(r.quoted_price, received))}`,
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
