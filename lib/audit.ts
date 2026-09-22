import { z } from "zod";
import { requireAccess } from "@/lib/supabase/auth";
import {
  formatReportDate,
  formatReportDateTime,
  formatReportMoney,
} from "@/lib/reports/report-format";
import type { PrimeReport } from "@/lib/reports/report-types";
import type { SearchParams } from "@/lib/filters";

export const auditActions = [
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
  "WORK_QUOTE_UPDATED",
  "PART_QUOTE_ADDED",
  "PART_QUOTE_UPDATED",
  "PURCHASE_CREATED",
  "PURCHASE_UPDATED",
  "SUPPLIER_CREATED",
  "SUPPLIER_UPDATED",
  "WORKER_CREATED",
  "WORKER_UPDATED",
  "WORKER_ROLE_CREATED",
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
  created_at: string;
};
const auditDescriptions: Record<(typeof auditActions)[number], string> = {
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
  WORK_QUOTE_UPDATED: "iş üzrə qiymət təklifini yenilədi",
  PART_QUOTE_ADDED: "detal üzrə qiymət təklifi əlavə etdi",
  PART_QUOTE_UPDATED: "detal üzrə qiymət təklifini yenilədi",
  PURCHASE_CREATED: "satınalma yaratdı",
  PURCHASE_UPDATED: "satınalmanı yenilədi",
  SUPPLIER_CREATED: "təchizatçı əlavə etdi",
  SUPPLIER_UPDATED: "təchizatçı məlumatlarını yenilədi",
  WORKER_CREATED: "işçi əlavə etdi",
  WORKER_UPDATED: "işçi məlumatlarını yenilədi",
  WORKER_ROLE_CREATED: "işçi vəzifəsi əlavə etdi",
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
  const description =
    auditDescriptions[log.action as keyof typeof auditDescriptions];
  if (!description) return log.summary;
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
export async function getAudit(params: SearchParams) {
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
  return { logs: (data ?? []) as AuditLog[], total: count ?? 0, filters };
}
export async function loadAuditReport(
  params: SearchParams,
): Promise<PrimeReport> {
  const { logs, total, filters } = await getAudit(params);
  return {
    scope: "audit",
    title: "Audit jurnalı",
    generatedAt: formatReportDateTime(),
    orientation: "landscape",
    filters: [
      `Dövr: ${filters.from ? formatReportDate(filters.from) : "Əvvəldən"} - ${filters.to ? formatReportDate(filters.to) : "Bu günədək"}`,
      filters.actor && `İstifadəçi: ${filters.actor}`,
      filters.role && `Rol: ${filters.role}`,
      filters.action && `Əməliyyat: ${auditDescriptions[filters.action]}`,
      filters.entity && `Obyekt: ${filters.entity}`,
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
            "İstifadəçi / rol",
            "Əməliyyat",
            "Obyekt / avtomobil",
          ].map((label, i) => ({
            key: String(i),
            label,
            width: [16, 17, 39, 28][i],
          })),
          rows: logs.map((log) => ({
            id: log.id,
            cells: {
              "0": formatReportDateTime(log.created_at),
              "1": `${log.actor_username_snapshot} / ${log.actor_role_snapshot}`,
              "2": auditDescription(log),
              "3": `${log.entity_type} · ${log.plate || "-"}`,
            },
            details: [
              { label: "Hadisə kodu", value: log.action },
              { label: "İstinad", value: log.entity_id },
              { label: "Dəyişiklik", value: JSON.stringify(log.changes) },
              { label: "Əlavə məlumat", value: JSON.stringify(log.metadata) },
            ],
          })),
        },
      },
    ],
  };
}
