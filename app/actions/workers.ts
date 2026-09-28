"use server";

import { revalidatePath } from "next/cache";
import { getAuthedSupabase } from "@/lib/supabase/queries";
import { noteValue, uuidValue } from "@/lib/workshop-validation";
import { z } from "zod";
import { databaseActionError } from "@/lib/action-errors";
import { serverMutation } from "@/lib/server-mutation";
import { moneySchema } from "@/lib/workshop-validation";

export async function saveWorkerCompensationPolicyAction(form: FormData) {
  return serverMutation(async () => {
    const { supabase } = await getAuthedSupabase("ADMIN");
    const { error } = await supabase.rpc("save_worker_compensation_policy", {
      p_worker: uuidValue(form, "worker_id"),
      p_eligible: form.get("eligible") === "on",
      p_percentage: moneySchema.parse(form.get("worker_percentage")),
    });
    if (error) return { error: databaseActionError(error) };
    revalidatePath("/", "layout");
  });
}

const nullable = (value: FormDataEntryValue | null) => {
  const next = String(value ?? "").trim();
  return next ? next : null;
};

export async function saveWorkerAction(formData: FormData) {
  return serverMutation(async () => {
    const { supabase, user } = await getAuthedSupabase("ADMIN");
    const id = nullable(formData.get("id"));
    const payload = {
      owner_user_id: user.id,
      first_name: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .parse(formData.get("first_name")),
      last_name: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .parse(formData.get("last_name")),
      father_name: nullable(formData.get("father_name")),
      phone: nullable(formData.get("phone")),
      role_id: uuidValue(formData, "role_id"),
      active: formData.get("active") !== "false",
      hire_date: nullable(formData.get("hire_date")),
      notes: noteValue(formData),
    };
    const query = id
      ? supabase
          .from("workers")
          .update({ ...payload, owner_user_id: undefined })
          .eq("id", id)
      : supabase.from("workers").insert(payload);
    const { error } = await query;
    if (error) return { error: databaseActionError(error) };
    revalidatePath("/", "layout");
  });
}

export async function updateWorkItemAction(formData: FormData) {
  return serverMutation(async () => {
    const { supabase } = await getAuthedSupabase("ADMIN", "INTAKE");
    const status = z
      .enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"])
      .parse(formData.get("status"));
    const id = uuidValue(formData, "id");
    const worker = nullable(formData.get("assigned_worker_id"));
    const { error } = await supabase.rpc("update_work_assignment", {
      p_id: id,
      p_worker: worker ? z.uuid().parse(worker) : null,
      p_status: status,
      p_notes: noteValue(formData),
      ...(formData.has("percentage_mode_present")
        ? { p_percentage: formData.get("percentage") === "on" }
        : {}),
    });
    if (error) return { error: databaseActionError(error) };
    revalidatePath("/work");
    revalidatePath("/workers");
    revalidatePath("/overview");
    revalidatePath("/vehicles");
    revalidatePath("/kassa");
  });
}
