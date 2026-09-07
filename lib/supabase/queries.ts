import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FundingSource, JobStatus, PaymentStatus, PurchaseSource, WorkStatus } from "@/lib/types";

export type DbVehicle = {
  id: string;
  plate: string;
  make: string;
  model: string;
  vehicle_type: string | null;
  body_type: string | null;
  manufacturer: string | null;
  production_year: number | null;
  first_registration_date: string | null;
  vin_body_number: string | null;
  chassis_number: string | null;
  engine_number: string | null;
  engine_power_hp: number | null;
  engine_power_kw: number | null;
  color: string | null;
  registration_certificate_series_no: string | null;
  registration_valid_until: string | null;
  max_permitted_mass_kg: number | null;
  unladen_mass_kg: number | null;
  registered_owner_full_name: string | null;
  registered_owner_address: string | null;
  notes: string | null;
};

export type DbServiceJob = {
  id: string;
  vehicle_id: string;
  job_no: string;
  customer_name: string | null;
  customer_phone: string | null;
  funding_source: FundingSource;
  insurance_company: string | null;
  insurance_claim_no: string | null;
  insurance_approved_amount: number | null;
  agreed_budget: number;
  status: JobStatus;
  received_at: string;
  target_delivery_date: string | null;
  delivered_at: string | null;
  notes: string | null;
  archived_at: string | null;
  vehicles?: DbVehicle;
};

export type DbWorkItem = {
  id: string;
  service_job_id: string;
  work_catalog_id: string | null;
  custom_title: string | null;
  assigned_worker_id: string | null;
  status: WorkStatus;
  labor_cost: number;
  notes: string | null;
  planned_at: string;
  started_at: string | null;
  completed_at: string | null;
  work_catalog?: { id: string; category: string; name: string } | null;
  workers?: { id: string; first_name: string; last_name: string; role_id: string } | null;
};

export type DbPurchase = {
  id: string;
  service_job_id: string;
  part_catalog_id: string | null;
  custom_item_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  source_type: PurchaseSource;
  supplier_id: string | null;
  purchased_by_worker_id: string | null;
  purchased_by_admin: boolean;
  payment_status: PaymentStatus;
  paid_amount: number;
  part_code_oem: string | null;
  brand_model: string | null;
  serial_no: string | null;
  document_no: string | null;
  purchase_date: string;
  notes: string | null;
  part_catalog?: { id: string; name: string; category: string } | null;
  suppliers?: { id: string; company_name: string | null; shop_name: string | null; first_name: string | null; last_name: string | null; father_name: string | null } | null;
  workers?: { id: string; first_name: string; last_name: string } | null;
};

export type DbSupplier = {
  id: string;
  entity_type: "INDIVIDUAL" | "LEGAL_ENTITY";
  first_name: string | null;
  last_name: string | null;
  father_name: string | null;
  company_name: string | null;
  shop_name: string | null;
  tax_id_voen: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
};

export type DbWorker = {
  id: string;
  first_name: string;
  last_name: string;
  father_name: string | null;
  phone: string | null;
  role_id: string;
  active: boolean;
  hire_date: string | null;
  notes: string | null;
  worker_roles?: { id: string; name: string } | null;
};

export type DbWorkCatalog = { id: string; code: string; category: string; name: string; active: boolean; sort_order: number };
export type DbPartCatalog = { id: string; category: string; name: string; active: boolean; sort_order: number };
export type DbWorkerRole = { id: string; name: string; active: boolean; sort_order: number };

export async function getAuthedSupabase() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase env dəyişənləri yoxdur.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessiya tapılmadı.");
  return { supabase, user: data.user };
}

export async function getJobs() {
  const { supabase } = await getAuthedSupabase();
  const { data, error } = await supabase
    .from("service_jobs")
    .select("*, vehicles(*)")
    .is("archived_at", null)
    .order("received_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbServiceJob[];
}

export async function getJob(jobId: string) {
  const { supabase } = await getAuthedSupabase();
  const { data, error } = await supabase
    .from("service_jobs")
    .select("*, vehicles(*)")
    .eq("id", jobId)
    .is("archived_at", null)
    .single();
  if (error) return null;
  return data as DbServiceJob;
}

export async function getWorkItems(serviceJobId?: string) {
  const { supabase } = await getAuthedSupabase();
  let query = supabase
    .from("job_work_items")
    .select("*, work_catalog(id, category, name), workers(id, first_name, last_name, role_id)")
    .order("planned_at", { ascending: false });
  if (serviceJobId) query = query.eq("service_job_id", serviceJobId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DbWorkItem[];
}

export async function getPurchases(serviceJobId?: string) {
  const { supabase } = await getAuthedSupabase();
  let query = supabase
    .from("purchases")
    .select("*, part_catalog(id, name, category), suppliers(id, company_name, shop_name, first_name, last_name, father_name), workers(id, first_name, last_name)")
    .order("purchase_date", { ascending: false });
  if (serviceJobId) query = query.eq("service_job_id", serviceJobId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DbPurchase[];
}

export async function getSuppliers() {
  const { supabase } = await getAuthedSupabase();
  const { data, error } = await supabase.from("suppliers").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbSupplier[];
}

export async function getWorkers() {
  const { supabase } = await getAuthedSupabase();
  const { data, error } = await supabase.from("workers").select("*, worker_roles(id, name)").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbWorker[];
}

export async function getMasterData() {
  const { supabase } = await getAuthedSupabase();
  const [work, parts, roles] = await Promise.all([
    supabase.from("work_catalog").select("*").eq("active", true).order("sort_order"),
    supabase.from("part_catalog").select("*").eq("active", true).order("sort_order"),
    supabase.from("worker_roles").select("*").eq("active", true).order("sort_order")
  ]);
  if (work.error) throw work.error;
  if (parts.error) throw parts.error;
  if (roles.error) throw roles.error;
  return {
    workCatalog: (work.data ?? []) as DbWorkCatalog[],
    partCatalog: (parts.data ?? []) as DbPartCatalog[],
    workerRoles: (roles.data ?? []) as DbWorkerRole[]
  };
}

export function supplierDisplayName(supplier?: Pick<DbSupplier, "company_name" | "shop_name" | "first_name" | "last_name" | "father_name"> | null) {
  if (!supplier) return "Servis daxili ehtiyat";
  return supplier.company_name || supplier.shop_name || [supplier.first_name, supplier.last_name, supplier.father_name].filter(Boolean).join(" ") || "Təchizatçı";
}

export function workerDisplayName(worker?: Pick<DbWorker, "first_name" | "last_name"> | null) {
  return worker ? `${worker.first_name} ${worker.last_name}` : "Usta seçilməyib";
}

export function workTitle(item: DbWorkItem) {
  return item.custom_title || item.work_catalog?.name || "Digər iş";
}

export function partTitle(purchase: DbPurchase) {
  return purchase.custom_item_name || purchase.part_catalog?.name || "Detal / material";
}

