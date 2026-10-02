import type { WorkshopData } from "@/lib/supabase/workshop";
import { supplierFinance } from "@/lib/supplier-finance";
import { partTitle, supplierDisplayName } from "@/lib/supabase/queries";
import type { WorkshopFilters } from "@/lib/filters";
import { formatQuantity } from "@/lib/decimal";
import { paidFor, purchaseDue, purchaseLifecycleLabel } from "@/lib/workshop";
import {
  formatReportMoney,
  formatReportDate,
  reportPurchaseSourceLabels,
} from "./report-format";
import type { PrimeReport, ReportTableColumn } from "./report-types";

export function purchaseReport(
  report: PrimeReport,
  data: WorkshopData,
  f: WorkshopFilters,
): PrimeReport {
  const {
      items,
      cost: totalCost,
      paid: totalPaid,
      remaining,
    } = supplierFinance(data, f),
    supplier = data.suppliers.find((s) => s.id === f.supplier),
    job = data.jobs.find((j) => j.id === f.job);
  report.documentContext = [
    job?.vehicles?.plate || f.plate,
    f.supplier
      ? supplierDisplayName(
          supplier ??
            items.find(
              (p) =>
                p.supplier_id === f.supplier ||
                p.historical_supplier_id === f.supplier,
            )?.suppliers,
        )
      : "",
    f.from,
    f.to,
  ];
  const money = (n: number) => formatReportMoney(n).replace(/ AZN$/, "");
  const columns: ReportTableColumn[] = [
    { key: "date", label: "Tarix", width: 10 },
    ...(!job ? [{ key: "vehicle", label: "Avtomobil", width: 12 }] : []),
    { key: "part", label: "Detal", width: 17 },
    { key: "quantity", label: "Miqdar", width: 6 },
    { key: "unit", label: "Vahid", width: 6 },
    ...(!supplier ? [{ key: "supplier", label: "Təchizatçı", width: 11 }] : []),
    { key: "status", label: "Alış statusu", width: 12 },
    { key: "reference", label: "Sənəd", width: 12 },
    ...[
      ["cost", "İlkin alış"],
      ["paid", "Ödənilib"],
      ["returned", "Qaytarılıb"],
      ["credit", "Yaranmış kredit"],
      ["applied", "Kredit tətbiqi"],
      ["due", "Qalıq"],
    ].map(([key, label]) => ({
      key,
      label,
      width: 9,
      align: "right" as const,
    })),
  ];
  const width = columns.reduce((sum, c) => sum + c.width!, 0);
  report.orientation = "landscape";
  report.summary = [
    { label: "Alış sayı", value: String(items.length) },
    {
      label: "Faktiki maya",
      value: formatReportMoney(totalCost),
    },
    {
      label: "Ödənilib",
      value: formatReportMoney(totalPaid),
    },
    {
      label: "Qalıq borc",
      value: formatReportMoney(remaining),
    },
  ];
  report.sections = [];
  if (supplier)
    report.sections.push({
      title: supplierDisplayName(supplier),
      fields: [
        { label: "Telefon", value: supplier.phone || "-" },
        { label: "VÖEN", value: supplier.tax_id_voen || "-" },
        { label: "Ünvan", value: supplier.address || "-" },
      ],
    });
  if (job)
    report.sections.push({
      title: "Avtomobil",
      fields: [
        { label: "D.Q.N.", value: job.vehicles?.plate || "-" },
        {
          label: "Marka / Model",
          value: `${job.vehicles?.make || ""} ${job.vehicles?.model || ""}`,
        },
        { label: "İş №", value: job.job_no },
        { label: "Müştəri", value: job.customer_name || "-" },
      ],
    });
  report.sections.push({
    title: "Alış tarixçəsi",
    table: {
      columns: columns.map((c) => ({ ...c, width: (c.width! / width) * 100 })),
      rows: items.map((p) => {
        const part = data.parts.find((r) => r.id === p.required_part_id),
          j = data.jobs.find((j) => j.id === p.service_job_id),
          paid = paidFor(data.cash, "SUPPLIER_PURCHASE", p.id);
        const metadata =
          supplier || job
            ? [
                ["OEM", p.part_code_oem],
                ["Qeyd", p.replacement_of ? null : p.notes],
              ]
                .filter(([, v]) => v)
                .map(([label, v]) => `${label}: ${v}`)
                .join(" · ")
            : "";
        return {
          id: p.id,
          cells: {
            date: formatReportDate(p.purchase_date),
            vehicle: j?.vehicles?.plate || "-",
            part:
              partTitle(p) +
              (part?.is_additional || !p.required_part_id ? " (əlavə)" : ""),
            quantity: formatQuantity(p.quantity),
            unit: p.unit_name ?? part?.unit_catalog?.name ?? "Ədəd",
            supplier:
              p.source_type === "SUPPLIER"
                ? supplierDisplayName(p.suppliers)
                : reportPurchaseSourceLabels[p.source_type],
            status: purchaseLifecycleLabel(p),
            reference: (p.document_no || "-").replace(
              /([^\s]{10})(?=\S)/g,
              "$1\n",
            ),
            cost: money(Number(p.total_price)),
            returned: money(Number(p.returned ?? 0)),
            credit: money(Number(p.credit_created ?? 0)),
            applied: money(Number(p.credit_applied ?? 0)),
            paid: money(paid),
            due: money(purchaseDue(p, data.cash)),
          },
          ...(metadata
            ? { details: [{ label: "Əlavə", value: metadata }] }
            : {}),
        };
      }),
    },
  });
  const selected = new Set(items.map((p) => p.id));
  const events = [
    ...(data.purchaseReturns ?? [])
      .filter((r) => selected.has(r.purchase_id))
      .map((r) => ({
        id: r.id,
        date: r.occurred_at,
        type: r.replacement_purchase_id ? "Dəyişdirmə" : "Qaytarma",
        item: partTitle(data.purchases.find((p) => p.id === r.purchase_id)),
        amount: r.amount,
        quantity: formatQuantity(r.quantity),
        reference: [r.reason, r.reference_number].filter(Boolean).join(" · "),
      })),
    ...(data.supplierCredits ?? [])
      .filter(
        (a) =>
          selected.has(a.purchase_id) ||
          (data.purchaseReturns ?? []).some(
            (r) => r.id === a.return_id && selected.has(r.purchase_id),
          ),
      )
      .map((a) => ({
        id: a.id,
        date: a.created_at,
        type: "Kredit tətbiqi (pul deyil)",
        item: partTitle(data.purchases.find((p) => p.id === a.purchase_id)),
        amount: a.amount,
        quantity: "-",
        reference: "",
      })),
    ...data.cash
      .filter(
        (t) =>
          t.counterparty_details?.payment_kind === "SUPPLIER_REFUND" &&
          (data.purchaseReturns ?? []).some(
            (r) =>
              r.id === t.counterparty_details?.return_id &&
              selected.has(r.purchase_id),
          ),
      )
      .map((t) => ({
        id: t.id,
        date: t.occurred_at || t.transaction_date,
        type: t.voided_at
          ? "Geri ödəniş ləğv edilib"
          : "Təchizatçıdan geri ödəniş",
        item: partTitle(
          data.purchases.find(
            (p) => p.id === t.counterparty_details?.purchase_id,
          ),
        ),
        amount: t.amount,
        quantity: "-",
        reference: t.reference_number || "",
      })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (events.length)
    report.sections.push({
      title: "Qaytarma / dəyişdirmə tarixçəsi",
      table: {
        columns: [
          { key: "date", label: "Tarix", width: 12 },
          { key: "type", label: "Əməliyyat", width: 23 },
          { key: "item", label: "Detal", width: 18 },
          { key: "quantity", label: "Miqdar", width: 5 },
          { key: "amount", label: "Məbləğ (AZN)", width: 12, align: "right" },
          { key: "reference", label: "Səbəb / sənəd", width: 30 },
        ],
        rows: events.map((e) => ({
          id: e.id,
          cells: {
            date: formatReportDate(e.date),
            type: e.type,
            item: e.item,
            quantity: e.quantity,
            amount: money(e.amount),
            reference: e.reference.replace(/([^\s]{20})(?=\S)/g, "$1\n"),
          },
        })),
      },
    });
  return report;
}
