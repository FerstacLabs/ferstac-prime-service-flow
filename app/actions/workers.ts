"use server";

import { revalidatePath } from "next/cache";
import { getAuthedSupabase } from "@/lib/supabase/queries";
import { noteValue, uuidValue } from "@/lib/workshop-validation";
import { z } from "zod";

const nullable = (value: FormDataEntryValue | null) => {
  const next = String(value ?? "").trim();
  return next ? next : null;
};

export async function saveWorkerAction(formData: FormData) {
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
  if (error) throw error;
  revalidatePath("/workers");
  revalidatePath("/work");
}

export async function updateWorkItemAction(formData: FormData) {
  const { supabase } = await getAuthedSupabase("ADMIN");
  const status = z
    .enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"])
    .parse(formData.get("status"));
  const id = uuidValue(formData, "id");
  const { data: existing, error: readError } = await supabase
    .from("job_work_items")
    .select("status,started_at,completed_at")
    .eq("id", id)
    .single();
  if (readError) throw readError;
  const now = new Date().toISOString();
  const payload = {
    assigned_worker_id: nullable(formData.get("assigned_worker_id")),
    status,
    notes: noteValue(formData),
    started_at:
      existing.started_at ||
      (status === "IN_PROGRESS" || status === "DONE" ? now : null),
    completed_at: status === "DONE" ? existing.completed_at || now : null,
  };
  const { error } = await supabase
    .from("job_work_items")
    .update(payload)
    .eq("id", String(formData.get("id") ?? ""));
  if (error) throw error;
  revalidatePath("/work");
  revalidatePath("/workers");
  revalidatePath("/overview");
  revalidatePath("/vehicles");
  revalidatePath("/kassa");
}
