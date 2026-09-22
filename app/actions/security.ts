"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { uuidValue } from "@/lib/workshop-validation";
import { z } from "zod";

export async function manageAccountAction(
  _state: { error?: string; password?: string; success?: string },
  form: FormData,
): Promise<{ error?: string; password?: string; success?: string }> {
  const { user, profile } = await requireAccess(["ADMIN"]);
  const target = uuidValue(form, "target"),
    operation = z
      .enum(["enable", "disable", "reset"])
      .parse(form.get("operation"));
  const admin = createSupabaseAdminClient();
  const { data: member } = await admin
    .from("user_profiles")
    .select("auth_user_id,role")
    .eq("auth_user_id", target)
    .eq("organization_id", profile.organization_id)
    .single();
  if (!member || member.role === "ADMIN")
    return { error: "Bu hesab dəyişdirilə bilməz." };
  // Fail closed first: an Auth reset failure leaves the old session blocked by the DB.
  const { error } = await admin.rpc("manage_staff_account", {
    p_actor: user.id,
    p_target: target,
    p_operation: operation,
  });
  if (error) return { error: "Hesab yenilənmədi." };
  if (operation === "reset") {
    const password = `P9a!${randomBytes(24).toString("base64url")}`;
    const { error: resetError } = await admin.auth.admin.updateUserById(
      target,
      { password },
    );
    if (resetError)
      return {
        error: "Şifrə yenilənmədi; hesab məhdudlaşdırıldı. Yenidən cəhd edin.",
      };
    revalidatePath("/security");
    return { password };
  }
  revalidatePath("/security");
  return { success: "Hesab yeniləndi." };
}
