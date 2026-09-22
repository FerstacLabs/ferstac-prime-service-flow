"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentAccess, requireAccess } from "@/lib/supabase/auth";
import {
  disabledAccount,
  invalidLogin,
  normalizeUsername,
  roleHome,
  validPassword,
} from "@/lib/security";

function loginError(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

export async function signInAction(formData: FormData) {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(username) || password.length > 128)
    loginError(invalidLogin);
  const supabase = await createSupabaseServerClient();
  if (!supabase) loginError("Giriş xidməti konfiqurasiya edilməyib.");
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("auth_user_id,role,is_active,must_change_password")
    .eq("username", username)
    .maybeSingle();
  const lookup = profile
    ? await admin.auth.admin.getUserById(profile.auth_user_id)
    : null;
  // Unknown usernames also pass through Auth's password verification/rate limit endpoint.
  const email = lookup?.data.user?.email ?? "unassigned@primeflow.invalid";
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user || !profile || data.user.id !== profile.auth_user_id)
    loginError(invalidLogin);
  if (!profile.is_active) {
    await supabase.auth.signOut();
    loginError(disabledAccount);
  }
  const { error: eventError } = await admin.rpc("record_security_event", {
    p_actor: data.user.id,
    p_event: "LOGIN_SUCCESS",
  });
  if (eventError) {
    await supabase.auth.signOut();
    loginError("Giriş tamamlanmadı. Yenidən cəhd edin.");
  }
  redirect(
    profile.must_change_password ? "/change-password" : roleHome(profile.role),
  );
}

export async function changePasswordAction(formData: FormData) {
  const { supabase, user } = await requireAccess(undefined, true);
  const current = String(formData.get("current_password") ?? "");
  const password = String(formData.get("password") ?? "");
  if (
    !validPassword(password) ||
    password !== String(formData.get("confirm_password") ?? "") ||
    password === current
  ) {
    return {
      error:
        "Şifrələr eyni olmalı, yeni şifrə əvvəlkindən fərqlənməli və ən azı 12 simvol, böyük/kiçik hərf və rəqəm içərməlidir.",
    };
  }
  if (!user.email) return { error: "Hesab tapılmadı." };
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (verifyError) return { error: "Cari şifrə yanlışdır." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error)
    return { error: "Şifrə dəyişdirilə bilmədi. Yeni şifrəni yoxlayın." };
  await supabase.auth.signOut({ scope: "global" });
  const { error: eventError } = await createSupabaseAdminClient().rpc(
    "record_security_event",
    { p_actor: user.id, p_event: "PASSWORD_CHANGED" },
  );
  if (eventError)
    loginError(
      "Şifrə yeniləndi, lakin hesab təsdiqi alınmadı. Administratorla əlaqə saxlayın.",
    );
  redirect("/login?changed=1");
}

export async function signOutAction() {
  const access = await getCurrentAccess();
  const supabase = access?.supabase ?? (await createSupabaseServerClient());
  try {
    if (access?.profile.is_active)
      await createSupabaseAdminClient().rpc("record_security_event", {
        p_actor: access.user.id,
        p_event: "LOGOUT",
      });
  } finally {
    if (supabase) await supabase.auth.signOut();
  }
  redirect("/login");
}
