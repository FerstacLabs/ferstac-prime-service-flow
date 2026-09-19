"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { normalizeAzPlate, isValidAzPlate } from "@/lib/plate";
import { getAuthedSupabase } from "@/lib/supabase/queries";
import {
  moneySchema,
  noteValue,
  quoteLinesSchema,
  uuidValue,
} from "@/lib/workshop-validation";

function nullable(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function numberOrNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? Number(text) : null;
}

export async function createServiceJobAction(formData: FormData) {
  const { supabase, user } = await getAuthedSupabase();
  const plate = normalizeAzPlate(String(formData.get("plate") ?? ""));
  if (!isValidAzPlate(plate))
    throw new Error("Dövlət qeydiyyat nişanı 99-AA-999 formatında olmalıdır.");

  const make = String(formData.get("make") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  if (!make || !model) throw new Error("Marka və model tələb olunur.");

  const vehiclePayload = {
    owner_user_id: user.id,
    plate,
    make,
    model,
    vehicle_type: nullable(formData.get("vehicle_type")),
    body_type: nullable(formData.get("body_type")),
    manufacturer: nullable(formData.get("manufacturer")),
    production_year: numberOrNull(formData.get("production_year")),
    first_registration_date: nullable(formData.get("first_registration_date")),
    vin_body_number:
      nullable(formData.get("vin_body_number"))?.toUpperCase() ?? null,
    chassis_number: nullable(formData.get("chassis_number")),
    engine_number: nullable(formData.get("engine_number")),
    engine_power_hp: numberOrNull(formData.get("engine_power_hp")),
    engine_power_kw: numberOrNull(formData.get("engine_power_kw")),
    color: nullable(formData.get("color")),
    registration_certificate_series_no: nullable(
      formData.get("registration_certificate_series_no"),
    ),
    registration_valid_until: nullable(
      formData.get("registration_valid_until"),
    ),
    max_permitted_mass_kg: numberOrNull(formData.get("max_permitted_mass_kg")),
    unladen_mass_kg: numberOrNull(formData.get("unladen_mass_kg")),
    registered_owner_full_name: nullable(
      formData.get("registered_owner_full_name"),
    ),
    registered_owner_address: nullable(
      formData.get("registered_owner_address"),
    ),
  };

  const works = quoteLinesSchema.parse(
    JSON.parse(String(formData.get("work_lines") ?? "[]")),
  );
  const parts = quoteLinesSchema.parse(
    JSON.parse(String(formData.get("part_lines") ?? "[]")),
  );
  if (!works.length && !parts.length)
    throw new Error("Ən azı bir iş və ya detal tələb olunur.");
  const received = nullable(formData.get("received_at"));
  const { data: jobId, error: jobError } = await supabase.rpc(
    "create_workshop_job",
    {
      p_key: uuidValue(formData, "idempotency_key"),
      p_vehicle: vehiclePayload,
      p_works: works,
      p_parts: parts,
      p_job: {
        customer_name: nullable(formData.get("customer_name")),
        customer_phone: nullable(formData.get("customer_phone")),
        funding_source:
          formData.get("funding_source") === "INSURANCE_CLAIM"
            ? "INSURANCE_CLAIM"
            : "CUSTOMER_FUNDED",
        insurance_company: nullable(formData.get("insurance_company")),
        insurance_claim_no: nullable(formData.get("insurance_claim_no")),
        insurance_approved_amount: numberOrNull(
          formData.get("insurance_approved_amount"),
        ),
        agreed_budget: moneySchema.parse(formData.get("agreed_budget") || 0),
        received_at: received ? `${received}+04:00` : new Date().toISOString(),
        target_delivery_date: nullable(formData.get("target_delivery_date")),
        notes: noteValue(formData),
      },
    },
  );
  if (jobError) throw jobError;

  revalidatePath("/vehicles");
  revalidatePath("/overview");
  revalidatePath("/work");
  redirect(`/vehicles/${jobId}?saved=1`);
}

export async function archiveServiceJobAction(formData: FormData) {
  await setArchiveState(formData, true);
}

export async function restoreServiceJobAction(formData: FormData) {
  await setArchiveState(formData, false);
}

async function setArchiveState(formData: FormData, archived: boolean) {
  const { supabase, user } = await getAuthedSupabase();
  const id = uuidValue(formData, "id");
  const { error } = await supabase
    .from("service_jobs")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .select("id")
    .single();
  if (error)
    throw new Error("Servis kartının arxiv vəziyyəti dəyişdirilə bilmədi.");
  revalidatePath("/", "layout");
  redirect(`/vehicles?visibility=${archived ? "archived" : "active"}`);
}
