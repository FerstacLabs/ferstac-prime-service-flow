import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cache } from "react";
import {
  appRoles,
  roleHome,
  disabledAccount,
  type AccessProfile,
  type AppRole,
} from "@/lib/security";

export const getCurrentAccess = cache(async () => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile, error: profileError } =
    await supabase.rpc("get_access_profile");
  if (profileError || !profile || !appRoles.includes(profile.role)) return null;
  return { supabase, user, profile: profile as AccessProfile };
});

export async function requireAccess(
  roles: readonly AppRole[] = appRoles,
  allowPasswordChange = false,
) {
  const access = await getCurrentAccess();
  if (!access) redirect("/login");
  const { profile } = access;
  if (!profile.is_active)
    redirect(`/login?error=${encodeURIComponent(disabledAccount)}`);
  if (!profile.session_valid)
    redirect("/login?error=Sessiya%20bitib.%20Yenidən%20daxil%20olun.");
  if (profile.must_change_password && !allowPasswordChange)
    redirect("/change-password");
  if (!roles.includes(profile.role)) redirect(roleHome(profile.role));
  return access;
}

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function requireUser() {
  return (await requireAccess()).user;
}
