import type { PrimeReport, ReportSection } from "@/lib/reports/report-types";
import {
  channelName,
  filterLedger,
  journalFilters,
  movementTotals,
  ledgerBalance,
  vehicleSettlement,
  moneySum,
  type FinanceData,
  type JournalFilters,
} from "@/lib/finance";
import {
  formatReportMoney as money,
  formatReportDateTime,
} from "@/lib/reports/report-format";
import { requireAccess } from "@/lib/supabase/auth";
import { getFinance } from "@/lib/supabase/finance";
import type { SearchParams } from "@/lib/filters";
export async function loadFinanceReport(params: SearchParams) {
  await requireAccess(["ADMIN", "CASHIER"]);
  return financeReport(await getFinance(), journalFilters(params));
}
export function financeReport(
  data: FinanceData,
  f: JournalFilters,
): PrimeReport | null {
  const rows = filterLedger(data, f),
    fields = (items: Array<[string, string | null | undefined]>) =>
      items
        .filter(([, v]) => v)
        .map(([label, value]) => ({
          label,
          value: value!,
          fullWidth: label === "Order / əməliyyat №",
        }));
  const report: PrimeReport = {
    scope: "finance",
    title: "Mədaxil / Məxaric hesabatı",
    generatedAt: formatReportDateTime(),
    orientation: "landscape",
    summary: [],
    sections: [],
    filters: [
      f.from || "Başlanğıcdan",
      f.to || "Bu günədək",
      f.channel ? channelName(f.channel) : "Bütün kanallar",
      data.accounts.find((a) => a.id === f.account)?.name,
      data.categories.find((c) => c.id === f.category)?.name,
      f.direction ? (f.direction === "IN" ? "Mədaxil" : "Məxaric") : "",
      data.jobs.find((j) => j.id === f.job)?.plate,
      f.party,
      f.supplier
        ? data.purchases.find((p) => p.supplier_id === f.supplier)?.supplier
        : "",
      f.worker ? data.work.find((w) => w.worker_id === f.worker)?.worker : "",
      f.actor
        ? data.ledger.find((t) => t.owner_user_id === f.actor)?.created_by_name
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
  };
  if (f.transaction) {
    const t = rows[0];
    if (!t) return null;
    const a = data.accounts.find((a) => a.id === t.financial_account_id),
      j = data.jobs.find((j) => j.id === t.service_job_id);
    report.orientation = "portrait";
    report.filters = undefined;
    report.title =
      t.channel === "CASH"
        ? t.direction === "IN"
          ? "KASSA MƏDAXİL ORDERİ"
          : "KASSA MƏXARİC ORDERİ"
        : t.direction === "IN"
          ? "BANK MƏDAXİL SƏNƏDİ"
          : "BANK MƏXARİC SƏNƏDİ";
    report.summary = [{ label: "Məbləğ", value: money(t.amount) }];
    report.sections = [
      {
        title: "Əməliyyat",
        fields: fields([
          ["Order / əməliyyat №", t.id],
          ["Tarix / vaxt", formatReportDateTime(t.occurred_at)],
          ["Status", t.voided_at ? "Ləğv edilib" : "Qeydə alınıb"],
          ["Kanal", channelName(t.channel)],
          [
            "Ödəniş üsulu",
            {
              CASH: "Nağd",
              TRANSFER: "Bank köçürməsi",
              POS: "POS / Kart",
              ONLINE: "Online",
              OTHER: "Digər nağdsız",
            }[t.payment_method],
          ],
          [
            t.direction === "IN" ? "Kimdən" : "Kimə / Verilsin",
            t.counterparty_name_snapshot,
          ],
          ["Təyinat", t.purpose],
          ["Avtomobil / İş №", j ? `${j.plate} · ${j.job_no}` : null],
          ["Bizim hesab", a?.name],
          ["Bank", a?.bank_name],
          ["IBAN", a?.iban],
          ["Hesab sahibi", a?.account_holder],
          ["VÖEN", a?.tax_id],
          ["SWIFT/BIC", a?.swift],
          ["Tərəfin VÖEN-i", t.counterparty_details.tax_id],
          ["Tərəfin IBAN-ı", t.counterparty_details.iban],
          ["Tərəfin bankı", t.counterparty_details.bank],
          ["Şəxsiyyət sənədi", t.counterparty_details.identity],
          ["Sənəd / qəbz №", t.reference_number],
          ["Bank reference", t.bank_reference],
          ["Ödəniş tapşırığı №", t.payment_order_number],
          ["Əlavə sənəd", t.supporting_reference],
          [
            "Kateqoriya",
            data.categories.find((c) => c.id === t.category_id)?.name,
          ],
          ["Daxil edən", t.created_by_name],
          ["Qeyd", t.notes],
          ["Ləğv səbəbi", t.void_reason],
        ]),
      },
      {
        title: "Təsdiq",
        keepTogether: true,
        signatures: [
          "Kassir / məsul şəxs",
          t.direction === "OUT" ? "Vəsaiti alan" : "Vəsaiti verən",
        ],
        paragraphs: [
          "Daxili əməliyyat sənədi. Rəsmi normativ forma kimi təqdim edilmir.",
        ],
      },
    ];
    return report;
  }
  const cash = movementTotals(rows.filter((t) => t.channel === "CASH")),
    bank = movementTotals(rows.filter((t) => t.channel === "BANK")),
    all = movementTotals(rows);
  report.summary = [
    ["Nağd mədaxil", cash.income],
    ["Nağd məxaric", cash.expense],
    ["Bank mədaxil", bank.income],
    ["Bank məxaric", bank.expense],
    ["Ümumi mədaxil", all.income],
    ["Ümumi məxaric", all.expense],
    ["Net pul axını", all.net],
  ].map(([label, value]) => ({
    label: String(label),
    value: money(Number(value)),
  }));
  if (f.channel || f.account) {
    const relevant = data.ledger.filter(
        (t) =>
          (!f.channel || t.channel === f.channel) &&
          (!f.account || t.financial_account_id === f.account),
      ),
      opening = ledgerBalance(
        relevant.filter((t) => f.from && t.transaction_date < f.from),
      ),
      inPeriod = relevant.filter(
        (t) =>
          (!f.from || t.transaction_date >= f.from) &&
          (!f.to || t.transaction_date <= f.to),
      ),
      flow = movementTotals(inPeriod, false);
    report.sections.push({
      title: "Hesab qalığı",
      fields: [
        ["Əvvəl qalıq", opening],
        ["Mədaxil (köçürmələr daxil)", flow.income],
        ["Məxaric (köçürmələr daxil)", flow.expense],
        ["Son qalıq", moneySum([opening, flow.net])],
      ].map(([label, n]) => ({
        label: String(label),
        value: money(Number(n)),
      })),
    });
  }
  if (f.job) {
    const n = vehicleSettlement(data, f.job);
    if (n.job)
      report.sections.push({
        title: `${n.job.plate} · ${n.job.job_no}`,
        fields: [
          ["Detal mayası", n.partsCost],
          ["Usta mayası", n.workerCost],
          ["Əlavə avtomobil xərci", n.otherCost],
          ["Ümumi maya", n.totalCost],
          ["Nağddan ödənilib", n.cashPaid],
          ["Bankdan ödənilib", n.bankPaid],
          ["Qalan öhdəlik", n.remaining],
          ["Artıq ödəniş / uzlaşdırılacaq", n.overpaid],
          ["Müştəridən nağd alınıb", n.cashReceived],
          ["Müştəridən banka alınıb", n.bankReceived],
          ["Müştəri qalıq borcu", n.job.customer_due],
        ].map(([label, n]) => ({
          label: String(label),
          value: money(Number(n)),
        })),
      });
    if (n.job)
      report.sections.push({
        title: "Ödənişlərin bölgüsü (bütün tarixçə)",
        table: {
          columns: [
            { key: "kind", label: "Təyinat", width: 40 },
            ...["cash", "bank", "total"].map((key, i) => ({
              key,
              label: ["Nağd", "Bank", "Cəmi"][i],
              width: 20,
              align: "right" as const,
            })),
          ],
          rows: [
            ["SUPPLIER_PURCHASE", "Təchizatçı"],
            ["WORKER_WORK_ITEM", "Usta"],
            ["VEHICLE_EXPENSE", "Əlavə xərc"],
          ].map(([kind, label]) => {
            const entries = data.ledger.filter(
              (t) =>
                t.service_job_id === f.job &&
                !t.voided_at &&
                t.allocation_type === kind,
            );
            const cash = moneySum(
                entries
                  .filter((t) => t.channel === "CASH")
                  .map((t) => t.amount),
              ),
              bank = moneySum(
                entries
                  .filter((t) => t.channel === "BANK")
                  .map((t) => t.amount),
              );
            return {
              id: kind,
              cells: {
                kind: label,
                cash: money(cash),
                bank: money(bank),
                total: money(moneySum([cash, bank])),
              },
            };
          }),
        },
      });
  }
  if (f.worker || f.supplier) {
    const obligations = data.jobs
      .flatMap((j) => vehicleSettlement(data, j.id).obligations)
      .filter((o) =>
        f.worker
          ? data.work.some((w) => w.id === o.id && w.worker_id === f.worker)
          : data.purchases.some(
              (p) => p.id === o.id && p.supplier_id === f.supplier,
            ),
      );
    report.sections.push({
      title: "Cari öhdəliklər (bütün tarixçə)",
      fields: [
        ["Razılaşdırılmış maya", moneySum(obligations.map((o) => o.cost))],
        ["Ödənilib", moneySum(obligations.map((o) => o.paid))],
        [
          "Qalan öhdəlik",
          moneySum(obligations.map((o) => Math.max(o.remaining, 0))),
        ],
        [
          "Artıq ödəniş / uzlaşdırılacaq",
          moneySum(obligations.map((o) => Math.max(-o.remaining, 0))),
        ],
      ].map(([label, n]) => ({
        label: String(label),
        value: money(Number(n)),
      })),
    });
  }
  const columns = [
    ["date", "Tarix", 9],
    ["channel", "Kanal / hesab", 10],
    ["direction", "İstiqamət", 8],
    ["category", "Kateqoriya", 10],
    ["party", "Tərəf", 12],
    ["vehicle", "Avtomobil", 8],
    ["purpose", "Təyinat", 15],
    ["reference", "Reference", 10],
    ["in", "Mədaxil", 9],
    ["out", "Məxaric", 9],
  ] as const;
  const section: ReportSection = {
    title: "Əməliyyatlar",
    table: {
      columns: columns.map(([key, label, width]) => ({
        key,
        label,
        width,
        align: key === "in" || key === "out" ? "right" : "left",
      })),
      rows: rows.map((t) => ({
        id: t.id,
        cells: {
          date: formatReportDateTime(t.occurred_at),
          channel:
            t.channel === "CASH"
              ? "Nağd"
              : data.accounts.find((a) => a.id === t.financial_account_id)
                  ?.name || "Bank",
          direction: t.voided_at
            ? "Ləğv"
            : t.direction === "IN"
              ? "Mədaxil"
              : "Məxaric",
          category: t.transfer_id
            ? "Daxili köçürmə"
            : t.allocation_type.startsWith("OPENING_")
              ? "Başlanğıc qalıq"
              : data.categories.find((c) => c.id === t.category_id)?.name ||
                {
                  CUSTOMER_VEHICLE: "Müştəri ödənişi",
                  SUPPLIER_PURCHASE: "Təchizatçı ödənişi",
                  WORKER_WORK_ITEM: "Usta ödənişi",
                }[t.allocation_type] ||
                "Ödəniş",
          party: t.counterparty_name_snapshot || "-",
          vehicle:
            data.jobs.find((j) => j.id === t.service_job_id)?.plate || "-",
          purpose: t.purpose || t.notes || "-",
          reference: t.bank_reference || t.reference_number || "-",
          in: t.direction === "IN" ? money(t.amount) : "-",
          out: t.direction === "OUT" ? money(t.amount) : "-",
        },
      })),
    },
  };
  report.sections.push(section);
  return report;
}
