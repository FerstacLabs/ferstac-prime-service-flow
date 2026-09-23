import { requireAccess } from "@/lib/supabase/auth";
import { PageHeader, StatusBadge } from "@/components/app-shell";
import { AccountControls } from "@/components/account-controls";
import { formatReportDateTime } from "@/lib/reports/report-format";
import type { AccessProfile } from "@/lib/security";
import { getMasterData } from "@/lib/supabase/queries";
import { ActionForm } from "@/components/action-form";
import { manageUnitAction } from "@/app/actions/finance";
import { Save } from "lucide-react";

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
  const { units } = await getMasterData();
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
      <section className="mt-8 border-t border-[var(--border)] py-6">
        <h2 className="mb-4 text-lg font-semibold">Ölçü vahidləri</h2>
        {units.map((unit) => (
          <ActionForm
            key={unit.id}
            action={manageUnitAction}
            className="grid grid-cols-[1fr_auto] items-end gap-3 border-b border-[var(--border)] py-3 sm:grid-cols-[2fr_1fr_auto_auto]"
          >
            <input type="hidden" name="id" value={unit.id} />
            <label className="min-w-0 text-sm text-[var(--muted)]">
              Ad
              <input
                className="field mt-1"
                name="name"
                defaultValue={unit.name}
                required
                maxLength={120}
              />
            </label>
            <label className="min-w-0 text-sm text-[var(--muted)]">
              Qısa ad
              <input
                className="field mt-1"
                name="short_name"
                defaultValue={unit.short_name ?? ""}
                maxLength={20}
              />
            </label>
            <label className="flex items-center gap-2 py-3">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={unit.is_active}
              />
              Aktiv
            </label>
            <button
              className="btn btn-secondary btn-icon"
              type="submit"
              title="Vahidi saxla"
              aria-label={`${unit.name}: saxla`}
            >
              <Save size={18} />
            </button>
          </ActionForm>
        ))}
      </section>
    </>
  );
}
