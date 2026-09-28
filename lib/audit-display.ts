import type { AuditLog } from "@/lib/audit";
import { financialLabel } from "@/lib/finance-labels";
import {
  formatReportDate,
  formatReportDateTime,
  formatReportMoney,
  reportWorkStatusLabels,
  reportJobStatusLabels,
  reportFundingLabels,
  reportPaymentLabels,
} from "@/lib/reports/report-format";

export const auditEventLabels: Record<string, string> = {
  WORKER_ADVANCE_CREATED: "Ustaya avans verildi",
  WORKER_ADVANCE_ALLOCATED: "Ümumi avans işə tətbiq edildi",
  WORKER_COMPENSATION_POLICY_UPDATED: "Ustanın faiz qaydası yeniləndi",
  WORK_COMPENSATION_UPDATED: "İşin usta hesablaması yeniləndi",
  CATALOG_MANAGED: "Məlumat kataloqu yeniləndi",
  VEHICLE_WORK_COMPLETED: "Maliyyə bağlanarkən işlər tamamlandı",
  CASH_IN_CREATED: "Nağd mədaxil qeydə alındı",
  CASH_OUT_CREATED: "Nağd məxaric qeydə alındı",
  BANK_IN_CREATED: "Bank mədaxili qeydə alındı",
  BANK_OUT_CREATED: "Bank məxarici qeydə alındı",
  INTERNAL_TRANSFER_CREATED: "Daxili köçürmə yaradıldı",
  GENERAL_INCOME_CREATED: "Ümumi gəlir qeydə alındı",
  GENERAL_EXPENSE_CREATED: "Ümumi xərc qeydə alındı",
  FINANCIAL_TRANSACTION_REVERSED: "Maliyyə əməliyyatı ləğv edildi",
  VEHICLE_FINANCE_CLOSED: "Avtomobilin maliyyəsi bağlandı",
  VEHICLE_FINANCE_REOPENED: "Avtomobilin maliyyəsi yenidən açıldı",
  BANK_ACCOUNT_CREATED: "Bank hesabı yaradıldı",
  BANK_ACCOUNT_UPDATED: "Bank hesabı yeniləndi",
  BANK_ACCOUNT_ARCHIVED: "Bank hesabı arxivləndi",
  TRANSACTION_CATEGORY_CREATED: "Maliyyə təyinatı yaradıldı",
  SUPPLIER_PERMANENTLY_DELETED: "Təchizatçı birdəfəlik silindi",
  SUPPLIER_ARCHIVED: "Təchizatçı arxivləndi",
  SUPPLIER_RESTORED: "Təchizatçı bərpa edildi",
  ADDITIONAL_WORK_CREATED: "Əlavə iş yaradıldı",
  ADDITIONAL_PURCHASE_CREATED: "Əlavə satınalma yaradıldı",
  UNIT_CREATED: "Ölçü vahidi yaradıldı",
  UNIT_UPDATED: "Ölçü vahidi yeniləndi",
  SERVICE_JOB_SOFT_DELETED: "Servis kartı silindi",
  SERVICE_JOB_SOFT_RESTORED: "Silinmiş servis kartı bərpa edildi",
  LOGIN_SUCCESS: "Sistemə giriş edildi",
  LOGOUT: "Sistemdən çıxış edildi",
  PASSWORD_CHANGED: "Şifrə dəyişdirildi",
  USER_ENABLED: "Hesab aktivləşdirildi",
  USER_DISABLED: "Hesab deaktiv edildi",
  PASSWORD_RESET_REQUESTED: "Şifrə yenilənməsi istənildi",
  VEHICLE_CREATED: "Avtomobil yaradıldı",
  VEHICLE_UPDATED: "Avtomobil yeniləndi",
  SERVICE_JOB_CREATED: "Servis kartı yaradıldı",
  SERVICE_JOB_UPDATED: "Servis kartı yeniləndi",
  SERVICE_JOB_ARCHIVED: "Servis kartı arxivləndi",
  SERVICE_JOB_RESTORED: "Servis kartı bərpa edildi",
  WORK_QUOTE_ADDED: "İş təklifi əlavə edildi",
  WORK_QUOTE_UPDATED: "İş məlumatı yeniləndi",
  PART_QUOTE_ADDED: "Detal təklifi əlavə edildi",
  PART_QUOTE_UPDATED: "Detal təklifi yeniləndi",
  PURCHASE_CREATED: "Satınalma yaradıldı",
  PURCHASE_UPDATED: "Satınalma məlumatı yeniləndi",
  SUPPLIER_CREATED: "Təchizatçı yaradıldı",
  SUPPLIER_UPDATED: "Təchizatçı yeniləndi",
  WORKER_CREATED: "İşçi yaradıldı",
  WORKER_UPDATED: "İşçi yeniləndi",
  WORKER_ARCHIVED: "İşçi arxivləndi",
  WORKER_RESTORED: "İşçi bərpa edildi",
  WORKER_PERMANENTLY_DELETED: "İşçi həmişəlik silindi",
  BANK_ACCOUNT_RESTORED: "Bank hesabı bərpa edildi",
  BANK_ACCOUNT_PERMANENTLY_DELETED: "Bank hesabı həmişəlik silindi",
  TRANSACTION_CATEGORY_UPDATED: "Təyinat yeniləndi",
  TRANSACTION_CATEGORY_ARCHIVED: "Təyinat arxivləndi",
  TRANSACTION_CATEGORY_RESTORED: "Təyinat bərpa edildi",
  TRANSACTION_CATEGORY_PERMANENTLY_DELETED: "Təyinat həmişəlik silindi",
  WORKER_ROLE_CREATED: "İşçi vəzifəsi yaradıldı",
  WORKER_ROLE_UPDATED: "İşçi vəzifəsi yeniləndi",
  WORK_CATALOG_CREATED: "İş kataloquna əlavə edildi",
  WORK_CATALOG_UPDATED: "İş kataloqu yeniləndi",
  PART_CATALOG_CREATED: "Detal kataloquna əlavə edildi",
  PART_CATALOG_UPDATED: "Detal kataloqu yeniləndi",
  WORKER_ASSIGNED: "İşə usta təyin edildi",
  WORK_STATUS_CHANGED: "İşin statusu dəyişdirildi",
  WORKER_COST_SET: "Usta mayası yeniləndi",
  CUSTOMER_PAYMENT_CREATED: "Müştəri ödənişi yaradıldı",
  SUPPLIER_PAYMENT_CREATED: "Təchizatçı ödənişi yaradıldı",
  WORKER_PAYMENT_CREATED: "Usta ödənişi yaradıldı",
  PAYMENT_VOIDED: "Ödəniş ləğv edildi",
  PAYMENT_REVERSED: "Əks ödəniş qeydə alındı",
};
export const auditEntityLabels: Record<string, string> = {
  account: "Bank hesabı",
  financial_accounts: "Bank hesabı",
  category: "Maliyyə təyinatı",
  transaction_categories: "Maliyyə təyinatı",
  unit_catalog: "Ölçü vahidi",
  vehicles: "Avtomobil",
  service_jobs: "Servis kartı",
  job_work_items: "İş",
  work_items: "İş",
  job_required_parts: "Tələb olunan detal",
  purchases: "Satınalma",
  suppliers: "Təchizatçı",
  workers: "İşçi / usta",
  worker_roles: "İşçi vəzifəsi",
  work_catalog: "İş kataloqu",
  part_catalog: "Detal kataloqu",
  cash_transactions: "Maliyyə əməliyyatı",
  cash_reversals: "Əks əməliyyat",
  user_profiles: "İstifadəçi hesabı",
};
export const auditRoleLabels: Record<string, string> = {
  ADMIN: "Administrator",
  CASHIER: "Kassir",
  INTAKE: "İlkin qeydiyyat",
  SYSTEM: "Sistem",
};
export const auditEventLabel = (code: string) =>
  auditEventLabels[code] || "Məlumat yeniləndi";
