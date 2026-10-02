import { bakuDate } from "@/lib/filters";
import {
  moneySum,
  moneyDiff,
  type FinanceData,
  type JournalFilters,
  type LedgerEntry,
} from "@/lib/finance";
import {
  formatReportMoney as money,
  formatReportDate as date,
} from "@/lib/reports/report-format";
import type { PrimeReport } from "@/lib/reports/report-types";

export function workerReconciliation(
  data: FinanceData,
  f: JournalFilters,
  report: PrimeReport,
): PrimeReport {
  const name =
    data.workers?.find((w) => w.id === f.worker)?.name ||
    data.work.find((w) => w.worker_id === f.worker)?.worker ||
    "İşçi";
  const within = (day: string) =>
    (!f.from || day >= f.from) && (!f.to || day <= f.to);
  const before = (day: string) => !!f.from && day < f.from;
  const work = data.work.filter(
    (w) => w.worker_id === f.worker && (!f.job || w.service_job_id === f.job),
  );
  const earnings = work.filter(
    (w) => w.status === "DONE" && w.labor_cost_known && w.completed_at,
  );
  const payments = data.ledger.filter(
    (t) =>
      !t.voided_at &&
      t.worker_identity_id === f.worker &&
      (!f.job || t.service_job_id === f.job),
  );
  const allocations = (data.advanceAllocations ?? []).filter(
    (a) => a.worker_id === f.worker && (!f.job || a.service_job_id === f.job),
  );
  const isBonus = (t: LedgerEntry) =>
    t.counterparty_details.payment_kind === "WORKER_BONUS";
  const isAdvance = (t: LedgerEntry) =>
    t.counterparty_details.payment_kind === "WORKER_ADVANCE";
  const direct = payments.filter(
    (t) => t.allocation_type === "WORKER_WORK_ITEM",
  );
  const opening = moneySum([
    ...earnings
      .filter((w) => before(bakuDate(w.completed_at!)))
      .map((w) => w.labor_cost),
    ...direct
      .filter((t) => before(t.transaction_date))
      .map((t) => -Number(t.amount)),
    ...allocations
      .filter((a) => before(bakuDate(a.created_at)))
      .map((a) => -Number(a.amount)),
  ]);
  const periodWorks = earnings.filter((w) => within(bakuDate(w.completed_at!)));
  const periodPayments = payments.filter((t) => within(t.transaction_date));
  const periodAllocations = allocations.filter((a) =>
    within(bakuDate(a.created_at)),
  );
  const earned = moneySum(periodWorks.map((w) => w.labor_cost));
  const paid = moneySum(
    direct.filter((t) => within(t.transaction_date)).map((t) => t.amount),
  );
  const applied = moneySum(periodAllocations.map((a) => a.amount));
  const endingByWork = work.map((w) =>
    moneySum([
      w.status === "DONE" &&
      w.labor_cost_known &&
      w.completed_at &&
      (!f.to || bakuDate(w.completed_at) <= f.to)
        ? w.labor_cost
        : 0,
      ...direct
        .filter(
          (t) =>
            t.work_item_id === w.id && (!f.to || t.transaction_date <= f.to),
        )
        .map((t) => -Number(t.amount)),
      ...allocations
        .filter(
          (a) =>
            a.work_item_id === w.id &&
            (!f.to || bakuDate(a.created_at) <= f.to),
        )
        .map((a) => -Number(a.amount)),
    ]),
  );
  report.title = "İşçi Hesablaşma";
  report.documentContext = [
    name,
    f.from,
    f.to,
    data.jobs.find((j) => j.id === f.job)?.plate || "",
  ];
  report.subtitle =
    "Qazanc tamamlanma tarixinə əsaslanır. Bonus borcu azaltmır. İşə bağlı avans borc hesabında yalnız bir dəfə nəzərə alınır.";
  report.summary = [
    ["Dövrün əvvəlində qalıq", opening],
    ["Dövr ərzində qazanılıb", earned],
    ["İş üzrə ödəniş (avans daxil)", paid],
    [
      "Verilmiş avans (məlumat)",
      moneySum(periodPayments.filter(isAdvance).map((t) => t.amount)),
    ],
    ["Tətbiq edilmiş ümumi avans", applied],
    [
      "Əlavə ödəniş / bonus",
      moneySum(periodPayments.filter(isBonus).map((t) => t.amount)),
    ],
    [
      "Dövrün sonunda qalıq borc",
      moneySum(endingByWork.map((n) => Math.max(n, 0))),
    ],
    [
      "İşə bağlı artıq ödəniş",
      moneySum(endingByWork.map((n) => Math.max(-n, 0))),
    ],
  ].map(([label, amount]) => ({
    label: String(label),
    value: money(Number(amount)),
  }));
  report.sections = [
    {
      title: "Ödəniş tarixçəsi",
      table: {
        columns: [
          { key: "date", label: "Tarix", width: 11 },
          { key: "purpose", label: "Təyinat", width: 20 },
          { key: "work", label: "Avtomobil / İş", width: 24 },
          { key: "amount", label: "Məbləğ (AZN)", width: 12, align: "right" },
          { key: "channel", label: "Kanal / hesab", width: 13 },
          { key: "reference", label: "Reference", width: 20 },
        ],
        rows: periodPayments.map((t) => ({
          id: t.id,
          cells: {
            date: date(t.transaction_date),
            purpose: isBonus(t)
              ? "İşçi bonusu"
              : isAdvance(t)
                ? "Usta avansı"
                : data.categories.find((c) => c.id === t.category_id)?.name ||
                  t.purpose,
            work:
              [
                data.jobs.find((j) => j.id === t.service_job_id)?.plate,
                work.find((w) => w.id === t.work_item_id)?.title,
              ]
                .filter(Boolean)
                .join(" · ") || "-",
            amount: money(t.amount),
            channel:
              t.channel === "CASH"
                ? "Nağd"
                : data.accounts.find((a) => a.id === t.financial_account_id)
                    ?.name || "Bank",
            reference: (t.reference_number || t.bank_reference || "-").replace(
              /([^\s]{20})(?=\S)/g,
              "$1\n",
            ),
          },
        })),
      },
    },
  ];
  report.sections.unshift({
    title: name,
    table: {
      columns: [
        "Tamamlanma",
        "Avtomobil",
        "İş",
        "Hesablama",
        "Qazanılmış",
        "Ödənilib",
        "Avans tətbiqi",
        "Qalıq",
      ].map((label, i) => ({
        key: String(i),
        label,
        width: i === 2 ? 23 : 11,
        align: i >= 4 ? "right" : "left",
      })),
      rows: periodWorks.map((w) => {
        const workPaid = moneySum(
          direct
            .filter(
              (t) =>
                t.work_item_id === w.id &&
                (!f.to || t.transaction_date <= f.to),
            )
            .map((t) => t.amount),
        );
        const workApplied = moneySum(
          allocations
            .filter(
              (a) =>
                a.work_item_id === w.id &&
                (!f.to || bakuDate(a.created_at) <= f.to),
            )
            .map((a) => a.amount),
        );
        return {
          id: w.id,
          cells: Object.fromEntries(
            [
              date(w.completed_at),
              data.jobs.find((j) => j.id === w.service_job_id)?.plate || "-",
              w.title,
              w.compensation_mode === "PERCENTAGE" ? "Faizli" : "Sabit",
              money(w.labor_cost),
              money(workPaid),
              money(workApplied),
              money(
                Math.max(
                  0,
                  moneyDiff(w.labor_cost, moneySum([workPaid, workApplied])),
                ),
              ),
            ].map((v, i) => [String(i), v]),
          ),
        };
      }),
    },
  });
  if (periodAllocations.length)
    report.sections.push({
      title: "Avansın tətbiqi (pul çıxışı deyil)",
      table: {
        columns: [
          { key: "date", label: "Tarix" },
          { key: "work", label: "İş" },
          { key: "amount", label: "Məbləğ", align: "right" },
        ],
        rows: periodAllocations.map((a) => ({
          id: a.id,
          cells: {
            date: date(a.created_at),
            work: work.find((w) => w.id === a.work_item_id)?.title || "-",
            amount: money(a.amount),
          },
        })),
      },
    });
  report.sections.push({
    title: "Təsdiq",
    keepTogether: true,
    signatureDates: true,
    paragraphs: [
      "Tərəflər dövr üzrə iş və ödəniş məlumatlarını daxili hesablaşma məqsədilə təsdiq edir. Rəsmi normativ forma deyil.",
    ],
    signatures: ["PRIME / məsul şəxs", name],
  });
  return report;
}
