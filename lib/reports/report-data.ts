import { dbFinancialSummary, dbPurchaseOutstanding, dbPurchaseTotal } from "@/lib/supabase/finance";
import {
  getJob,
  getJobs,
  getPurchases,
  getSuppliers,
  getWorkItems,
  getWorkers,
  partTitle,
  supplierDisplayName,
  workerDisplayName,
  workTitle,
  type DbPurchase,
  type DbServiceJob,
  type DbSupplier,
  type DbWorkItem,
  type DbWorker
} from "@/lib/supabase/queries";
import {
  dash,
  formatReportDate,
  formatReportDateTime,
  formatReportMoney,
  formatReportQuantity,
  reportFundingLabels,
  reportJobStatusLabels,
  reportPaymentLabels,
  reportPurchaseSourceLabels,
  reportWorkStatusLabels
} from "@/lib/reports/report-format";
import type { PrimeReport, ReportField, ReportScope, ReportSection, ReportSummaryItem, ReportTableColumn, ReportTableRow } from "@/lib/reports/report-types";

type ReportSource = {
  jobs: DbServiceJob[];
  purchases: DbPurchase[];
  workItems: DbWorkItem[];
  workers: DbWorker[];
  suppliers: DbSupplier[];
};

export async function buildReportForScope(scope: ReportScope) {
  const [jobs, purchases, workItems, workers, suppliers] = await Promise.all([getJobs(), getPurchases(), getWorkItems(), getWorkers(), getSuppliers()]);
  return buildPrimeReport(scope, { jobs, purchases, workItems, workers, suppliers });
}

export async function buildVehicleReportForJob(jobId: string) {
  const job = await getJob(jobId);
  if (!job) return null;
  const [purchases, workItems, workers, suppliers] = await Promise.all([getPurchases(jobId), getWorkItems(jobId), getWorkers(), getSuppliers()]);
  return buildPrimeReport("vehicle", { jobs: [job], purchases, workItems, workers, suppliers });
}

export function buildPrimeReport(scope: ReportScope, source: ReportSource): PrimeReport {
  if (scope === "purchases") return buildPurchasesReport(source);
  if (scope === "workers") return buildWorkersReport(source);
  if (scope === "work") return buildWorkReport(source);
  if (scope === "vehicle") return buildVehicleReport(source);
  return buildOverviewReport(source);
}

function baseReport(scope: ReportScope, title: string, summary: ReportSummaryItem[], sections: ReportSection[], orientation: PrimeReport["orientation"] = "portrait"): PrimeReport {
  return { scope, title, generatedAt: formatReportDateTime(), summary, sections, orientation };
}

function buildOverviewReport({ jobs, purchases, workItems }: ReportSource) {
  const activeJobs = jobs.filter((job) => job.status !== "DELIVERED");
  const totals = activeJobs.reduce(
    (acc, job) => {
      const jobPurchases = purchasesForJob(purchases, job.id);
      const jobWork = workForJob(workItems, job.id);
      const financial = dbFinancialSummary(job.agreed_budget, jobPurchases, jobWork);
      acc.budget += job.agreed_budget;
      acc.parts += financial.partsCost;
      acc.labor += financial.laborCost;
      acc.cost += financial.totalCost;
      acc.outstanding += financial.unpaidSupplierAmount;
      acc.profit += financial.estimatedGrossProfit;
      acc.done += jobWork.filter((item) => item.status === "DONE").length;
      acc.totalWork += jobWork.length;
      return acc;
    },
    { budget: 0, parts: 0, labor: 0, cost: 0, outstanding: 0, profit: 0, done: 0, totalWork: 0 }
  );
  const summary: Array<[string, string]> = [
    ["Aktiv avtomobillər", String(activeJobs.length)],
    ["Razılaşdırılmış ümumi büdcə", formatReportMoney(totals.budget)],
    ["Detal xərcləri", formatReportMoney(totals.parts)],
    ["Əmək xərcləri", formatReportMoney(totals.labor)],
    ["Ümumi xərclər", formatReportMoney(totals.cost)],
    ["Ödənilməmiş alışlar", formatReportMoney(totals.outstanding)],
    ["Təxmini mənfəət", formatReportMoney(totals.profit)],
    ["İş progressi", `${totals.done} / ${totals.totalWork}`]
  ];
  return baseReport("overview", "İcmal hesabatı", pairs(summary), [
    {
      title: "Aktiv servis kartları",
      table: {
        columns: columns([
          ["plate", "Nömrə", 9],
          ["vehicle", "Marka/model", 13],
          ["customer", "Müştəri", 12],
          ["source", "Mənbə", 12],
          ["status", "Status", 10],
          ["budget", "Büdcə", 10],
          ["parts", "Detal", 9],
          ["labor", "Əmək", 9],
          ["cost", "Cəm xərc", 10],
          ["debt", "Borc", 9],
          ["profit", "Mənfəət", 10],
          ["progress", "İş", 7]
        ]),
        rows: activeJobs.map((job) => {
          const jobPurchases = purchasesForJob(purchases, job.id);
          const jobWork = workForJob(workItems, job.id);
          const financial = dbFinancialSummary(job.agreed_budget, jobPurchases, jobWork);
          const done = jobWork.filter((item) => item.status === "DONE").length;
          return row(job.id, {
            plate: dash(job.vehicles?.plate),
            vehicle: vehicleTitle(job),
            customer: dash(job.customer_name),
            source: reportFundingLabels[job.funding_source],
            status: reportJobStatusLabels[job.status],
            budget: formatReportMoney(job.agreed_budget),
            parts: formatReportMoney(financial.partsCost),
            labor: formatReportMoney(financial.laborCost),
            cost: formatReportMoney(financial.totalCost),
            debt: formatReportMoney(financial.unpaidSupplierAmount),
            profit: formatReportMoney(financial.estimatedGrossProfit),
            progress: `${done}/${jobWork.length}`
          }, presentFields([
            ["Qəbul tarixi", formatReportDate(job.received_at)],
            ["Hədəf təhvil tarixi", formatReportDate(job.target_delivery_date)],
            ["Qalan büdcə", formatReportMoney(financial.remainingBudget)]
          ]));
        })
      }
    }
  ], "landscape");
}

