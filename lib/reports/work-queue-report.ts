import { selectQueueWork, type WorkQueue } from "@/lib/work-queue";
import type { WorkshopFilters } from "@/lib/filters";
import type { PrimeReport } from "@/lib/reports/report-types";
import {
  formatReportDate as date,
  formatReportDateTime,
  reportWorkStatusLabels,
  reportFundingLabels,
} from "@/lib/reports/report-format";

export function workQueueReport(
  data: WorkQueue,
  f: WorkshopFilters,
): PrimeReport {
  const rows = selectQueueWork(data, f);
  const workerName = (id: string | null) => {
    const w = data.workers.find((w) => w.id === id);
    return w ? `${w.first_name} ${w.last_name}` : "Təyin edilməyib";
  };
  return {
    scope: "work",
    documentContext: [
      data.jobs.find((j) => j.id === f.job)?.vehicles?.plate || f.plate,
      f.worker ? workerName(f.worker) : "",
      reportWorkStatusLabels[f.status as keyof typeof reportWorkStatusLabels] ||
        "",
      f.from,
      f.to,
    ],
    title: "Görüləcək işlər hesabatı",
    generatedAt: formatReportDateTime(),
    orientation: "landscape",
    filters: [
      `Dövr: ${date(f.from) || "Əvvəldən"} - ${date(f.to) || "Bu günədək"}`,
      f.plate && `Avtomobil: ${f.plate}`,
      f.job &&
        `Servis kartı: ${data.jobs.find((j) => j.id === f.job)?.job_no || "Seçilmiş kart"}`,
      f.worker && `Usta: ${workerName(f.worker)}`,
      f.status &&
        `Status: ${reportWorkStatusLabels[f.status as keyof typeof reportWorkStatusLabels] || "Digər"}`,
      f.source &&
        `Mənbə: ${reportFundingLabels[f.source as keyof typeof reportFundingLabels] || "Digər"}`,
      f.work &&
        `İş: ${data.work.find((w) => w.work_catalog_id === f.work)?.work_catalog?.name || "Seçilmiş iş"}`,
    ]
      .filter(Boolean)
      .join(" | "),
    summary: [
      { label: "İş sayı", value: String(rows.length) },
      ...Object.entries(reportWorkStatusLabels).map(([status, label]) => ({
        label,
        value: String(rows.filter((w) => w.status === status).length),
      })),
    ],
    sections: [
      {
        title: "İş siyahısı",
        table: {
          columns: [
            "Avtomobil",
            "Müştəri",
            "İş",
            "Usta",
            "Status",
            "Plan tarixi",
            "Qeyd",
          ].map((label, i) => ({
            key: String(i),
            label,
            width: [12, 14, 20, 14, 11, 10, 19][i],
          })),
          rows: rows.map((w) => {
            const j = data.jobs.find((j) => j.id === w.service_job_id);
            const note = (w.notes || "-").replace(/\s+/g, " ").trim();
            return {
              id: w.id,
              cells: {
                "0": j?.vehicles?.plate || "-",
                "1": j?.customer_name || "-",
                "2": w.custom_title || w.work_catalog?.name || "Digər iş",
                "3": workerName(w.assigned_worker_id),
                "4": reportWorkStatusLabels[w.status],
                "5": date(w.planned_at) || "-",
                "6": note.length > 72 ? `${note.slice(0, 69)}...` : note,
              },
            };
          }),
        },
      },
    ],
  };
}
