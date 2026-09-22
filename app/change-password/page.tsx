import { changePasswordAction, signOutAction } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requireAccess } from "@/lib/supabase/auth";

export default async function ChangePasswordPage() {
  const { profile } = await requireAccess(undefined, true);
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="w-full max-w-md space-y-6 py-8">
        <h1 className="text-2xl font-semibold">Şifrəni dəyiş</h1>
        <p className="text-[var(--muted)]">{profile.display_name}</p>
        <ActionForm action={changePasswordAction} className="grid gap-4">
          <label>
            Cari şifrə
            <input
              className="field mt-2"
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <label>
            Yeni şifrə
            <input
              className="field mt-2"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <label>
            Yeni şifrəni təkrarla
            <input
              className="field mt-2"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <SubmitButton>Şifrəni yenilə</SubmitButton>
        </ActionForm>
        <form action={signOutAction}>
          <button className="btn btn-secondary">Çıxış</button>
        </form>
      </section>
    </main>
  );
}