function buildPurchasesReport({ jobs, purchases }: ReportSource) {
  const total = purchases.reduce((sum, purchase) => sum + dbPurchaseTotal(purchase), 0);
  const paid = purchases.reduce((sum, purchase) => sum + purchase.paid_amount, 0);
  const outstanding = purchases.reduce((sum, purchase) => sum + dbPurchaseOutstanding(purchase), 0);
  const supplierCount = new Set(purchases.map((purchase) => purchase.supplier_id).filter(Boolean)).size;
  return baseReport("purchases", "Satınalma hesabatı", pairs([
    ["Alış sayı", String(purchases.length)],
    ["Ümumi alış məbləği", formatReportMoney(total)],
    ["Ödənilmiş məbləğ", formatReportMoney(paid)],
    ["Ödənilməmiş/qalıq məbləğ", formatReportMoney(outstanding)],
    ["Təchizatçı sayı", String(supplierCount)]
  ]), [
    {
      title: "Satınalma siyahısı",
      table: {
        columns: columns([
          ["date", "Tarix", 8],
          ["plate", "Nömrə", 9],
          ["vehicle", "Marka/model", 12],
          ["job", "Servis kartı", 10],
          ["part", "Detal/material", 18],
          ["qty", "Miqdar", 7],
          ["unit", "Vahid", 9],
          ["total", "Cəm", 9],
          ["source", "Mənbə", 11],
          ["supplier", "Təchizatçı", 13],
          ["payment", "Ödəniş", 10],
          ["paid", "Ödənilib", 9],
          ["outstanding", "Qalıq", 9],
          ["buyer", "Kim alıb", 11]
        ]),
        rows: purchases.map((purchase) => {
          const job = jobs.find((item) => item.id === purchase.service_job_id);
          return row(purchase.id, {
            date: formatReportDate(purchase.purchase_date),
            plate: dash(job?.vehicles?.plate),
            vehicle: vehicleTitle(job),
            job: dash(job?.job_no),
            part: partTitle(purchase),
            qty: formatReportQuantity(purchase.quantity),
            unit: formatReportMoney(purchase.unit_price),
            total: formatReportMoney(dbPurchaseTotal(purchase)),
            source: reportPurchaseSourceLabels[purchase.source_type],
            supplier: purchase.source_type === "SUPPLIER" ? supplierDisplayName(purchase.suppliers) : "-",
            payment: reportPaymentLabels[purchase.payment_status],
            paid: formatReportMoney(purchase.paid_amount),
            outstanding: formatReportMoney(dbPurchaseOutstanding(purchase)),
            buyer: purchase.purchased_by_admin ? "Mən / Administrator" : workerDisplayName(purchase.workers)
          }, presentFields([
            ["OEM kodu", purchase.part_code_oem],
            ["Brend/model", purchase.brand_model],
            ["Serial nömrəsi", purchase.serial_no],
            ["Qaimə/sənəd", purchase.document_no],
            ["Qeyd", purchase.notes]
          ]));
        })
      }
    }
  ], "landscape");
}

