import type { WorkshopData } from "@/lib/supabase/workshop";
import { selectPurchases } from "@/lib/supabase/workshop";
import {
  partTitle,
  supplierDisplayName,
  workerDisplayName,
} from "@/lib/supabase/queries";
import type { WorkshopFilters } from "@/lib/filters";
import { formatQuantity } from "@/lib/decimal";
import { paidFor, purchaseCost, sumMoney, subtractMoney } from "@/lib/workshop";
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
  const items = selectPurchases(data, f),
    supplier = data.suppliers.find((s) => s.id === f.supplier),
    job = data.jobs.find((j) => j.id === f.job);
  const money = (n: number) => formatReportMoney(n).replace(/ AZN$/, "");
  const columns: ReportTableColumn[] = [
    { key: "date", label: "Tarix", width: 8 },
    ...(!job ? [{ key: "vehicle", label: "Avtomobil", width: 10 }] : []),
    { key: "part", label: "Detal", width: 17 },
    { key: "quantity", label: "Miqdar / vahid", width: 8 },
    ...(!supplier ? [{ key: "supplier", label: "Təchizatçı", width: 11 }] : []),
    { key: "buyer", label: "Alıcı", width: 11 },
    ...[
      ["quote", "Müştəri qiyməti"],
      ["cost", "Maya"],
      ["margin", "Marja"],
      ["paid", "Ödənilib"],
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
      value: formatReportMoney(sumMoney(items.map(purchaseCost))),
    },
    {
      label: "Ödənilib",
      value: formatReportMoney(
        sumMoney(
          items.map((p) => paidFor(data.cash, "SUPPLIER_PURCHASE", p.id)),
        ),
      ),
    },
    {
      label: "Qalıq borc",
      value: formatReportMoney(
        sumMoney(
          items
            .filter((p) => p.source_type === "SUPPLIER")
            .map((p) =>
              subtractMoney(
                purchaseCost(p),
                paidFor(data.cash, "SUPPLIER_PURCHASE", p.id),
              ),
            ),
        ),
      ),
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
          cost = purchaseCost(p),
          paid = paidFor(data.cash, "SUPPLIER_PURCHASE", p.id);
        const metadata =
          supplier || job
            ? [
                ["Qaimə", p.document_no],
                ["OEM", p.part_code_oem],
                ["Qeyd", p.notes],
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
            quantity: `${formatQuantity(part?.quantity ?? p.quantity)} ${part?.unit_catalog?.name ?? "Ədəd"}`,
            supplier:
              p.source_type === "SUPPLIER"
                ? supplierDisplayName(p.suppliers)
                : reportPurchaseSourceLabels[p.source_type],
            buyer: p.purchased_by_admin
              ? "Administrator"
              : workerDisplayName(p.workers),
            quote: part ? money(part.quoted_price) : "-",
            cost: money(cost),
            margin: part ? money(subtractMoney(part.quoted_price, cost)) : "-",
            paid: money(paid),
            due: money(
              p.source_type === "SUPPLIER" ? subtractMoney(cost, paid) : 0,
            ),
          },
          ...(metadata
            ? { details: [{ label: "Əlavə", value: metadata }] }
            : {}),
        };
      }),
    },
  });
  return report;
}
