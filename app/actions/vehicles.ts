"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { normalizeAzPlate, isValidAzPlate } from "@/lib/plate";
import { getAuthedSupabase } from "@/lib/supabase/queries";
import { vehicleIntakeFields, jobIntakeFields } from "@/lib/intake-fields";
import { z } from "zod";
import { parseIntakeDate } from "@/lib/intake-date";
import {
  moneySchema,
  noteValue,
  quoteLinesSchema,
  quantitySchema,
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
  const { supabase, user } = await getAuthedSupabase("ADMIN", "INTAKE");
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
        insurance_approved_amount: nullable(
          formData.get("insurance_approved_amount"),
        )
          ? moneySchema.parse(formData.get("insurance_approved_amount"))
          : null,
        received_at: received
          ? `${parseIntakeDate(received)}T00:00:00+04:00`
          : new Date().toISOString(),
        target_delivery_date: nullable(formData.get("target_delivery_date"))
          ? parseIntakeDate(formData.get("target_delivery_date"))
          : null,
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
  const { supabase, profile } = await getAuthedSupabase("ADMIN");
  const id = uuidValue(formData, "id");
  const { error } = await supabase
    .from("service_jobs")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      ...(!archived ? { deleted_at: null } : {}),
    })
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .select("id")
    .single();
  if (error)
    throw new Error("Servis kartının arxiv vəziyyəti dəyişdirilə bilmədi.");
  revalidatePath("/", "layout");
  redirect(`/vehicles?visibility=${archived ? "archived" : "active"}`);
}

export async function updateVehicleIntakeAction(form: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN", "INTAKE");
  const readFields = (fields: typeof vehicleIntakeFields) =>
    Object.fromEntries(
      fields.map(({ name, type, required }) => {
        const raw = String(form.get(name) ?? "").trim();
        if (required && !raw)
          throw new Error("Tələb olunan sahələri doldurun.");
        return [
          name,
          !raw
            ? null
            : type === "number"
              ? z.coerce.number().finite().nonnegative().parse(raw)
              : type === "date"
                ? parseIntakeDate(raw)
                : z.string().max(500).parse(raw),
        ];
      }),
    );
  const vehicle = readFields(vehicleIntakeFields);
  vehicle.plate = normalizeAzPlate(String(vehicle.plate));
  if (!isValidAzPlate(String(vehicle.plate)))
    return { error: "Dövlət qeydiyyat nişanı 99-AA-999 formatında olmalıdır." };
  const received = String(form.get("received_at") ?? "");
  const { error } = await supabase.rpc("update_vehicle_intake", {
    p_job: uuidValue(form, "service_job_id"),
    p_vehicle: vehicle,
    p_details: {
      ...readFields(jobIntakeFields),
      insurance_company: nullable(form.get("insurance_company")),
      insurance_claim_no: nullable(form.get("insurance_claim_no")),
      insurance_approved_amount: nullable(form.get("insurance_approved_amount"))
        ? moneySchema.parse(form.get("insurance_approved_amount"))
        : null,
      funding_source: z
        .enum(["CUSTOMER_FUNDED", "INSURANCE_CLAIM"])
        .parse(form.get("funding_source")),
      received_at: received
        ? `${parseIntakeDate(received)}T00:00:00+04:00`
        : undefined,
      notes: noteValue(form),
    },
  });
  if (error) return { error: "Qeydiyyat saxlanmadı. Məlumatları yoxlayın." };
  revalidatePath("/", "layout");
}

export async function saveQuoteLineAction(form: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN", "INTAKE");
  const { error } = await supabase.rpc("save_quote_line", {
    p_job: uuidValue(form, "service_job_id"),
    p_kind: z.enum(["work", "part"]).parse(form.get("kind")),
    p_catalog: uuidValue(form, "catalog_id"),
    p_price: moneySchema.parse(form.get("quoted_price")),
    p_note: noteValue(form),
    p_quantity: quantitySchema.parse(form.get("quantity") || 1),
    p_unit: uuidValue(form, "unit_id"),
    p_cost_note: noteValue(form, "cost_note"),
  });
  if (error)
    return {
      error: "Təklif saxlanmadı. Qiyməti və bağlı əməliyyatları yoxlayın.",
    };
  revalidatePath("/", "layout");
}

export async function deleteServiceJobAction(form: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const { error } = await supabase.rpc("soft_delete_service_job", {
    p_job: uuidValue(form, "id"),
  });
  if (error) return { error: "Servis kartı silinmədi." };
  revalidatePath("/", "layout");
  redirect("/vehicles");
}