function buildWorkersReport({ workers, workItems, jobs }: ReportSource) {
  const activeItems = workItems.filter((item) => item.status !== "DONE" && item.status !== "CANCELLED");
  const doneItems = workItems.filter((item) => item.status === "DONE");
  const summary = pairs([
    ["İşçi sayı", String(workers.length)],
    ["Aktiv işçilər", String(workers.filter((worker) => worker.active).length)],
    ["Aktiv tapşırıqlar", String(activeItems.length)],
    ["Tamamlanmış işlər", String(doneItems.length)],
    ["Ümumi əmək dəyəri", formatReportMoney(doneItems.reduce((sum, item) => sum + item.labor_cost, 0))]
  ]);
  return baseReport("workers", "İşçilər hesabatı", summary, workers.map((worker) => {
    const items = workItems.filter((item) => item.assigned_worker_id === worker.id);
    const active = items.filter((item) => item.status !== "DONE" && item.status !== "CANCELLED");
    const done = items.filter((item) => item.status === "DONE");
    const cancelled = items.filter((item) => item.status === "CANCELLED");
    return {
      title: workerDisplayName(worker),
      fields: presentFields([
        ["Ad, soyad, ata adı", [worker.first_name, worker.last_name, worker.father_name].filter(Boolean).join(" ")],
        ["İxtisas / rol", worker.worker_roles?.name],
        ["Telefon", worker.phone],
        ["Status", worker.active ? "Aktiv" : "Qeyri-aktiv"],
        ["İşə başlama tarixi", formatReportDate(worker.hire_date)]
      ]),
      summary: pairs([
        ["Aktiv tapşırıq sayı", String(active.length)],
        ["Tamamlanan iş sayı", String(done.length)],
        ["Ləğv edilmiş iş sayı", String(cancelled.length)],
        ["Ümumi əmək dəyəri", formatReportMoney(done.reduce((sum, item) => sum + item.labor_cost, 0))]
      ]),
      table: {
        columns: columns([
          ["plate", "Avtomobil nömrəsi", 10],
          ["vehicle", "Marka/model", 12],
          ["job", "Servis kartı", 10],
          ["work", "Görülən iş", 23],
          ["category", "Kateqoriya", 12],
          ["status", "Status", 10],
          ["labor", "Əmək dəyəri", 10],
          ["planned", "Plan", 9],
          ["started", "Başlama", 9],
          ["completed", "Tamamlanma", 9]
        ]),
        rows: items.map((item) => {
          const job = jobs.find((candidate) => candidate.id === item.service_job_id);
          return row(item.id, {
            plate: dash(job?.vehicles?.plate),
            vehicle: vehicleTitle(job),
            job: dash(job?.job_no),
            work: workTitle(item),
            category: dash(item.work_catalog?.category),
            status: reportWorkStatusLabels[item.status],
            labor: formatReportMoney(item.labor_cost),
            planned: formatReportDate(item.planned_at),
            started: formatReportDate(item.started_at),
            completed: formatReportDate(item.completed_at)
          }, presentFields([["Qeyd", item.notes]]));
        })
      }
    };
  }), "landscape");
}

function buildWorkReport({ jobs, workItems }: ReportSource) {
  const summary = pairs([
    ["Ümumi iş sayı", String(workItems.length)],
    ["Gözləyən", String(workItems.filter((item) => item.status === "TODO").length)],
    ["İcra olunan", String(workItems.filter((item) => item.status === "IN_PROGRESS").length)],
    ["Tamamlanan", String(workItems.filter((item) => item.status === "DONE").length)],
    ["Ləğv edilən", String(workItems.filter((item) => item.status === "CANCELLED").length)],
    ["Ümumi əmək dəyəri", formatReportMoney(workItems.filter((item) => item.status !== "CANCELLED").reduce((sum, item) => sum + item.labor_cost, 0))]
  ]);
  return baseReport("work", "Görüləcək işlər hesabatı", summary, [
    {
      title: "İş siyahısı",
      table: {
        columns: columns([
          ["plate", "Avtomobil nömrəsi", 10],
          ["vehicle", "Marka/model", 13],
          ["job", "Servis kartı", 10],
          ["work", "İş", 25],
          ["category", "Kateqoriya", 12],
          ["worker", "Usta", 12],
          ["status", "Status", 10],
          ["labor", "Əmək", 9],
          ["planned", "Planlaşdırılıb", 9],
          ["started", "Başlanıb", 9],
          ["completed", "Tamamlanıb", 9]
        ]),
        rows: workItems.map((item) => {
          const job = jobs.find((candidate) => candidate.id === item.service_job_id);
          return row(item.id, {
            plate: dash(job?.vehicles?.plate),
            vehicle: vehicleTitle(job),
            job: dash(job?.job_no),
            work: workTitle(item),
            category: dash(item.work_catalog?.category),
            worker: workerDisplayName(item.workers),
            status: reportWorkStatusLabels[item.status],
            labor: formatReportMoney(item.labor_cost),
            planned: formatReportDate(item.planned_at),
            started: formatReportDate(item.started_at),
            completed: formatReportDate(item.completed_at)
          }, presentFields([["Qeyd", item.notes]]));
        })
      }
    }
  ], "landscape");
}

