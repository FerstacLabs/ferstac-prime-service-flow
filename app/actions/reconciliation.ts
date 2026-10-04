"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccess } from "@/lib/supabase/auth";
import { getReconciliation } from "@/lib/supabase/reconciliation";
import { serverMutation } from "@/lib/server-mutation";
import { databaseActionError } from "@/lib/action-errors";

export async function saveReconciliationAction(form: FormData) {
  return serverMutation(async () => {
    const { supabase } = await requireAccess(["ADMIN", "CASHIER"]);
    const previousId = form.get("previous");
    const previous = previousId
      ? await getReconciliation(z.uuid().parse(previousId))
      : null;
    if (previousId && !previous)
      throw new Error("Əvvəlki hesablaşma tapılmadı.");
    const id = form.get("idempotency_key")
      ? z.uuid().parse(form.get("idempotency_key"))
      : randomUUID();
    const { error } = await supabase.rpc("create_reconciliation", {
      p_id: id,
      p_type:
        previous?.entity_type ??
        z.enum(["worker", "supplier"]).parse(form.get("entity_type")),
      p_entity: previous?.entity_id ?? z.uuid().parse(form.get("entity_id")),
      p_from: previous?.period_from ?? z.iso.date().parse(form.get("from")),
      p_to: previous?.period_to ?? z.iso.date().parse(form.get("to")),
      p_job:
        previous?.service_job_id ??
        (form.get("job") ? z.uuid().parse(form.get("job")) : null),
      p_note: z
        .string()
        .max(1000)
        .parse(form.get("note") ?? ""),
      p_previous: previous?.id ?? null,
    });
    if (error) throw new Error(databaseActionError(error));
    await getReconciliation(id, true);
    revalidatePath("/kassa");
    redirect(`/kassa/reconciliations/${id}`);
  });
}
export async function confirmReconciliationAction(form: FormData) {
  return serverMutation(async () => {
    const { supabase } = await requireAccess(["ADMIN", "CASHIER"]);
    const id = z.uuid().parse(form.get("id"));
    const { error } = await supabase.rpc("confirm_reconciliation", {
      p_id: id,
    });
    if (error) throw new Error(databaseActionError(error));
    revalidatePath("/kassa");
    revalidatePath(`/kassa/reconciliations/${id}`);
  });
}
