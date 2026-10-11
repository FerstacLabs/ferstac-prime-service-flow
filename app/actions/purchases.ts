"use server";

import { revalidatePath } from "next/cache";
import { getAuthedSupabase } from "@/lib/supabase/queries";
import {
  moneySchema,
  quantitySchema,
  noteValue,
  uuidValue,
} from "@/lib/workshop-validation";
import { decimalMinor, multiplyMoney, fromMinor } from "@/lib/decimal";
import { bakuDate } from "@/lib/filters";
import { z } from "zod";
import { databaseActionError, duplicatePartFailure } from "@/lib/action-errors";
import { serverMutation } from "@/lib/server-mutation";
import { vatPricing } from "@/lib/vat";
import { createHash } from "node:crypto";

const text = (value: FormDataEntryValue | null) => {
  const next = String(value ?? "").trim();
  return next ? next : null;
};

export async function saveSupplierAction(formData: FormData) {
  return serverMutation(async () => {
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
    if (error) return { error: databaseActionError(error) };
    revalidatePath("/", "layout");
  });
}

export async function archiveSupplierAction(formData: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const { error } = await supabase
    .from("suppliers")
    .update({ active: formData.get("restore") === "true" })
    .eq("id", uuidValue(formData, "id"))
    .select("id")
    .single();
  if (error) return { error: databaseActionError(error) };
  revalidatePath("/", "layout");
}

export async function savePurchaseAction(formData: FormData) {
  return serverMutation(async () => {
    const { supabase, user } = await getAuthedSupabase("ADMIN");
    const quantity = quantitySchema.parse(formData.get("quantity") || 1);
    const unitPrice = moneySchema.parse(formData.get("unit_price") || 0);
    const vatEnabled =
      formData.get("source_type") === "SUPPLIER" &&
      formData.get("vat_enabled") === "true";
    const gross = vatPricing(
      multiplyMoney(quantity, unitPrice),
      vatEnabled,
    ).gross;
    const status = z
      .enum(["PAID", "PARTIAL", "UNPAID"])
      .parse(formData.get("payment_status") || "UNPAID");
    const paidAmount =
      status === "PAID"
        ? gross
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
      service_job_id: uuidValue(formData, "service_job_id"),
      part_catalog_id: text(formData.get("part_catalog_id")),
      custom_item_name: text(formData.get("custom_item_name")),
      quantity,
      unit_price: unitPrice,
      source_type: sourceType,
      vat_enabled:
        sourceType === "SUPPLIER" && formData.get("vat_enabled") === "true",
      supplier_id:
        sourceType === "SUPPLIER" ? text(formData.get("supplier_id")) : null,
      purchased_by_worker_id:
        formData.get("purchased_by") === "worker"
          ? text(formData.get("purchased_by_worker_id"))
          : null,
      purchased_by_admin: formData.get("purchased_by") !== "worker",
      payment_status: "UNPAID",
      paid_amount: "0.00",
      part_code_oem: text(formData.get("part_code_oem")),
      brand_model: text(formData.get("brand_model")),
      serial_no: text(formData.get("serial_no")),
      document_no: text(formData.get("document_no")),
      purchase_date: z.iso
        .date()
        .parse(text(formData.get("purchase_date")) ?? bakuDate()),
      notes: noteValue(formData),
      ...(formData.get("additional") === "true"
        ? {
            additional: true,
            quoted_quantity: quantitySchema.parse(
              formData.get("quoted_quantity"),
            ),
            unit_id: uuidValue(formData, "unit_id"),
            customer_unit_price: moneySchema.parse(
              formData.get("customer_unit_price") || 0,
            ),
            cost_note: noteValue(formData, "cost_note"),
          }
        : {}),
    };
    if (sourceType === "SUPPLIER" && !payload.supplier_id)
      throw new Error("Təchizatçı seçilməlidir.");
    if (!payload.purchased_by_admin && !payload.purchased_by_worker_id)
      throw new Error("Alan işçini seçin.");
    if (
      status === "PARTIAL" &&
      (decimalMinor(paidAmount) <= 0n ||
        decimalMinor(paidAmount) >= decimalMinor(gross))
    )
      throw new Error(
        "Qismən ödəniş yekun məbləğdən kiçik və sıfırdan böyük olmalıdır.",
      );
    const key = uuidValue(formData, "idempotency_key");
    if (id && sourceType === "SUPPLIER") {
      const { data: existing, error: existingError } = await supabase
        .from("purchases")
        .select("paid_amount")
        .eq("id", uuidValue(formData, "id"))
        .single();
      if (existingError) return { error: databaseActionError(existingError) };
      if (decimalMinor(existing.paid_amount) > decimalMinor(paidAmount))
        return {
          error:
            "Əvvəlki ödənişi azaltmaq üçün Kassa ləğvetməsindən istifadə edin.",
        };
    }
    const channel = z
      .enum(["CASH", "BANK"])
      .parse(formData.get("channel") || "CASH");
    const account =
      channel === "BANK" ? uuidValue(formData, "financial_account_id") : null;
    const method =
      channel === "BANK"
        ? z
            .enum(["TRANSFER", "POS", "ONLINE", "OTHER"])
            .parse(formData.get("payment_method"))
        : "CASH";
    const paymentAt =
      sourceType === "SUPPLIER" && status !== "UNPAID"
        ? z.iso
            .datetime({ offset: true })
            .parse(`${String(formData.get("payment_at"))}:00+04:00`)
        : null;
    const { data: purchaseId, error } = await supabase.rpc(
      "save_workshop_purchase",
      {
        p_data: payload,
        p_key: key,
      },
    );
    if (error)
      return {
        error:
          error.code === "23505" && payload.additional
            ? duplicatePartFailure
            : databaseActionError(error),
      };
    if (sourceType === "SUPPLIER" && status !== "UNPAID") {
      // A stable, separate key allows a failed payment to be retried without
      // duplicating either the saved purchase or its canonical ledger payment.
      const hash = createHash("sha256")
        .update(`purchase-payment:${key}`)
        .digest("hex");
      const paymentKey = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      const { data: prior, error: lookupError } = await supabase
        .from("cash_transactions")
        .select("id")
        .eq("idempotency_key", paymentKey)
        .maybeSingle();
      if (lookupError) return { error: databaseActionError(lookupError) };
      if (!prior) {
        const { data: saved, error: readError } = await supabase
          .from("purchases")
          .select("paid_amount,gross_amount")
          .eq("id", purchaseId)
          .single();
        if (readError) return { error: databaseActionError(readError) };
        if (decimalMinor(saved.gross_amount) !== decimalMinor(gross))
          return {
            error:
              "Saxlanmış alış məbləği fərqlidir. Alışı yenidən açıb yoxlayın; ödəniş edilmədi.",
          };
        const due = decimalMinor(paidAmount) - decimalMinor(saved.paid_amount);
        if (due < 0n)
          return {
            error:
              "Əvvəlki ödənişi azaltmaq üçün Kassa ləğvetməsindən istifadə edin.",
          };
        if (due > 0n) {
          const { error: paymentError } = await supabase.rpc(
            "record_financial_transaction",
            {
              p_key: paymentKey,
              p_data: {
                allocation_type: "SUPPLIER_PURCHASE",
                service_job_id: payload.service_job_id,
                target_id: purchaseId,
                amount: fromMinor(due),
                channel,
                financial_account_id: account,
                payment_method: method,
                occurred_at: paymentAt,
                bank_reference: text(formData.get("bank_reference")),
                reference_number: payload.document_no,
                purpose: "Alış zamanı ödəniş",
                notes: payload.notes,
              },
            },
          );
          if (paymentError) {
            return {
              error: `Alış saxlanıldı, ödəniş edilmədi. ${databaseActionError(paymentError)} Yenidən cəhd edə və ya Kassa vasitəsilə ödəyə bilərsiniz.`,
            };
          }
        }
      }
    }
    revalidatePath("/", "layout");
  });
}