function buildVehicleReport({ jobs, purchases, workItems }: ReportSource) {
  const job = jobs[0];
  if (!job) return baseReport("vehicle", "Servis kartı hesabatı", [], []);
  const vehicle = job.vehicles;
  const financial = dbFinancialSummary(job.agreed_budget, purchases, workItems);
  return baseReport("vehicle", "Servis kartı hesabatı", pairs([
    ["Dövlət qeydiyyat nişanı", dash(vehicle?.plate)],
    ["Marka/model", vehicleTitle(job)],
    ["Servis kartı", dash(job.job_no)],
    ["Status", reportJobStatusLabels[job.status]],
    ["Razılaşdırılmış büdcə", formatReportMoney(job.agreed_budget)],
    ["Ümumi xərc", formatReportMoney(financial.totalCost)],
    ["Ödənilməmiş borc", formatReportMoney(financial.unpaidSupplierAmount)],
    ["Təxmini mənfəət", formatReportMoney(financial.estimatedGrossProfit)]
  ]), [
    {
      title: "Servis kartı",
      fields: presentFields([
        ["Dövlət qeydiyyat nişanı", vehicle?.plate],
        ["Marka/model", vehicleTitle(job)],
        ["Job no", job.job_no],
        ["Status", reportJobStatusLabels[job.status]],
        ["Qəbul tarixi", formatReportDate(job.received_at)],
        ["Hədəf təhvil tarixi", formatReportDate(job.target_delivery_date)],
        ["Təhvil tarixi", formatReportDate(job.delivered_at)],
        ["Qeyd", job.notes]
      ])
    },
    {
      title: "Müştəri",
      fields: presentFields([
        ["Müştərinin adı", job.customer_name],
        ["Telefon", job.customer_phone],
        ["Maliyyələşmə/mənbə", reportFundingLabels[job.funding_source]],
        ["Sığorta şirkəti", job.insurance_company],
        ["Sığorta işi/claim nömrəsi", job.insurance_claim_no],
        ["Təsdiqlənmiş məbləğ", job.insurance_approved_amount === null ? "" : formatReportMoney(job.insurance_approved_amount)]
      ])
    },
    {
      title: "Qeydiyyat məlumatları",
      fields: presentFields([
        ["VIN / ban", vehicle?.vin_body_number],
        ["Şassi", vehicle?.chassis_number],
        ["Mühərrik nömrəsi", vehicle?.engine_number],
        ["Buraxılış ili", vehicle?.production_year],
        ["Rəng", vehicle?.color],
        ["Mühərrik gücü", vehicle?.engine_power_hp ? `${vehicle.engine_power_hp} hp${vehicle.engine_power_kw ? ` / ${vehicle.engine_power_kw} kW` : ""}` : ""],
        ["Qeydiyyat şəhadətnaməsi", vehicle?.registration_certificate_series_no],
        ["Qeydiyyat sahibinin adı", vehicle?.registered_owner_full_name],
        ["Ünvan", vehicle?.registered_owner_address],
        ["Qeyd", vehicle?.notes]
      ])
    },
    workSection(workItems, jobs),
    purchasesSection(purchases, jobs),
    {
      title: "Maliyyə yekunu",
      summary: pairs([
        ["Razılaşdırılmış büdcə", formatReportMoney(job.agreed_budget)],
        ["Detal xərci", formatReportMoney(financial.partsCost)],
        ["Əmək xərci", formatReportMoney(financial.laborCost)],
        ["Ümumi xərc", formatReportMoney(financial.totalCost)],
        ["Təchizatçılara ödənilmiş", formatReportMoney(financial.totalPaidToSuppliers)],
        ["Ödənilməmiş borc", formatReportMoney(financial.unpaidSupplierAmount)],
        ["Qalan büdcə", formatReportMoney(financial.remainingBudget)],
        ["Təxmini mənfəət", formatReportMoney(financial.estimatedGrossProfit)]
      ])
    }
  ], "portrait");
}

