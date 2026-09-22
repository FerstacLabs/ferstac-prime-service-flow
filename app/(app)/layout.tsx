import { AppShell } from "@/components/app-shell";
import { requireAccess } from "@/lib/supabase/auth";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAccess();
  return <AppShell role={profile.role}>{children}</AppShell>;
}