export const auditEntityLabel = (code: string) =>
  auditEntityLabels[code] || "Əlaqəli qeyd";
export const auditRoleLabel = (code: string) =>
  auditRoleLabels[code] || "İstifadəçi";

// Explicit allowlist: credentials, tokens and unknown metadata never reach display.
const fields: Record<string, string> = {
  applied_advance: "Tətbiq edilmiş ümumi avans",
  eligible: "Faizlə işləyə bilər",
  worker_percentage: "Usta payı (%)",
  compensation_mode: "Hesablama rejimi",
  worker_percentage_snapshot: "Razılaşdırılmış usta payı (%)",
  earning_basis_snapshot: "Qazancın hesablandığı məbləğ",
  earning_snapshot: "Sabitlənmiş qazanc",
  earning_finalized_at: "Qazancın sabitləndiyi vaxt",
  completed_count: "Tamamlanan işlərin sayı",
  catalog_action: "Kataloq əməliyyatı",
  current_voided: "Hazırda ləğv edilib",
  current_void_reason: "Cari ləğv səbəbi",
  from: "Çıxan hesab",
  to: "Daxil olan hesab",
  amount: "Məbləğ",
  labor_cost: "Usta mayası",
  quoted_price: "Satış qiyməti",
  unit_price: "Vahid qiyməti",
  customer_unit_price: "Müştəri üçün vahid qiyməti",
  cost_note: "Maya qeydi",
  total_price: "Ümumi məbləğ",
  agreed_budget: "Razılaşdırılmış məbləğ",
  paid_amount: "Ödənilən məbləğ",
  part_cost: "Detal mayası",
  worker_cost: "Usta mayası",
  other_expenses: "Digər xərclər",
  supplier_paid: "Təchizatçıya ödənilib",
  worker_paid: "Ustaya ödənilib",
  customer_received: "Müştəridən alınıb",
  customer_due: "Müştəri borcu",
  cost: "Ümumi maya",
  outgoing_paid: "Ümumi ödənilib",
  assigned_worker_id: "Usta",
  worker_id: "Usta",
  supplier_id: "Təchizatçı",
  financial_account_id: "Hesab",
  account_id: "Hesab",
  category_id: "Təyinat",
  service_job_id: "Servis kartı",
  work_item_id: "İş",
  work_catalog_id: "İş",
  purchase_id: "Satınalma",
  unit_id: "Ölçü vahidi",
  role_id: "Vəzifə",
  worker: "Usta",
  supplier: "Təchizatçı",
  work: "İş",
  customer_name: "Müştəri",
  counterparty_name_snapshot: "Tərəf",
  company_name: "Şirkət",
  shop_name: "Mağaza",
  first_name: "Ad",
  last_name: "Soyad",
  name: "Ad",
  username: "İstifadəçi",
  status: "Status",
  payment_status: "Ödəniş vəziyyəti",
  source_type: "Alış mənbəyi",
  funding_source: "Maliyyələşmə mənbəyi",
  channel: "Kanal",
  direction: "İstiqamət",
  allocation_type: "Təyinat",
  payment_method: "Ödəniş üsulu",
  purpose: "Təyinat",
  notes: "Qeyd",
  reason: "Səbəb",
  void_reason: "Ləğv səbəbi",
  bank_reference: "Bank əməliyyat nömrəsi",
  reference_number: "Əməliyyat nömrəsi",
  document_no: "Sənəd nömrəsi",
  job_no: "Servis kartı",
  plate: "Avtomobil",
  custom_title: "İş adı",
  custom_item_name: "Detal adı",
  transaction_date: "Əməliyyat tarixi",
  occurred_at: "Əməliyyat vaxtı",
  planned_at: "Plan tarixi",
  started_at: "Başlama vaxtı",
  completed_at: "Tamamlanma vaxtı",
  received_at: "Qəbul vaxtı",
  target_delivery_date: "Hədəf təhvil tarixi",
  voided_at: "Ləğv vaxtı",
  archived_at: "Arxiv vaxtı",
  deleted_at: "Silinmə vaxtı",
  active: "Aktivdir",
  is_active: "Hesab aktivdir",
  labor_cost_known: "Maya daxil edilib",
  is_additional: "Əlavə işdir",
  quantity: "Miqdar",
  role: "Rol",
  make: "Marka",
  model: "Model",
  phone: "Telefon",
  customer_phone: "Müştəri telefonu",
  address: "Ünvan",
  registered_owner_full_name: "Qeydiyyat sahibi",
  registered_owner_address: "Sahibin ünvanı",
  color: "Rəng",
  production_year: "Buraxılış ili",
  insurance_company: "Sığorta şirkəti",
  insurance_approved_amount: "Təsdiqlənmiş sığorta məbləği",
};
const moneyFields = new Set([
  "applied_advance",
  "earning_basis_snapshot",
  "earning_snapshot",
  "amount",
  "labor_cost",
  "quoted_price",
  "unit_price",
  "customer_unit_price",
  "total_price",
  "agreed_budget",
  "paid_amount",
  "part_cost",
  "worker_cost",
  "other_expenses",
  "supplier_paid",
  "worker_paid",
  "customer_received",
  "customer_due",
  "cost",
  "outgoing_paid",
  "insurance_approved_amount",
]);
const codes: Record<string, string> = {
  FIXED: "Sabit",
  PERCENTAGE: "Faizli",
  rename: "Ad dəyişdirildi",
  archive: "Arxivləndi",
  restore: "Bərpa edildi",
  delete: "Silindi",
  ...reportWorkStatusLabels,
  ...reportJobStatusLabels,
  ...reportFundingLabels,
  ...reportPaymentLabels,
  ...auditRoleLabels,
  CASH: "Nağd",
  BANK: "Bank",
  IN: "Mədaxil",
  OUT: "Məxaric",
  TRANSFER: "Daxili köçürmə",
  CARD: "Kart",
  ONLINE: "Onlayn",
  SUPPLIER: "Təchizatçı",
  WORKER: "İşçi",
  ADMIN: "Administrator",
  INTERNAL: "Daxili",
  GENERAL: "Ümumi",
  INTERNAL_STOCK: "Servis daxili ehtiyat",
  CUSTOMER_PROVIDED: "Müştərinin təqdim etdiyi detal",
};
export function auditValue(
  field: string,
  value: unknown,
  references: Record<string, string> = {},
) {
  if (field === "from" || field === "to")
    return value == null
      ? "Nağd kassa"
      : references[`${field}:${value}`] || "Bank hesabı (adı saxlanmayıb)";
  if (value === null || value === undefined || value === "") return "Yoxdur";
  if (field.endsWith("_id"))
    return typeof value === "string"
      ? references[`${field}:${value}`] || "Əlaqəli qeyd (adı saxlanmayıb)"
      : "Əlaqəli qeyd";
  if (typeof value === "boolean") return value ? "Bəli" : "Xeyr";
  if (typeof value !== "string" && typeof value !== "number")
    return "Dəyişdirilib";
  if (
    moneyFields.has(field) &&
    /^-?\d+(\.\d+)?$/.test(String(value)) &&
    Number.isFinite(Number(value))
  )
    return formatReportMoney(Number(value));
  if (field === "allocation_type") return financialLabel(String(value));
  if (field.endsWith("_date") && /^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    return formatReportDate(String(value));
  if (
    (field.endsWith("_at") || field.endsWith("_date")) &&
    /^\d{4}-\d{2}-\d{2}/.test(String(value))
  )
    return formatReportDateTime(String(value));
  if (
    [
      "status",
      "payment_status",
      "source_type",
      "funding_source",
      "channel",
      "direction",
      "role",
      "payment_method",
      "catalog_action",
      "compensation_mode",
    ].includes(field)
  )
    return codes[String(value)] || "Digər";
  return String(value);
}
export function auditDetail(log: AuditLog) {
  const refs = log.references || {};
  const details = [
    { label: "Əməliyyat", value: auditEventLabel(log.action) },
    { label: "Tarix / saat", value: formatReportDateTime(log.created_at) },
    { label: "İstifadəçi", value: log.actor_username_snapshot },
    { label: "Rol", value: auditRoleLabel(log.actor_role_snapshot) },
    { label: "Bölmə", value: auditEntityLabel(log.entity_type) },
    ...(log.plate ? [{ label: "Avtomobil", value: log.plate }] : []),
    ...Object.entries(log.metadata)
      .filter(([key]) => fields[key])
      .map(([key, value]) => ({
        label: fields[key],
        value: auditValue(key, value, refs),
      })),
  ];
  const changes = Object.entries(log.changes)
    .filter(([key]) => fields[key])
    .map(([key, change]) => {
      const c =
        change && typeof change === "object"
          ? (change as Record<string, unknown>)
          : {};
      return {
        label: fields[key],
        before: "before" in c ? auditValue(key, c.before, refs) : null,
        after: "after" in c ? auditValue(key, c.after, refs) : null,
      };
    });
  return { details, changes };
}
