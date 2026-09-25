"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthedSupabase } from "@/lib/supabase/queries";
import { moneySchema, uuidValue } from "@/lib/workshop-validation";
import { z } from "zod";
const text = (f: FormData, k: string) => String(f.get(k) || "").trim();
const optionalId = (f: FormData, k: string) =>
  text(f, k) ? uuidValue(f, k) : null;
function details(f: FormData) {
  const channel = z.enum(["CASH", "BANK"]).parse(f.get("channel"));
  return {
    channel,
    financial_account_id:
      channel === "BANK" ? uuidValue(f, "financial_account_id") : null,
    payment_method:
      channel === "BANK"
        ? z
            .enum(["TRANSFER", "POS", "ONLINE", "OTHER"])
            .parse(f.get("payment_method"))
        : "CASH",
    occurred_at: new Date(text(f, "occurred_at") + "+04:00").toISOString(),
    purpose: z.string().trim().min(1).max(500).parse(f.get("purpose")),
    notes: z.string().max(250).parse(text(f, "notes")),
    reference_number: text(f, "reference_number"),
    bank_reference: text(f, "bank_reference"),
    payment_order_number: text(f, "payment_order_number"),
    supporting_reference: text(f, "supporting_reference"),
    counterparty_name: text(f, "counterparty_name"),
    counterparty_details: Object.fromEntries(
      ["tax_id", "iban", "bank", "identity"].map((k) => [k, text(f, k)]),
    ),
  };
}
export async function recordLedgerAction(f: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN", "CASHIER");
  const { error } = await supabase.rpc("record_financial_transaction", {
    p_key: uuidValue(f, "idempotency_key"),
    p_data: {
      ...details(f),
      amount: moneySchema.parse(f.get("amount")),
      allocation_type: text(f, "allocation_type"),
      service_job_id: optionalId(f, "service_job_id"),
      target_id: optionalId(f, "target_id"),
      category_id: optionalId(f, "category_id"),
    },
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
}
export async function transferLedgerAction(f: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN", "CASHIER");
  const { error } = await supabase.rpc("transfer_financial_funds", {
    p_from: optionalId(f, "from_account"),
    p_to: optionalId(f, "to_account"),
    p_amount: moneySchema.parse(f.get("amount")),
    p_at: new Date(text(f, "occurred_at") + "+04:00").toISOString(),
    p_note: text(f, "notes"),
    p_key: uuidValue(f, "idempotency_key"),
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
}
export async function saveFinancialMasterAction(f: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const { error } = await supabase.rpc("save_financial_master", {
    p_kind: text(f, "kind"),
    p_data: Object.fromEntries(
      [
        "id",
        "name",
        "bank_name",
        "iban",
        "account_holder",
        "tax_id",
        "swift",
        "notes",
        "direction",
        "active",
      ].map((k) => [k, text(f, k) || null]),
    ),
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
}
export async function settleVehicleAction(f: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN", "CASHIER");
  const rows = f.getAll("obligation").map((v) => {
    const [type, id] = String(v).split(":");
    return {
      ...details(f),
      allocation_type: type,
      target_id: z.uuid().parse(id),
      amount: moneySchema.parse(f.get("amount_" + id)),
    };
  });
  const { error } = await supabase.rpc("settle_vehicle_obligations", {
    p_job: uuidValue(f, "service_job_id"),
    p_rows: rows,
    p_close: f.get("close") === "on",
    p_key: uuidValue(f, "idempotency_key"),
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
}
export async function reopenVehicleAction(f: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const { error } = await supabase.rpc("set_vehicle_financial_state", {
    p_job: uuidValue(f, "service_job_id"),
    p_close: false,
    p_reason: text(f, "reason"),
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
}
export async function deleteSupplierPermanentlyAction(f: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const { error } = await supabase.rpc("delete_supplier_permanently", {
    p_id: uuidValue(f, "id"),
    p_confirmation: text(f, "confirmation"),
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  redirect("/suppliers");
}