function workSection(workItems: DbWorkItem[], jobs: DbServiceJob[]): ReportSection {
  return {
    title: "Görülən / planlaşdırılan işlər",
    table: {
      columns: columns([
        ["work", "İş", 27],
        ["status", "Status", 13],
        ["worker", "Usta", 15],
        ["labor", "Əmək dəyəri", 12],
        ["planned", "Planlaşdırılma", 11],
        ["started", "Başlama", 11],
        ["completed", "Tamamlanma", 11]
      ]),
      rows: workItems.map((item) => row(item.id, {
        work: workTitle(item),
        status: reportWorkStatusLabels[item.status],
        worker: workerDisplayName(item.workers),
        labor: formatReportMoney(item.labor_cost),
        planned: formatReportDate(item.planned_at),
        started: formatReportDate(item.started_at),
        completed: formatReportDate(item.completed_at)
      }, presentFields([["Servis kartı", dash(jobs.find((job) => job.id === item.service_job_id)?.job_no)], ["Qeyd", item.notes]])))
    }
  };
}

function purchasesSection(purchases: DbPurchase[], jobs: DbServiceJob[]): ReportSection {
  return {
    title: "Satınalmalar",
    table: {
      columns: columns([
        ["part", "Detal", 22],
        ["qty", "Miqdar", 8],
        ["unit", "Vahid", 11],
        ["total", "Cəm", 11],
        ["source", "Mənbə", 14],
        ["supplier", "Təchizatçı", 14],
        ["payment", "Ödəniş", 11],
        ["paid", "Ödənilib", 11],
        ["outstanding", "Qalıq", 11],
        ["buyer", "Kim alıb", 12],
        ["date", "Tarix", 9]
      ]),
      rows: purchases.map((purchase) => row(purchase.id, {
        part: partTitle(purchase),
        qty: formatReportQuantity(purchase.quantity),
        unit: formatReportMoney(purchase.unit_price),
        total: formatReportMoney(dbPurchaseTotal(purchase)),
        source: reportPurchaseSourceLabels[purchase.source_type],
        supplier: purchase.source_type === "SUPPLIER" ? supplierDisplayName(purchase.suppliers) : "-",
        payment: reportPaymentLabels[purchase.payment_status],
        paid: formatReportMoney(purchase.paid_amount),
        outstanding: formatReportMoney(dbPurchaseOutstanding(purchase)),
        buyer: purchase.purchased_by_admin ? "Mən / Administrator" : workerDisplayName(purchase.workers),
        date: formatReportDate(purchase.purchase_date)
      }, presentFields([
        ["Servis kartı", dash(jobs.find((job) => job.id === purchase.service_job_id)?.job_no)],
        ["OEM / sənəd", [purchase.part_code_oem, purchase.document_no].filter(Boolean).join(" / ")],
        ["Brend/model", purchase.brand_model],
        ["Serial nömrəsi", purchase.serial_no],
        ["Qeyd", purchase.notes]
      ])))
    }
  };
}

function pairs(items: Array<[string, string]>): ReportSummaryItem[] {
  return items.map(([label, value]) => ({ label, value }));
}

function columns(items: Array<[string, string, number]>): ReportTableColumn[] {
  return items.map(([key, label, width]) => ({ key, label, width }));
}

function row(id: string, cells: Record<string, string>, details?: ReportField[]): ReportTableRow {
  return { id, cells, details: details?.length ? details : undefined };
}

function presentFields(items: Array<[string, string | number | null | undefined]>): ReportField[] {
  return items
    .map(([label, value]) => ({ label, value: value === null || value === undefined ? "" : String(value).trim() }))
    .filter((item) => item.value && item.value !== "-");
}

function purchasesForJob(purchases: DbPurchase[], jobId: string) {
  return purchases.filter((purchase) => purchase.service_job_id === jobId);
}

function workForJob(workItems: DbWorkItem[], jobId: string) {
  return workItems.filter((item) => item.service_job_id === jobId);
}

function vehicleTitle(job?: DbServiceJob) {
  return dash([job?.vehicles?.make, job?.vehicles?.model].filter(Boolean).join(" "));
}
