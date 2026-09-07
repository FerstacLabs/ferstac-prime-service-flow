"use server";

import { revalidatePath } from "next/cache";
import { getAuthedSupabase } from "@/lib/supabase/queries";

const nullable = (value: FormDataEntryValue | null) => {
  const next = String(value ?? "").trim();
  return next ? next : null;
};

export async function saveWorkerAction(formData: FormData) {
  const { supabase, user } = await getAuthedSupabase();
  const id = nullable(formData.get("id"));
  const payload = {
    owner_user_id: user.id,
    first_name: String(formData.get("first_name") ?? "").trim(),
    last_name: String(formData.get("last_name") ?? "").trim(),
    father_name: nullable(formData.get("father_name")),
    phone: nullable(formData.get("phone")),
    role_id: String(formData.get("role_id") ?? ""),
    active: formData.get("active") !== "false",
    hire_date: nullable(formData.get("hire_date")),
    notes: nullable(formData.get("notes"))
  };
  const query = id ? supabase.from("workers").update(payload).eq("id", id) : supabase.from("workers").insert(payload);
  const { error } = await query;
  if (error) throw error;
  revalidatePath("/workers");
  revalidatePath("/work");
}

export async function updateWorkItemAction(formData: FormData) {
  const { supabase } = await getAuthedSupabase();
  const status = String(formData.get("status") ?? "TODO");
  const now = new Date().toISOString();
  const payload = {
    assigned_worker_id: nullable(formData.get("assigned_worker_id")),
    status,
    labor_cost: Number(formData.get("labor_cost") || 0),
    notes: nullable(formData.get("notes")),
    started_at: status === "IN_PROGRESS" ? now : nullable(formData.get("started_at")),
    completed_at: status === "DONE" ? now : nullable(formData.get("completed_at"))
  };
  const { error } = await supabase.from("job_work_items").update(payload).eq("id", String(formData.get("id") ?? ""));
  if (error) throw error;
  revalidatePath("/work");
  revalidatePath("/workers");
  revalidatePath("/overview");
  revalidatePath("/vehicles");
}

