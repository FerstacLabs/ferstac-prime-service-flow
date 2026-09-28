"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthedSupabase } from "@/lib/supabase/queries";
import { serverMutation } from "@/lib/server-mutation";
import { databaseActionError } from "@/lib/action-errors";
import { uuidValue } from "@/lib/workshop-validation";

export async function manageCatalogAction(form: FormData) {
  return serverMutation(async () => {
    const { supabase } = await getAuthedSupabase("ADMIN");
    const kind = z.enum(["work", "part", "unit"]).parse(form.get("kind"));
    const action = z
      .enum(["create", "rename", "archive", "restore", "delete"])
      .parse(form.get("catalog_action"));
    const name = String(form.get("name") ?? "").trim();
    const { error } =
      action === "create"
        ? await supabase.rpc(
            kind === "unit" ? "create_unit" : "create_catalog_entry",
            {
              ...(kind === "unit" ? {} : { p_kind: kind }),
              p_name: name,
            },
          )
        : await supabase.rpc("manage_catalog", {
            p_kind: kind,
            p_id: uuidValue(form, "id"),
            p_action: action,
            p_name: name,
            p_short_name: String(form.get("short_name") ?? ""),
            p_confirmation: String(form.get("confirmation") ?? ""),
          });
    if (error) return { error: databaseActionError(error) };
    revalidatePath("/", "layout");
  });
}
