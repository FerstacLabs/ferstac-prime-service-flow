"use server";

import { revalidatePath } from "next/cache";
import { getAuthedSupabase } from "@/lib/supabase/queries";
import {
  moneySchema,
  quantitySchema,
  noteValue,
  uuidValue,
} from "@/lib/workshop-validation";
import { decimalMinor, multiplyMoney } from "@/lib/decimal";
import { bakuDate } from "@/lib/filters";
import { z } from "zod";

const text = (value: FormDataEntryValue | null) => {
  const next = String(value ?? "").trim();
  return next ? next : null;
};

export async function saveSupplierAction(formData: FormData) {
  const { supabase, user } = await getAuthedSupabase("ADMIN");
  const id = text(formData.get("id"));
  const payload = {
    owner_user_id: user.id,
    entity_type:
      formData.get("entity_type") === "LEGAL_ENTITY"
        ? "LEGAL_ENTITY"
        : "INDIVIDUAL",
    first_name: text(formData.get("first_name")),
    last_name: text(formData.get("last_name")),
    father_name: text(formData.get("father_name")),
    company_name: text(formData.get("company_name")),
    shop_name: text(formData.get("shop_name")),
    tax_id_voen: text(formData.get("tax_id_voen")),
    phone: text(formData.get("phone")),
    address: text(formData.get("address")),
    notes: noteValue(formData),
    active: formData.get("active") !== "false",
  };
  if (!payload.company_name && !payload.shop_name && !payload.first_name)
    throw new Error("Firma, mağaza və ya şəxsin adı tələb olunur.");
  const query = id
    ? supabase
        .from("suppliers")
        .update({ ...payload, owner_user_id: undefined })
        .eq("id", id)
    : supabase.from("suppliers").insert(payload);
  const { error } = await query;
  if (error) throw error;
  revalidatePath("/purchases");
}

export async function archiveSupplierAction(formData: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const { error } = await supabase
    .from("suppliers")
    .update({ active: false })
    .eq("id", String(formData.get("id") ?? ""));
  if (error) throw error;
  revalidatePath("/purchases");
}

export async function savePurchaseAction(formData: FormData) {
  const { supabase, user } = await getAuthedSupabase("ADMIN");
  const quantity = quantitySchema.parse(formData.get("quantity") || 1);
  const unitPrice = moneySchema.parse(formData.get("unit_price") || 0);
  const status = z
    .enum(["PAID", "PARTIAL", "UNPAID"])
    .parse(formData.get("payment_status") || "UNPAID");
  const paidAmount =
    status === "PAID"
      ? multiplyMoney(quantity, unitPrice)
      : status === "UNPAID"
        ? "0.00"
        : moneySchema.parse(formData.get("paid_amount") || 0);
  const sourceType = z
    .enum(["SUPPLIER", "INTERNAL_STOCK", "CUSTOMER_PROVIDED"])
    .parse(formData.get("source_type"));
  const id = text(formData.get("id"));
  const payload = {
    id,
    required_part_id: text(formData.get("required_part_id")),
    owner_user_id: user.id,
    service_job_id: String(formData.get("service_job_id") ?? ""),
    part_catalog_id: text(formData.get("part_catalog_id")),
    custom_item_name: text(formData.get("custom_item_name")),
    quantity,
    unit_price: unitPrice,
    source_type: sourceType,
    supplier_id:
      sourceType === "SUPPLIER" ? text(formData.get("supplier_id")) : null,
    purchased_by_worker_id: text(formData.get("purchased_by_worker_id")),
    purchased_by_admin: formData.get("purchased_by") !== "worker",
    payment_status: status,
    paid_amount: paidAmount,
    part_code_oem: text(formData.get("part_code_oem")),
    brand_model: text(formData.get("brand_model")),
    serial_no: text(formData.get("serial_no")),
    document_no: text(formData.get("document_no")),
    purchase_date: z.iso
      .date()
      .parse(text(formData.get("purchase_date")) ?? bakuDate()),
    notes: noteValue(formData),
  };
  if (sourceType === "SUPPLIER" && !payload.supplier_id)
    throw new Error("Təchizatçı seçilməlidir.");
  if (!payload.purchased_by_admin && !payload.purchased_by_worker_id)
    throw new Error("Alan işçini seçin.");
  if (
    status === "PARTIAL" &&
    (decimalMinor(paidAmount) <= 0n ||
      decimalMinor(paidAmount) >=
        decimalMinor(multiplyMoney(quantity, unitPrice)))
  )
    throw new Error(
      "Qismən ödəniş maya dəyərindən kiçik və sıfırdan böyük olmalıdır.",
    );
  const { error } = await supabase.rpc("save_workshop_purchase", {
    p_data: payload,
    p_key: uuidValue(formData, "idempotency_key"),
  });
  if (error) throw error;
  revalidatePath("/purchases");
  revalidatePath("/overview");
  revalidatePath("/vehicles");
  revalidatePath("/kassa");
}

export async function deletePurchaseAction(formData: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const { error } = await supabase
    .from("purchases")
    .update({ voided_at: new Date().toISOString() })
    .eq("id", uuidValue(formData, "id"));
  if (error) throw error;
  revalidatePath("/purchases");
  revalidatePath("/overview");
  revalidatePath("/vehicles");
}
