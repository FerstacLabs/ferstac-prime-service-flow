"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthedSupabase } from "@/lib/supabase/queries";
import {
  moneySchema,
  noteValue,
  textValue,
  uuidValue,
} from "@/lib/workshop-validation";

export async function refreshWorkshop() {
  revalidatePath("/", "layout");
}
export async function createCatalogAction(
  kind: "work" | "part" | "role",
  name: string,
) {
  const { supabase } = await getAuthedSupabase();
  const { data, error } = await supabase.rpc("create_catalog_entry", {
    p_kind: z.enum(["work", "part", "role"]).parse(kind),
    p_name: name,
  });
  if (error) return { error: error.message };
  await refreshWorkshop();
  return { item: data as { id: string; name: string } };
}
export async function recordPaymentAction(form: FormData) {
  const { supabase } = await getAuthedSupabase();
  const amount = moneySchema.parse(form.get("amount"));
  if (amount <= 0) throw new Error("Ödəniş sıfırdan böyük olmalıdır.");
  const { error } = await supabase.rpc("record_cash_payment", {
    p_job: uuidValue(form, "service_job_id"),
    p_type: z
      .enum([
        "CUSTOMER_WORK",
        "CUSTOMER_PART",
        "CUSTOMER_BUDGET",
        "SUPPLIER_PURCHASE",
        "WORKER_WORK_ITEM",
      ])
      .parse(form.get("allocation_type")),
    p_target: textValue(form, "target_id")
      ? uuidValue(form, "target_id")
      : null,
    p_amount: amount,
    p_date: z.iso.date().parse(textValue(form, "transaction_date")),
    p_note: noteValue(form),
    p_key: uuidValue(form, "idempotency_key"),
  });
  if (error) throw new Error(error.message);
  await refreshWorkshop();
}
export async function setWorkerCostAction(form: FormData) {
  const { supabase } = await getAuthedSupabase();
  const { error } = await supabase
    .from("job_work_items")
    .update({
      labor_cost: moneySchema.parse(form.get("labor_cost")),
      labor_cost_known: true,
    })
    .eq("id", uuidValue(form, "id"));
  if (error) throw new Error(error.message);
  await refreshWorkshop();
}
export async function voidPaymentAction(form: FormData) {
  const { supabase } = await getAuthedSupabase();
  const reason = noteValue(form, "void_reason");
  if (!reason) throw new Error("Ləğv səbəbi tələb olunur.");
  const { error } = await supabase
    .from("cash_transactions")
    .update({ voided_at: new Date().toISOString(), void_reason: reason })
    .eq("id", uuidValue(form, "id"))
    .is("voided_at", null);
  if (error) throw new Error(error.message);
  await refreshWorkshop();
}
