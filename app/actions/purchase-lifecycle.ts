"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthedSupabase } from "@/lib/supabase/queries";
import { serverMutation } from "@/lib/server-mutation";
import { databaseActionError } from "@/lib/action-errors";
import {
  moneySchema,
  quantitySchema,
  uuidValue,
} from "@/lib/workshop-validation";
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const payment = (f: FormData) => ({
  channel: z.enum(["CASH", "BANK"]).parse(f.get("channel") ?? "CASH"),
  financial_account_id: text(f, "financial_account_id") || null,
  payment_method: text(f, "payment_method") || "CASH",
  occurred_at: new Date(text(f, "occurred_at") + "+04:00").toISOString(),
  reference_number: text(f, "reference_number"),
  bank_reference: text(f, "bank_reference"),
  purpose: text(f, "purpose"),
  notes: text(f, "notes"),
});
export async function changePurchaseAction(f: FormData) {
  return serverMutation(async () => {
    const { supabase } = await getAuthedSupabase("ADMIN");
    const exchange = text(f, "operation") === "exchange";
    const { error } = await supabase.rpc(
      exchange ? "exchange_purchase" : "return_purchase",
      {
        p_purchase: uuidValue(f, "purchase_id"),
        p_key: uuidValue(f, "idempotency_key"),
        p_data: {
          ...payment(f),
          reason: z.string().min(1).max(500).parse(text(f, "reason")),
          handling: z.enum(["CREDIT", "REFUND"]).parse(f.get("handling")),
          ...(exchange
            ? {
                new_name: z.string().min(1).max(120).parse(text(f, "new_name")),
                unit_name: z
                  .string()
                  .min(1)
                  .max(30)
                  .parse(text(f, "unit_name")),
                new_quantity: quantitySchema.parse(f.get("new_quantity")),
                new_unit_price: moneySchema.parse(f.get("new_unit_price")),
                document_no: text(f, "document_no"),
                part_code_oem: text(f, "part_code_oem"),
              }
            : { quantity: quantitySchema.parse(f.get("quantity")) }),
        },
      },
    );
    if (error) return { error: databaseActionError(error) };
    revalidatePath("/", "layout");
  });
}
export async function refundSupplierAction(f: FormData) {
  return serverMutation(async () => {
    const { supabase } = await getAuthedSupabase("ADMIN", "CASHIER");
    const { error } = await supabase.rpc("refund_supplier_credit", {
      p_return: uuidValue(f, "return_id"),
      p_key: uuidValue(f, "idempotency_key"),
      p_data: { ...payment(f), amount: moneySchema.parse(f.get("amount")) },
    });
    if (error) return { error: databaseActionError(error) };
    revalidatePath("/", "layout");
  });
}
export async function applySupplierCreditAction(f: FormData) {
  return serverMutation(async () => {
    const { supabase } = await getAuthedSupabase("ADMIN");
    const { error } = await supabase.rpc("apply_supplier_credit", {
      p_return: uuidValue(f, "return_id"),
      p_purchase: uuidValue(f, "purchase_id"),
      p_amount: moneySchema.parse(f.get("amount")),
      p_key: uuidValue(f, "idempotency_key"),
    });
    if (error) return { error: databaseActionError(error) };
    revalidatePath("/", "layout");
  });
}
