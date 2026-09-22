import { requireAccess } from "@/lib/supabase/auth";
import { PageHeader, StatusBadge } from "@/components/app-shell";
import { AccountControls } from "@/components/account-controls";
import { formatReportDateTime } from "@/lib/reports/report-format";
import type { AccessProfile } from "@/lib/security";

export default async function SecurityPage() {
  const { supabase, profile } = await requireAccess(["ADMIN"]);
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "auth_user_id,username,display_name,role,is_active,must_change_password,last_login_at",
    )
    .eq("organization_id", profile.organization_id)
    .in("username", ["admin", "kassa", "qeydiyyat"])
    .order("username");
  if (error) throw new Error("Hesablar yüklənmədi.");
  return (
    <>
      <PageHeader title="Təhlükəsizlik" eyebrow="Hesablar" />
      <div className="divide-y divide-[var(--border)]">
        {(data as AccessProfile[]).map((member) => (
          <section key={member.auth_user_id} className="py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{member.display_name}</h2>
                <p className="text-sm text-[var(--muted)]">
                  {member.username} · {member.role}
                </p>
              </div>
              <StatusBadge tone={member.is_active ? "success" : "danger"}>
                {member.is_active ? "Aktiv" : "Deaktiv"}
              </StatusBadge>
            </div>
            <dl className="mt-3 flex flex-wrap gap-6 text-sm">
              <div>
                <dt className="text-[var(--muted)]">Son giriş</dt>
                <dd>
                  {member.last_login_at
                    ? formatReportDateTime(member.last_login_at)
                    : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Şifrə dəyişikliyi</dt>
                <dd>
                  {member.must_change_password ? "Tələb olunur" : "Tamamlanıb"}
                </dd>
              </div>
            </dl>
            {member.role !== "ADMIN" ? (
              <AccountControls
                id={member.auth_user_id}
                active={member.is_active}
              />
            ) : null}
          </section>
        ))}
      </div>
    </>
  );
}
