"use server";

import { revalidatePath } from "next/cache";
import { getAuthedSupabase } from "@/lib/supabase/queries";

const text = (value: FormDataEntryValue | null) => {
  const next = String(value ?? "").trim();
  return next ? next : null;
};

export async function saveSupplierAction(formData: FormData) {
  const { supabase, user } = await getAuthedSupabase();
  const id = text(formData.get("id"));
  const payload = {
    owner_user_id: user.id,
    entity_type: formData.get("entity_type") === "LEGAL_ENTITY" ? "LEGAL_ENTITY" : "INDIVIDUAL",
    first_name: text(formData.get("first_name")),
    last_name: text(formData.get("last_name")),
    father_name: text(formData.get("father_name")),
    company_name: text(formData.get("company_name")),
    shop_name: text(formData.get("shop_name")),
    tax_id_voen: text(formData.get("tax_id_voen")),
    phone: text(formData.get("phone")),
    address: text(formData.get("address")),
    notes: text(formData.get("notes")),
    active: formData.get("active") !== "false"
  };
  const query = id ? supabase.from("suppliers").update(payload).eq("id", id) : supabase.from("suppliers").insert(payload);
  const { error } = await query;
  if (error) throw error;
  revalidatePath("/purchases");
}

export async function archiveSupplierAction(formData: FormData) {
  const { supabase } = await getAuthedSupabase();
  const { error } = await supabase.from("suppliers").update({ active: false }).eq("id", String(formData.get("id") ?? ""));
  if (error) throw error;
  revalidatePath("/purchases");
}

export async function savePurchaseAction(formData: FormData) {
  const { supabase, user } = await getAuthedSupabase();
  const quantity = Number(formData.get("quantity") || 1);
  const unitPrice = Number(formData.get("unit_price") || 0);
  const status = String(formData.get("payment_status") || "UNPAID");
  const paidAmount = status === "PAID" ? quantity * unitPrice : status === "UNPAID" ? 0 : Number(formData.get("paid_amount") || 0);
  const sourceType = String(formData.get("source_type") || "SUPPLIER");
  const id = text(formData.get("id"));
  const payload = {
    owner_user_id: user.id,
    service_job_id: String(formData.get("service_job_id") ?? ""),
    part_catalog_id: text(formData.get("part_catalog_id")),
    custom_item_name: text(formData.get("custom_item_name")),
    quantity,
    unit_price: unitPrice,
    source_type: sourceType,
    supplier_id: sourceType === "SUPPLIER" ? text(formData.get("supplier_id")) : null,
    purchased_by_worker_id: text(formData.get("purchased_by_worker_id")),
    purchased_by_admin: formData.get("purchased_by") !== "worker",
    payment_status: status,
    paid_amount: paidAmount,
    part_code_oem: text(formData.get("part_code_oem")),
    brand_model: text(formData.get("brand_model")),
    serial_no: text(formData.get("serial_no")),
    document_no: text(formData.get("document_no")),
    purchase_date: text(formData.get("purchase_date")) ?? new Date().toISOString().slice(0, 10),
    notes: text(formData.get("notes"))
  };
  const query = id ? supabase.from("purchases").update(payload).eq("id", id) : supabase.from("purchases").insert(payload);
  const { error } = await query;
  if (error) throw error;
  revalidatePath("/purchases");
  revalidatePath("/overview");
  revalidatePath("/vehicles");
}

export async function deletePurchaseAction(formData: FormData) {
  const { supabase } = await getAuthedSupabase();
  const { error } = await supabase.from("purchases").delete().eq("id", String(formData.get("id") ?? ""));
  if (error) throw error;
  revalidatePath("/purchases");
  revalidatePath("/overview");
  revalidatePath("/vehicles");
}

