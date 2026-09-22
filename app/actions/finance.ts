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
  await getAuthedSupabase();
  revalidatePath("/", "layout");
}
export async function createCatalogAction(
  kind: "work" | "part" | "role",
  name: string,
) {
  const { supabase } = await getAuthedSupabase(
    ...(kind === "role"
      ? (["ADMIN"] as const)
      : (["ADMIN", "INTAKE"] as const)),
  );
  const { data, error } = await supabase.rpc("create_catalog_entry", {
    p_kind: z.enum(["work", "part", "role"]).parse(kind),
    p_name: name,
  });
  if (error) return { error: error.message };
  await refreshWorkshop();
  return { item: data as { id: string; name: string } };
}
export async function recordPaymentAction(form: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN", "CASHIER");
  const amount = moneySchema.parse(form.get("amount"));
  if (amount <= 0) return { error: "Ödəniş sıfırdan böyük olmalıdır." };
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
  // Expected payment validation must survive production Server Action error redaction.
  if (error) return { error: error.message };
  await refreshWorkshop();
}
export async function setWorkerCostAction(form: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN", "CASHIER");
  const { error } = await supabase.rpc("set_worker_cost", {
    p_cost: moneySchema.parse(form.get("labor_cost")),
    p_id: uuidValue(form, "id"),
  });
  if (error) throw new Error(error.message);
  await refreshWorkshop();
}
export async function voidPaymentAction(form: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const reason = noteValue(form, "void_reason");
  if (!reason) throw new Error("Ləğv səbəbi tələb olunur.");
  const { error } = await supabase.rpc("void_cash_payment", {
    p_id: uuidValue(form, "id"),
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  await refreshWorkshop();
}
