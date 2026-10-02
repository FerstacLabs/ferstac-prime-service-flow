import { z } from "zod";
import { requireAccess } from "@/lib/supabase/auth";
import {
  formatReportDate,
  formatReportDateTime,
  formatReportMoney,
} from "@/lib/reports/report-format";
import type { PrimeReport } from "@/lib/reports/report-types";
import type { SearchParams } from "@/lib/filters";
import {
  auditEventLabel,
  auditEntityLabel,
  auditRoleLabel,
} from "@/lib/audit-display";
import { resolveAuditContext } from "@/lib/supabase/audit-context";

export const auditActions = [
  "WORKER_ADVANCE_CREATED",
  "WORKER_BONUS_CREATED",
  "PURCHASE_RETURNED",
  "PURCHASE_EXCHANGED",
  "SUPPLIER_REFUND_CREATED",
  "SUPPLIER_CREDIT_CREATED",
  "SUPPLIER_CREDIT_APPLIED",
  "WORKER_ADVANCE_ALLOCATED",
  "WORKER_COMPENSATION_POLICY_UPDATED",
  "WORK_COMPENSATION_UPDATED",
  "CATALOG_MANAGED",
  "VEHICLE_WORK_COMPLETED",
  "CASH_IN_CREATED",
  "CASH_OUT_CREATED",
  "BANK_IN_CREATED",
  "BANK_OUT_CREATED",
  "INTERNAL_TRANSFER_CREATED",
  "GENERAL_INCOME_CREATED",
  "GENERAL_EXPENSE_CREATED",
  "FINANCIAL_TRANSACTION_REVERSED",
  "VEHICLE_FINANCE_CLOSED",
  "VEHICLE_FINANCE_REOPENED",
  "BANK_ACCOUNT_CREATED",
  "BANK_ACCOUNT_UPDATED",
  "BANK_ACCOUNT_ARCHIVED",
  "TRANSACTION_CATEGORY_CREATED",
  "SUPPLIER_PERMANENTLY_DELETED",
  "SUPPLIER_ARCHIVED",
  "SUPPLIER_RESTORED",
  "ADDITIONAL_WORK_CREATED",
  "ADDITIONAL_PURCHASE_CREATED",
  "UNIT_CREATED",
  "UNIT_UPDATED",
  "SERVICE_JOB_SOFT_DELETED",
  "SERVICE_JOB_SOFT_RESTORED",
  "LOGIN_SUCCESS",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "USER_ENABLED",
  "USER_DISABLED",
  "PASSWORD_RESET_REQUESTED",
  "VEHICLE_CREATED",
  "VEHICLE_UPDATED",
  "SERVICE_JOB_CREATED",
  "SERVICE_JOB_UPDATED",
  "SERVICE_JOB_ARCHIVED",
  "SERVICE_JOB_RESTORED",
  "WORK_QUOTE_ADDED",
  "SERVICE_WORK_REMOVED",
  "SERVICE_PART_REMOVED",
  "WORK_QUOTE_UPDATED",
  "PART_QUOTE_ADDED",
  "PART_QUOTE_UPDATED",
  "PURCHASE_CREATED",
  "PURCHASE_UPDATED",
  "SUPPLIER_CREATED",
  "SUPPLIER_UPDATED",
  "WORKER_CREATED",
  "WORKER_UPDATED",
  "WORKER_ARCHIVED",
  "WORKER_RESTORED",
  "WORKER_PERMANENTLY_DELETED",
  "BANK_ACCOUNT_RESTORED",
  "BANK_ACCOUNT_PERMANENTLY_DELETED",
  "TRANSACTION_CATEGORY_UPDATED",
  "TRANSACTION_CATEGORY_ARCHIVED",
  "TRANSACTION_CATEGORY_RESTORED",
  "TRANSACTION_CATEGORY_PERMANENTLY_DELETED",
  "WORKER_ROLE_CREATED",
  "WORKER_ROLE_UPDATED",
  "WORK_CATALOG_CREATED",
  "WORK_CATALOG_UPDATED",
  "PART_CATALOG_CREATED",
  "PART_CATALOG_UPDATED",
  "WORKER_ASSIGNED",
  "WORK_STATUS_CHANGED",
  "WORKER_COST_SET",
  "CUSTOMER_PAYMENT_CREATED",
  "SUPPLIER_PAYMENT_CREATED",
  "WORKER_PAYMENT_CREATED",
  "PAYMENT_VOIDED",
  "PAYMENT_REVERSED",
] as const;
export const auditEntities = [
  "account",
  "category",
  "unit_catalog",
  "vehicles",
  "service_jobs",
  "job_work_items",
  "job_required_parts",
  "purchases",
  "suppliers",
  "workers",
  "worker_roles",
  "work_catalog",
  "part_catalog",
  "cash_transactions",
  "cash_reversals",
  "user_profiles",
] as const;
export type AuditLog = {
  id: string;
  actor_user_id: string;
  actor_username_snapshot: string;
  actor_role_snapshot: string;
  action: string;
  entity_type: string;
  entity_id: string;
  service_job_id: string | null;
  vehicle_id: string | null;
  plate: string | null;
  summary: string;
  changes: Record<string, unknown>;
  metadata: Record<string, unknown>;
  references?: Record<string, string>;
  created_at: string;
};
const auditDescriptions: Record<(typeof auditActions)[number], string> = {
  WORKER_ADVANCE_CREATED: "ustaya avans verdi",
  WORKER_BONUS_CREATED: "işçiyə bonus verdi",
  PURCHASE_RETURNED: "detalı təchizatçıya qaytardı",
  PURCHASE_EXCHANGED: "detalı dəyişdirdi",
  SUPPLIER_REFUND_CREATED: "təchizatçıdan vəsait geri aldı",
  SUPPLIER_CREDIT_CREATED: "təchizatçı krediti yaratdı",
  SUPPLIER_CREDIT_APPLIED: "təchizatçı kreditini alışa tətbiq etdi",
  WORKER_ADVANCE_ALLOCATED: "ümumi avansı usta borcuna tətbiq etdi",
  WORKER_COMPENSATION_POLICY_UPDATED: "ustanın faiz qaydasını yenilədi",
  WORK_COMPENSATION_UPDATED: "işin usta hesablamasını yenilədi",
  CATALOG_MANAGED: "məlumat kataloqunu yenilədi",
  VEHICLE_WORK_COMPLETED: "maliyyə bağlanarkən işləri tamamladı",
  CASH_IN_CREATED: "nağd mədaxil qeydə aldı",
  CASH_OUT_CREATED: "nağd məxaric qeydə aldı",
  BANK_IN_CREATED: "bank mədaxili qeydə aldı",
  BANK_OUT_CREATED: "bank məxarici qeydə aldı",
  INTERNAL_TRANSFER_CREATED: "daxili köçürmə yaratdı",
  GENERAL_INCOME_CREATED: "ümumi gəlir qeydə aldı",
  GENERAL_EXPENSE_CREATED: "ümumi xərc qeydə aldı",
  FINANCIAL_TRANSACTION_REVERSED: "maliyyə əməliyyatını səbəblə ləğv etdi",
  VEHICLE_FINANCE_CLOSED: "avtomobilin maliyyəsini bağladı",
  VEHICLE_FINANCE_REOPENED: "avtomobilin maliyyəsini yenidən açdı",
  BANK_ACCOUNT_CREATED: "bank hesabı yaratdı",
  BANK_ACCOUNT_UPDATED: "bank hesabını yenilədi",
  BANK_ACCOUNT_ARCHIVED: "bank hesabını arxivlədi",
  TRANSACTION_CATEGORY_CREATED: "maliyyə kateqoriyası yaratdı",
  SUPPLIER_PERMANENTLY_DELETED:
    "təchizatçını tarixçə saxlanmaqla həmişəlik sildi",
  SUPPLIER_ARCHIVED: "təchizatçını arxivlədi",
  SUPPLIER_RESTORED: "təchizatçını bərpa etdi",
  ADDITIONAL_WORK_CREATED: "təklifdən kənar iş əlavə etdi",
  ADDITIONAL_PURCHASE_CREATED: "təklifdən kənar alış yaratdı",
  UNIT_CREATED: "ölçü vahidi yaratdı",
  UNIT_UPDATED: "ölçü vahidini yenilədi",
  SERVICE_JOB_SOFT_DELETED: "servis kartını təhlükəsiz sildi",
  SERVICE_JOB_SOFT_RESTORED: "silinmiş servis kartını bərpa etdi",
  LOGIN_SUCCESS: "sistemə daxil oldu",
  LOGOUT: "sistemdən çıxdı",
  PASSWORD_CHANGED: "şifrəsini dəyişdi",
  USER_ENABLED: "hesabı aktiv etdi",
  USER_DISABLED: "hesabı deaktiv etdi",
  PASSWORD_RESET_REQUESTED: "müvəqqəti şifrə yenilənməsini başlatdı",
  VEHICLE_CREATED: "avtomobil qeydiyyatı yaratdı",
  VEHICLE_UPDATED: "avtomobil məlumatlarını yenilədi",
  SERVICE_JOB_CREATED: "servis kartı yaratdı",
  SERVICE_JOB_UPDATED: "servis kartını yenilədi",
  SERVICE_JOB_ARCHIVED: "servis kartını arxivlədi",
  SERVICE_JOB_RESTORED: "servis kartını arxivdən bərpa etdi",
  WORK_QUOTE_ADDED: "iş üzrə qiymət təklifi əlavə etdi",
  SERVICE_WORK_REMOVED: "iş sətrini servis kartından sildi",
  SERVICE_PART_REMOVED: "detal sətrini servis kartından sildi",
  WORK_QUOTE_UPDATED: "iş məlumatlarını yenilədi",
  PART_QUOTE_ADDED: "detal üzrə qiymət təklifi əlavə etdi",
  PART_QUOTE_UPDATED: "detal üzrə qiymət təklifini yenilədi",
  PURCHASE_CREATED: "satınalma yaratdı",
  PURCHASE_UPDATED: "satınalmanı yenilədi",
  SUPPLIER_CREATED: "təchizatçı əlavə etdi",
  SUPPLIER_UPDATED: "təchizatçı məlumatlarını yenilədi",
  WORKER_CREATED: "işçi əlavə etdi",
  WORKER_UPDATED: "işçi məlumatlarını yenilədi",
  WORKER_ARCHIVED: "işçini arxivlədi",
  WORKER_RESTORED: "işçini bərpa etdi",
  WORKER_PERMANENTLY_DELETED: "işçini həmişəlik sildi",
  BANK_ACCOUNT_RESTORED: "bank hesabını bərpa etdi",
  BANK_ACCOUNT_PERMANENTLY_DELETED: "bank hesabını həmişəlik sildi",
  TRANSACTION_CATEGORY_UPDATED: "kateqoriyanı yenilədi",
  TRANSACTION_CATEGORY_ARCHIVED: "kateqoriyanı arxivlədi",
  TRANSACTION_CATEGORY_RESTORED: "kateqoriyanı bərpa etdi",
  TRANSACTION_CATEGORY_PERMANENTLY_DELETED: "kateqoriyanı həmişəlik sildi",
  WORKER_ROLE_CREATED: "işçi vəzifəsi əlavə etdi",
  WORKER_ROLE_UPDATED: "işçi vəzifəsini yenilədi",
  WORK_CATALOG_CREATED: "iş kataloquna əlavə etdi",
  WORK_CATALOG_UPDATED: "iş kataloqunu yenilədi",
  PART_CATALOG_CREATED: "detal kataloquna əlavə etdi",
  PART_CATALOG_UPDATED: "detal kataloqunu yenilədi",
  WORKER_ASSIGNED: "işi ustaya təyin etdi",
  WORK_STATUS_CHANGED: "işin statusunu dəyişdi",
  WORKER_COST_SET: "usta mayasını yenilədi",
  CUSTOMER_PAYMENT_CREATED: "müştəri ödənişi yaratdı",
  SUPPLIER_PAYMENT_CREATED: "təchizatçı ödənişi yaratdı",
  WORKER_PAYMENT_CREATED: "usta ödənişi yaratdı",
  PAYMENT_VOIDED: "ödənişi ləğv etdi",
  PAYMENT_REVERSED: "əks ödəniş qeydi yaratdı",
};

