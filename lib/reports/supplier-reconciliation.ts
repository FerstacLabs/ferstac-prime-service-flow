import { bakuDate } from "@/lib/filters";
import { moneySum, type FinanceData, type JournalFilters } from "@/lib/finance";
import {
  formatReportMoney as money,
  formatReportDate as date,
} from "@/lib/reports/report-format";
import type { PrimeReport } from "@/lib/reports/report-types";
type Event = {
  id: string;
  day: string;
  at: string;
  kind: string;
  purchase: string;
  job: string;
  amount: number;
  debt: number;
  reference: string;
};
export function supplierReconciliation(
  data: FinanceData,
  f: JournalFilters,
  report: PrimeReport,
): PrimeReport {
  const purchases = data.purchases.filter(
    (p) =>
      p.supplier_id === f.supplier && (!f.job || p.service_job_id === f.job),
  );
  const returns = (data.purchaseReturns ?? []).filter(
    (r) =>
      r.supplier_id === f.supplier && (!f.job || r.service_job_id === f.job),
  );
  const credits = (data.supplierCredits ?? []).filter(
    (a) =>
      a.supplier_id === f.supplier && (!f.job || a.service_job_id === f.job),
  );
  const ledger = data.ledger.filter(
    (t) =>
      !t.voided_at &&
      t.supplier_identity_id === f.supplier &&
      (!f.job || t.service_job_id === f.job),
  );
  const name =
    data.purchases.find((p) => p.supplier_id === f.supplier)?.supplier ||
    "Təchizatçı";
  const events: Event[] = [
    ...purchases.map((p) => ({
      id: p.id,
      day: p.purchase_date || "",
      at:
        returns.find((r) => r.replacement_purchase_id === p.id)?.occurred_at ||
        `${p.purchase_date}T00:00:00+04:00`,
      kind: p.replacement_of ? "Dəyişdirmə nəticəsində alış" : "Alış",
      purchase: p.id,
      job: p.service_job_id,
      amount: Number(p.original_cost ?? p.cost),
      debt: Number(p.original_cost ?? p.cost),
      reference: p.title,
    })),
    ...returns.map((r) => ({
      id: r.id,
      day: bakuDate(r.occurred_at),
      at: r.occurred_at,
      kind: r.replacement_purchase_id ? "Dəyişdirmə / qaytarma" : "Qaytarma",
      purchase: r.purchase_id,
      job: r.service_job_id,
      amount: Number(r.amount),
      debt: moneySum([-Number(r.amount), r.credit_amount]),
      reference: [r.reference_number, r.reason].filter(Boolean).join(" · "),
    })),
    ...returns
      .filter((r) => Number(r.credit_amount) > 0)
      .map((r) => ({
        id: r.id + "-credit",
        day: bakuDate(r.occurred_at),
        at: r.occurred_at,
        kind: "Təchizatçı krediti",
        purchase: r.purchase_id,
        job: r.service_job_id,
        amount: Number(r.credit_amount),
        debt: 0,
        reference: r.reference_number || r.reason,
      })),
    ...credits.map((a) => ({
      id: a.id,
      day: bakuDate(a.created_at),
      at: a.created_at,
      kind: "Kredit tətbiqi (pul çıxışı deyil)",
      purchase: a.purchase_id,
      job: a.service_job_id,
      amount: Number(a.amount),
      debt: -Number(a.amount),
      reference:
        data.purchases.find((p) => p.id === a.purchase_id)?.title || "-",
    })),
    ...(data.supplierCredits ?? [])
      .filter(
        (a) =>
          !!f.job &&
          a.service_job_id !== f.job &&
          returns.some((r) => r.id === a.return_id),
      )
      .map((a) => ({
        id: a.id + "-source",
        day: bakuDate(a.created_at),
        at: a.created_at,
        kind: "Kredit başqa avtomobilə tətbiq edilib",
        purchase: returns.find((r) => r.id === a.return_id)!.purchase_id,
        job: f.job,
        amount: Number(a.amount),
        debt: 0,
        reference: [
          data.jobs.find((j) => j.id === a.service_job_id)?.plate,
          data.purchases.find((p) => p.id === a.purchase_id)?.title,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    ...ledger
      .filter(
        (t) =>
          t.allocation_type === "SUPPLIER_PURCHASE" ||
          t.counterparty_details.payment_kind === "SUPPLIER_REFUND",
      )
      .map((t) => ({
        id: t.id,
        day: t.transaction_date,
        at: t.occurred_at,
        kind: t.direction === "IN" ? "Geri ödəniş" : "Ödəniş",
        purchase: t.purchase_id || t.counterparty_details.purchase_id || "",
        job: t.service_job_id || "",
        amount: Number(t.amount),
        debt: t.direction === "OUT" ? -Number(t.amount) : 0,
        reference: [t.reference_number, t.purpose].filter(Boolean).join(" · "),
      })),
  ].sort((a, b) => {
    const order = (e: Event) =>
      e.kind === "Qaytarma" || e.kind === "Dəyişdirmə / qaytarma"
        ? 0
        : e.kind === "Təchizatçı krediti"
          ? 1
          : e.kind === "Dəyişdirmə nəticəsində alış"
            ? 2
            : 3;
    return (
      Date.parse(a.at) - Date.parse(b.at) ||
      order(a) - order(b) ||
      a.id.localeCompare(b.id)
    );
  });
  const within = (day: string) =>
    (!f.from || day >= f.from) && (!f.to || day <= f.to);
  const selected = events.filter((e) => within(e.day));
  const balance = (before: boolean) => {
    const sums = new Map<string, number>();
    for (const e of events.filter((e) =>
      before ? !!f.from && e.day < f.from : !f.to || e.day <= f.to,
    ))
      if (e.purchase)
        sums.set(e.purchase, moneySum([sums.get(e.purchase) ?? 0, e.debt]));
    return moneySum([...sums.values()].map((n) => Math.max(n, 0)));
  };
  const available = moneySum(
    returns
      .filter((r) => !f.to || bakuDate(r.occurred_at) <= f.to)
      .map((r) =>
        moneySum([
          r.credit_amount,
          ...(data.supplierCredits ?? [])
            .filter(
              (a) =>
                a.return_id === r.id &&
                (!f.to || bakuDate(a.created_at) <= f.to),
            )
            .map((a) => -Number(a.amount)),
          ...data.ledger
            .filter(
              (t) =>
                !t.voided_at &&
                t.counterparty_details.payment_kind === "SUPPLIER_REFUND" &&
                t.counterparty_details.return_id === r.id &&
                (!f.to || t.transaction_date <= f.to),
            )
            .map((t) => -Number(t.amount)),
        ]),
      ),
  );
  report.title = "Təchizatçı Hesablaşma";
  report.documentContext = [
    name,
    f.from,
    f.to,
    data.jobs.find((j) => j.id === f.job)?.plate || "",
  ];
  report.subtitle =
    "Alışlar alış tarixinə, ödənişlər əməliyyat tarixinə əsaslanır. Tətbiq edilməmiş kredit digər alışların borcunu azaltmır.";
  report.summary = [
    ["Əvvəl qalıq borc", balance(true)],
    [
      "Alışlar",
      moneySum(
        selected
          .filter(
            (e) =>
              e.kind === "Alış" || e.kind === "Dəyişdirmə nəticəsində alış",
          )
          .map((e) => e.amount),
      ),
    ],
    [
      "Qaytarmalar",
      moneySum(
        returns
          .filter((r) => within(bakuDate(r.occurred_at)))
          .map((r) => r.amount),
      ),
    ],
    [
      "Ödənişlər",
      moneySum(
        selected.filter((e) => e.kind === "Ödəniş").map((e) => e.amount),
      ),
    ],
    [
      "Geri ödənişlər",
      moneySum(
        selected.filter((e) => e.kind === "Geri ödəniş").map((e) => e.amount),
      ),
    ],
    [
      "Tətbiq edilmiş kredit",
      moneySum(
        credits
          .filter((a) => within(bakuDate(a.created_at)))
          .map((a) => a.amount),
      ),
    ],
    ["Son qalıq borc", balance(false)],
    ["İstifadə edilməmiş kredit", available],
  ].map(([label, n]) => ({ label: String(label), value: money(Number(n)) }));
  report.sections = [
    {
      title: name,
      table: {
        columns: [
          { key: "date", label: "Tarix", width: 10 },
          { key: "vehicle", label: "Avtomobil", width: 12 },
          { key: "kind", label: "Əməliyyat", width: 20 },
          { key: "item", label: "Detal", width: 20 },
          { key: "amount", label: "Məbləğ (AZN)", width: 13, align: "right" },
          { key: "reference", label: "Reference / səbəb", width: 25 },
        ],
        rows: selected.map((e) => ({
          id: e.id,
          cells: {
            date: date(e.day),
            vehicle: data.jobs.find((j) => j.id === e.job)?.plate || "-",
            kind: e.kind,
            item: data.purchases.find((p) => p.id === e.purchase)?.title || "-",
            amount: money(e.amount),
            reference: e.reference.replace(/([^\s]{20})(?=\S)/g, "$1\n"),
          },
        })),
      },
    },
    {
      title: "Təsdiq",
      keepTogether: true,
      signatureDates: true,
      paragraphs: ["Daxili hesablaşma sənədi. Rəsmi normativ forma deyil."],
      signatures: ["PRIME / məsul şəxs", `${name} / nümayəndə`],
    },
  ];
  return report;
}
