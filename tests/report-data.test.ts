import { describe, expect, it } from "vitest";
import { buildPrimeReport } from "@/lib/reports/report-data";
import type { DbPurchase, DbServiceJob, DbWorkItem, DbWorker } from "@/lib/supabase/queries";

const job: DbServiceJob = {
  id: "job-1",
  vehicle_id: "vehicle-1",
  job_no: "PR-001",
  customer_name: "Əli Əliyev",
  customer_phone: "+994",
  funding_source: "INSURANCE_CLAIM",
  insurance_company: "PRIME Sığorta",
  insurance_claim_no: "CL-1",
  insurance_approved_amount: 5000,
  agreed_budget: 5000,
  status: "WAITING_PARTS",
  received_at: "2026-09-07",
  target_delivery_date: null,
  delivered_at: null,
  notes: "Ban/kuzov geometriyasının ölçülməsi",
  archived_at: null,
  vehicles: {
    id: "vehicle-1",
    plate: "10-PR-030",
    make: "BMW",
    model: "F30",
    vehicle_type: null,
    body_type: null,
    manufacturer: null,
    production_year: 2015,
    first_registration_date: null,
    vin_body_number: "VIN123",
    chassis_number: null,
    engine_number: null,
    engine_power_hp: null,
    engine_power_kw: null,
    color: "Qara",
    registration_certificate_series_no: null,
    registration_valid_until: null,
    max_permitted_mass_kg: null,
    unladen_mass_kg: null,
    registered_owner_full_name: "Çingiz Məmmədov",
    registered_owner_address: null,
    notes: null
  }
};

const worker: DbWorker = {
  id: "worker-1",
  first_name: "Şahin",
  last_name: "Hüseynov",
  father_name: null,
  phone: "+994",
  role_id: "role-1",
  active: true,
  hire_date: "2026-09-07",
  notes: null,
  worker_roles: { id: "role-1", name: "Usta" }
};

const workItem: DbWorkItem = {
  id: "work-1",
  service_job_id: "job-1",
  work_catalog_id: "catalog-1",
  custom_title: "Qapı, qanad, kapot və baqaj boşluqlarının sazlanması",
  assigned_worker_id: "worker-1",
  status: "DONE",
  labor_cost: 1500,
  notes: "Kəmər və roliklərin dəyişdirilməsi",
  planned_at: "2026-09-07",
  started_at: "2026-09-07",
  completed_at: "2026-09-08",
  work_catalog: { id: "catalog-1", category: "Kuzov", name: "Kuzov işi" },
  workers: { id: "worker-1", first_name: "Şahin", last_name: "Hüseynov", role_id: "role-1" }
};

const purchase: DbPurchase = {
  id: "purchase-1",
  service_job_id: "job-1",
  part_catalog_id: null,
  custom_item_name: "Kəmər dəsti",
  quantity: 1,
  unit_price: 1200,
  total_price: 1200,
  source_type: "SUPPLIER",
  supplier_id: "supplier-1",
  purchased_by_worker_id: null,
  purchased_by_admin: true,
  payment_status: "UNPAID",
  paid_amount: 0,
  part_code_oem: "OEM-1",
  brand_model: null,
  serial_no: null,
  document_no: "INV-1",
  purchase_date: "2026-09-07",
  notes: null,
  part_catalog: null,
  suppliers: { id: "supplier-1", company_name: "Təchizatçı MMC", shop_name: null, first_name: null, last_name: null, father_name: null },
  workers: null
};

describe("report data model", () => {
  it("builds workers report with each worker's full work history", () => {
    const report = buildPrimeReport("workers", { jobs: [job], purchases: [purchase], workItems: [workItem], workers: [worker], suppliers: [] });
    expect(report.title).toBe("İşçilər hesabatı");
    expect(report.sections[0].title).toBe("Şahin Hüseynov");
    expect(report.sections[0].table?.rows).toHaveLength(1);
    expect(report.sections[0].table?.rows[0].cells.status).toBe("Tamamlanıb");
    expect(report.sections[0].table?.rows[0].cells.labor).toBe("1 500,00 AZN");
  });

  it("calculates overview costs and keeps localized report labels", () => {
    const report = buildPrimeReport("overview", { jobs: [job], purchases: [purchase], workItems: [workItem], workers: [worker], suppliers: [] });
    expect(report.summary.find((item) => item.label === "Ümumi xərclər")?.value).toBe("2 700,00 AZN");
    expect(report.sections[0].table?.rows[0].cells.status).toBe("Detal gözləyir");
    expect(report.sections[0].table?.rows[0].cells.source).toBe("Sığorta hadisəsi üzrə");
  });
});