export async function saveWorkCostingAction(form: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const { error } = await supabase.rpc("set_work_compensation", {
    p_id: uuidValue(form, "id"),
    p_worker: text(form.get("assigned_worker_id"))
      ? uuidValue(form, "assigned_worker_id")
      : null,
    p_percentage: form.get("percentage") === "on",
    p_cost:
      form.get("percentage") === "on"
        ? null
        : moneySchema.parse(form.get("labor_cost")),
  });
  if (error) return { error: databaseActionError(error) };
  revalidatePath("/", "layout");
}

export async function createAdditionalWorkAction(form: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const { error } = await supabase.rpc("create_additional_work", {
    p_key: uuidValue(form, "idempotency_key"),
    p_data: {
      service_job_id: uuidValue(form, "service_job_id"),
      catalog_id: uuidValue(form, "catalog_id"),
      quantity: quantitySchema.parse(form.get("quoted_quantity")),
      unit_id: uuidValue(form, "unit_id"),
      customer_unit_price: moneySchema.parse(form.get("customer_unit_price")),
      notes: noteValue(form),
      cost_note: noteValue(form, "cost_note"),
      worker_id: text(form.get("assigned_worker_id"))
        ? uuidValue(form, "assigned_worker_id")
        : null,
      labor_cost:
        form.get("percentage") === "on"
          ? "0.00"
          : moneySchema.parse(form.get("labor_cost")),
      percentage: form.get("percentage") === "on",
    },
  });
  if (error) return { error: databaseActionError(error) };
  revalidatePath("/", "layout");
}

export async function deletePurchaseAction(formData: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const { error } = await supabase
    .from("purchases")
    .update({ voided_at: new Date().toISOString() })
    .eq("id", uuidValue(formData, "id"));
  if (error) return { error: databaseActionError(error) };
  revalidatePath("/purchases");
  revalidatePath("/overview");
  revalidatePath("/vehicles");
}
