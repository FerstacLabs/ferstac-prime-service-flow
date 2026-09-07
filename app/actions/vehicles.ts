"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { normalizeAzPlate, isValidAzPlate } from "@/lib/plate";
import { getAuthedSupabase } from "@/lib/supabase/queries";

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
  if (!isValidAzPlate(plate)) throw new Error("Dövlət qeydiyyat nişanı 99-AA-999 formatında olmalıdır.");

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
    vin_body_number: nullable(formData.get("vin_body_number"))?.toUpperCase() ?? null,
    chassis_number: nullable(formData.get("chassis_number")),
    engine_number: nullable(formData.get("engine_number")),
    engine_power_hp: numberOrNull(formData.get("engine_power_hp")),
    engine_power_kw: numberOrNull(formData.get("engine_power_kw")),
    color: nullable(formData.get("color")),
    registration_certificate_series_no: nullable(formData.get("registration_certificate_series_no")),
    registration_valid_until: nullable(formData.get("registration_valid_until")),
    max_permitted_mass_kg: numberOrNull(formData.get("max_permitted_mass_kg")),
    unladen_mass_kg: numberOrNull(formData.get("unladen_mass_kg")),
    registered_owner_full_name: nullable(formData.get("registered_owner_full_name")),
    registered_owner_address: nullable(formData.get("registered_owner_address"))
  };

  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .upsert(vehiclePayload, { onConflict: "owner_user_id,plate" })
    .select("id")
    .single();
  if (vehicleError) throw vehicleError;

  const year = new Date().getFullYear();
  const start = `${year}-01-01T00:00:00.000Z`;
  const { count } = await supabase
    .from("service_jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .gte("created_at", start);
  const jobNo = `PR-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data: job, error: jobError } = await supabase
    .from("service_jobs")
    .insert({
      owner_user_id: user.id,
      vehicle_id: vehicle.id,
      job_no: jobNo,
      customer_name: nullable(formData.get("customer_name")),
      customer_phone: nullable(formData.get("customer_phone")),
      funding_source: formData.get("funding_source") === "INSURANCE_CLAIM" ? "INSURANCE_CLAIM" : "CUSTOMER_FUNDED",
      insurance_company: nullable(formData.get("insurance_company")),
      insurance_claim_no: nullable(formData.get("insurance_claim_no")),
      insurance_approved_amount: numberOrNull(formData.get("insurance_approved_amount")),
      agreed_budget: Number(formData.get("agreed_budget") || 0),
      status: "RECEIVED",
      received_at: nullable(formData.get("received_at")) ?? new Date().toISOString(),
      target_delivery_date: nullable(formData.get("target_delivery_date")),
      notes: nullable(formData.get("notes"))
    })
    .select("id")
    .single();
  if (jobError) throw jobError;

  const workIds = formData.getAll("work_catalog_id").map(String).filter(Boolean);
  const customTitle = nullable(formData.get("custom_work_title"));
  const workRows = [
    ...workIds.map((id) => ({ owner_user_id: user.id, service_job_id: job.id, work_catalog_id: id, planned_at: new Date().toISOString() })),
    ...(customTitle ? [{ owner_user_id: user.id, service_job_id: job.id, custom_title: customTitle, planned_at: new Date().toISOString() }] : [])
  ];
  if (workRows.length) {
    const { error } = await supabase.from("job_work_items").insert(workRows);
    if (error) throw error;
  }

  revalidatePath("/vehicles");
  revalidatePath("/overview");
  revalidatePath("/work");
  redirect(`/vehicles/${job.id}?saved=1`);
}

export async function archiveServiceJobAction(formData: FormData) {
  const { supabase } = await getAuthedSupabase();
  const id = String(formData.get("id") ?? "");
  const { error } = await supabase.from("service_jobs").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  revalidatePath("/vehicles");
  revalidatePath("/overview");
  redirect("/vehicles?archived=1");
}