export function auditDescription(log: AuditLog) {
  if (["SERVICE_WORK_REMOVED", "SERVICE_PART_REMOVED"].includes(log.action)) {
    const name =
      typeof log.metadata.name === "string" ? log.metadata.name : "Sətir";
    return `${log.actor_username_snapshot} istifadəçisi “${name}” ${log.action === "SERVICE_WORK_REMOVED" ? "işini" : "detalını"} ${log.plate ? `${log.plate} ` : ""}servis kartından sildi.`;
  }
  const assignment = log.changes.assigned_worker_id as
    { before?: unknown; after?: unknown } | undefined;
  const status = log.changes.status as
    { before?: unknown; after?: unknown } | undefined;
  if (
    log.action === "WORKER_ASSIGNED" &&
    assignment?.before == null &&
    typeof assignment?.after === "string" &&
    status?.before === "TODO" &&
    status.after === "IN_PROGRESS"
  ) {
    const name =
      log.references?.[`assigned_worker_id:${assignment.after}`] || "Usta";
    return `${log.actor_username_snapshot}: ${name} işə təyin edildi və status “İş gedir” olaraq dəyişdirildi.`;
  }
  const description =
    auditDescriptions[log.action as keyof typeof auditDescriptions];
  if (!description)
    return `${log.actor_username_snapshot}: ${auditEventLabel(log.action)}.`;
  const worker =
    log.action === "WORKER_PAYMENT_CREATED" &&
    typeof log.metadata.worker === "string"
      ? `${log.metadata.worker} üçün `
      : "";
  const amount =
    typeof log.metadata.amount === "number" &&
    Number.isFinite(log.metadata.amount)
      ? `${formatReportMoney(log.metadata.amount)} `
      : "";
  const target =
    ["USER_ENABLED", "USER_DISABLED", "PASSWORD_RESET_REQUESTED"].includes(
      log.action,
    ) && typeof log.metadata.username === "string"
      ? ` (${log.metadata.username})`
      : "";
  return `${log.actor_username_snapshot} istifadəçisi ${worker}${amount}${description}${target}.`;
}
export function parseAuditFilters(params: SearchParams) {
  const text = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const date = (key: string) =>
    z.iso.date().safeParse(text(key)).success ? text(key) : "";
  return {
    from: date("from"),
    to: date("to"),
    actor: ["admin", "kassa", "qeydiyyat"].includes(text("actor"))
      ? text("actor")
      : "",
    role: ["ADMIN", "CASHIER", "INTAKE"].includes(text("role"))
      ? text("role")
      : "",
    action: auditActions.find((a) => a === text("action")) ?? ("" as const),
    entity: auditEntities.find((e) => e === text("entity")) ?? "",
    plate: text("plate")
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "")
      .slice(0, 9),
    financial: text("financial") === "1",
    page: Math.min(100000, Math.max(1, Number.parseInt(text("page")) || 1)),
  };
}
export function auditQuery(
  filters: ReturnType<typeof parseAuditFilters>,
  page = filters.page,
) {
  return new URLSearchParams(
    Object.entries({
      ...filters,
      financial: filters.financial ? "1" : "",
      page,
    })
      .filter(([, value]) => value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
}
export async function getAudit(params: SearchParams, resolveDetails = true) {
  const { supabase, profile } = await requireAccess(["ADMIN"]);
  const filters = parseAuditFilters(params);
  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .eq("organization_id", profile.organization_id);
  if (filters.from)
    query = query.gte("created_at", `${filters.from}T00:00:00+04:00`);
  if (filters.to)
    query = query.lte("created_at", `${filters.to}T23:59:59.999999+04:00`);
  if (filters.actor) query = query.eq("actor_username_snapshot", filters.actor);
  if (filters.role) query = query.eq("actor_role_snapshot", filters.role);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.entity) query = query.eq("entity_type", filters.entity);
  if (filters.plate) query = query.ilike("plate", `${filters.plate}%`);
  if (filters.financial)
    query = query.in("action", [
      "CASH_IN_CREATED",
      "CASH_OUT_CREATED",
      "BANK_IN_CREATED",
      "BANK_OUT_CREATED",
      "GENERAL_INCOME_CREATED",
      "GENERAL_EXPENSE_CREATED",
      "INTERNAL_TRANSFER_CREATED",
      "FINANCIAL_TRANSACTION_REVERSED",
      "VEHICLE_FINANCE_CLOSED",
      "VEHICLE_FINANCE_REOPENED",
      "WORKER_COST_SET",
      "CUSTOMER_PAYMENT_CREATED",
      "SUPPLIER_PAYMENT_CREATED",
      "WORKER_PAYMENT_CREATED",
      "PAYMENT_VOIDED",
      "PAYMENT_REVERSED",
    ]);
  const offset = (filters.page - 1) * 50;
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + 49);
  if (error) throw new Error("Audit yüklənmədi.");
  const logs = (data ?? []) as AuditLog[];
  return {
    logs: resolveDetails
      ? await resolveAuditContext(supabase, profile.organization_id, logs)
      : logs,
    total: count ?? 0,
    filters,
  };
}
export async function loadAuditReport(
  params: SearchParams,
): Promise<PrimeReport> {
  const { logs, total, filters } = await getAudit(params);
  return {
    scope: "audit",
    documentContext: [
      filters.role,
      filters.actor,
      filters.plate,
      filters.from,
      filters.to,
    ],
    title: "Audit hesabatı",
    generatedAt: formatReportDateTime(),
    orientation: "landscape",
    filters: [
      `Dövr: ${filters.from ? formatReportDate(filters.from) : "Əvvəldən"} - ${filters.to ? formatReportDate(filters.to) : "Bu günədək"}`,
      filters.actor && `İstifadəçi: ${filters.actor}`,
      filters.role && `Rol: ${auditRoleLabel(filters.role)}`,
      filters.action && `Əməliyyat: ${auditEventLabel(filters.action)}`,
      filters.entity && `Bölmə: ${auditEntityLabel(filters.entity)}`,
      filters.plate && `Avtomobil: ${filters.plate}`,
      filters.financial && "Yalnız maliyyə",
    ]
      .filter(Boolean)
      .join(" | "),
    summary: [
      { label: "Uyğun qeydlər", value: String(total) },
      {
        label: "Səhifə",
        value: `${filters.page} / ${Math.max(1, Math.ceil(total / 50))}`,
      },
      { label: "Bu hesabatda", value: String(logs.length) },
    ],
    sections: [
      {
        title: "Əməliyyatlar",
        table: {
          columns: [
            "Tarix/saat",
            "İstifadəçi",
            "Rol",
            "Əməliyyat",
            "Bölmə",
            "Avtomobil",
            "Qısa izah",
          ].map((label, i) => ({
            key: String(i),
            label,
            width: [13, 10, 11, 20, 13, 10, 23][i],
          })),
          rows: logs.map((log) => ({
            id: log.id,
            cells: {
              "0": formatReportDateTime(log.created_at),
              "1": log.actor_username_snapshot,
              "2": auditRoleLabel(log.actor_role_snapshot),
              "3": auditEventLabel(log.action),
              "4": auditEntityLabel(log.entity_type),
              "5": log.plate || "-",
              "6":
                auditDescription(log).length > 120
                  ? `${auditDescription(log).slice(0, 117)}...`
                  : auditDescription(log),
            },
          })),
        },
      },
    ],
  };
}
