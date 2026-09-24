import type { DbServiceJob, DbWorkItem } from "@/lib/supabase/queries";
import { workTitle } from "@/lib/supabase/queries";
import type { RequiredPart } from "@/lib/workshop";
import { sumMoney, missingValue } from "@/lib/workshop";
import { formatQuantity } from "@/lib/decimal";
import {
  formatReportDate as date,
  formatReportDateTime,
  formatReportMoney as money,
} from "./report-format";
import type { PrimeReport, ReportField, ReportTable } from "./report-types";

export function customerQuotation(
  job: DbServiceJob,
  works: DbWorkItem[],
  parts: RequiredPart[],
): PrimeReport {
  works = works.filter((row) => !row.is_additional);
  parts = parts.filter((row) => !row.is_additional);
  const fields: ReportField[] = [];
  const add = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== "")
      fields.push({ label, value: String(value) });
  };
  const car = job.vehicles;
  add("İş №", job.job_no);
  add("Qəbul tarixi", date(job.received_at));
  add("Marka / Model", [car?.make, car?.model].filter(Boolean).join(" "));
  add("D.Q.N.", car?.plate);
  add("Ban / Şassi", car?.vin_body_number || car?.chassis_number);
  add("Rəngi", car?.color);
  add("Buraxılış ili", car?.production_year);
  add("Müştəri", job.customer_name);
  add("Əlaqə", job.customer_phone);
  add("Hədəf təhvil tarixi", date(job.target_delivery_date));
  const insurance = job.funding_source === "INSURANCE_CLAIM";
  if (insurance) add("Sığorta", job.insurance_company);
  const total = (rows: (DbWorkItem | RequiredPart)[]) =>
    job.has_line_quotes && rows.every((row) => row.quoted_price != null)
      ? money(sumMoney(rows.map((row) => row.quoted_price)))
      : missingValue;
  const quotationTotal = total([...parts, ...works]);
  // Explicit customer-only projection: never spread source records into a document.
  const lines = (
    rows: (DbWorkItem | RequiredPart)[],
    kind: "work" | "part",
  ): ReportTable => ({
    columns: [
      "№",
      kind === "part"
        ? "Material və ehtiyat hissələri"
        : "Görüləcək işlərin adı",
      "Ölçü vahidi",
      "Miqdar",
      "Vahid qiyməti (AZN)",
      "Məbləğ (AZN)",
      "Qeyd",
    ].map((label, i) => ({
      key: String(i),
      label,
      width: [4, 27, 10, 7, 12, 12, 28][i],
      align: i >= 3 && i <= 5 ? "right" : "left",
    })),
    rows: rows.map((row, i) => ({
      id: String(i + 1),
      cells: {
        "0": String(i + 1),
        "1":
          kind === "work"
            ? workTitle(row as DbWorkItem)
            : (row as RequiredPart).part_catalog?.name || "Detal",
        "2": row.unit_catalog?.name || (kind === "work" ? "Xidmət" : "Ədəd"),
        "3": formatQuantity(row.quantity ?? 1),
        "4":
          row.customer_unit_price == null && row.quoted_price == null
            ? "-"
            : money(row.customer_unit_price ?? row.quoted_price).replace(
                / AZN$/,
                "",
              ),
        "5":
          row.quoted_price == null
            ? "-"
            : money(row.quoted_price).replace(/ AZN$/, ""),
        "6": row.notes || "-",
      },
    })),
  });
  return {
    scope: "quotation",
    title: "AVTONƏQLİYYAT VASİTƏSİNİN TƏMİRİ ÜZRƏ QİYMƏT TƏKLİFİ",
    generatedAt: formatReportDateTime(),
    orientation: "portrait",
    summary: [],
    sections: [
      { title: "Avtomobil və müştəri", fields },
      { title: "Material və ehtiyat hissələri", table: lines(parts, "part") },
      { title: "Görüləcək işlər", table: lines(works, "work") },
      {
        title: "Yekun",
        keepTogether: true,
        summary: [
          {
            label: "Ehtiyat hissələri cəmi",
            value: total(parts),
          },
          {
            label: "İşçilik cəmi",
            value: total(works),
          },
          {
            label: "Yekun məbləğ",
            value: quotationTotal,
          },
          ...(insurance && job.insurance_approved_amount != null
            ? [
                {
                  label: "Sığorta tərəfindən təsdiqlənmiş",
                  value: money(job.insurance_approved_amount),
                },
              ]
            : []),
        ],
        paragraphs: [
          `Zərər dəymiş avtonəqliyyat vasitəsinə baxış keçirdikdən və apardığımız təhlil və hesablamalardan sonra məlum oldu ki, ____________________________ nəticəsində ____________________________ dəymiş zərərin həcmi ${quotationTotal === missingValue ? "__________________ AZN" : quotationTotal} təşkil edir.`,
          "Biz, aşağıda imza edənlər, öz imzalarımızla təsdiq edirik ki:",
        ],
        bullets: [
          "Aparılan tədqiqatlar, deyilən fikirlər və alınan nəticələr hesabatda ehtimal və məhdudiyyət şərtləri çərçivəsində etibarlıdır və bizim şəxsi, peşəkar tədqiqatlarımızın, fikirlərimizin və gəldiyimiz nəticələrin məhsuludur.",
          "Hesabatda göstərilən əmlak növlərinin dəyəri qiymətləndirmə tarixinə etibarlı hesab olunur.",
        ],
        signatures: ["Müştəri", "Servis nümayəndəsi", "Tarix"],
      },
    ],
  };
}
