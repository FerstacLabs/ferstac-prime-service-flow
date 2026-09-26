import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLog } from "@/lib/audit";

type Row = Record<string, unknown>;
const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v);
const name = (r: Row) =>
  String(
    r.company_name ||
      r.shop_name ||
      [r.first_name, r.last_name].filter(Boolean).join(" ") ||
      r.name ||
      r.job_no ||
      r.custom_title ||
      r.custom_item_name ||
      "Əlaqəli qeyd",
  );

// Resolve only referenced organization-owned rows, not the entire finance dataset.
export async function resolveAuditContext(
  supabase: SupabaseClient,
  org: string,
  logs: AuditLog[],
): Promise<AuditLog[]> {
  const refs: Record<string, string> = {};
  const values = new Map<string, Set<string>>();
  const add = (field: string, value: unknown) => {
    if (uuid(value)) {
      const set = values.get(field) || new Set<string>();
      set.add(value);
      values.set(field, set);
    }
  };
  const enriched = logs.map((log) => ({
    ...log,
    metadata: { ...log.metadata },
  }));
  const transactionIds = [
    ...new Set(
      logs
        .filter(
          (l) => l.entity_type === "cash_transactions" && uuid(l.entity_id),
        )
        .map((l) => l.entity_id),
    ),
  ];
  const current = new Map<string, Row>();
  if (transactionIds.length) {
    const { data, error } = await supabase
      .from("cash_transactions")
      .select(
        "id,counterparty_name_snapshot,financial_account_id,channel,allocation_type,purpose,notes,bank_reference,reference_number,voided_at,void_reason",
      )
      .eq("organization_id", org)
      .in("id", transactionIds);
    if (error) throw error;
    for (const row of (data || []) as Row[]) current.set(String(row.id), row);
  }
  for (const log of enriched) {
    const transaction = current.get(log.entity_id);
    if (transaction) {
      for (const key of [
        "counterparty_name_snapshot",
        "financial_account_id",
        "channel",
        "allocation_type",
        "purpose",
        "notes",
        "bank_reference",
        "reference_number",
      ]) {
        if (transaction[key] != null && log.metadata[key] == null)
          log.metadata[key] = transaction[key];
      }
      log.metadata.current_voided = !!transaction.voided_at;
      if (transaction.void_reason)
        log.metadata.current_void_reason = transaction.void_reason;
    }
    for (const [field, value] of Object.entries(log.metadata))
      add(field, value);
    for (const [field, value] of Object.entries(log.changes)) {
      if (value && typeof value === "object") {
        const c = value as Row;
        add(field, c.before);
        add(field, c.after);
      }
    }
  }
  const groups: Array<{ fields: string[]; table: string; select: string }> = [
    {
      fields: ["assigned_worker_id", "worker_id"],
      table: "workers",
      select: "id,first_name,last_name",
    },
    {
      fields: ["supplier_id"],
      table: "suppliers",
      select: "id,company_name,shop_name,first_name,last_name",
    },
    {
      fields: ["account_id", "financial_account_id", "from", "to"],
      table: "financial_accounts",
      select: "id,name",
    },
    {
      fields: ["category_id"],
      table: "transaction_categories",
      select: "id,name",
    },
    { fields: ["service_job_id"], table: "service_jobs", select: "id,job_no" },
    { fields: ["role_id"], table: "worker_roles", select: "id,name" },
    { fields: ["unit_id"], table: "unit_catalog", select: "id,name" },
    { fields: ["work_catalog_id"], table: "work_catalog", select: "id,name" },
    {
      fields: ["work_item_id"],
      table: "job_work_items",
      select: "id,custom_title,work_catalog(name)",
    },
    {
      fields: ["purchase_id"],
      table: "purchases",
      select: "id,custom_item_name,part_catalog(name)",
    },
  ];
  for (const group of groups) {
    const ids = [
      ...new Set(group.fields.flatMap((f) => [...(values.get(f) || [])])),
    ];
    if (!ids.length) continue;
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase
        .from(group.table)
        .select(group.select)
        .eq("organization_id", org)
        .in("id", ids.slice(i, i + 100));
      if (error) throw error;
      for (const row of (data || []) as unknown as Row[]) {
        const catalog = (row.work_catalog || row.part_catalog) as
          Row | undefined;
        const label = name({ ...row, name: catalog?.name || row.name });
        for (const field of group.fields) refs[`${field}:${row.id}`] = label;
      }
    }
  }
  const missingSuppliers = [...(values.get("supplier_id") || [])].filter(
    (id) => !refs[`supplier_id:${id}`],
  );
  for (const id of missingSuppliers) {
    const { data, error } = await supabase
      .from("purchases")
      .select("supplier_snapshot")
      .eq("organization_id", org)
      .eq("historical_supplier_id", id)
      .limit(1);
    if (error) throw error;
    const snapshot = data?.[0]?.supplier_snapshot;
    if (snapshot) refs[`supplier_id:${id}`] = `${name(snapshot)} (silinib)`;
  }
  return enriched.map((log) => ({ ...log, references: refs }));
}
