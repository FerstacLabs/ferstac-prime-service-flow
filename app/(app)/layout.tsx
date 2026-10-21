import { AppShell } from "@/components/app-shell";
import { requireAccess } from "@/lib/supabase/auth";
import { DraftSession } from "@/components/form-draft";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, user } = await requireAccess();
  return <DraftSession scope={`${profile.organization_id}:${user.id}:${profile.role}:${user.last_sign_in_at ?? ""}`}>
    <AppShell role={profile.role}>{children}</AppShell>
  </DraftSession>;
}
