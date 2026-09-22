import Image from "next/image";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { getCurrentAccess } from "@/lib/supabase/auth";
import { roleHome } from "@/lib/security";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string }>;
}) {
  const access = await getCurrentAccess();
  if (access?.profile.is_active && access.profile.session_valid)
    redirect(
      access.profile.must_change_password
        ? "/change-password"
        : roleHome(access.profile.role),
    );
  const { error, changed } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <Image
          src="/brand/prime-logo.png"
          alt="PRIME"
          width={140}
          height={42}
          className="mb-8 h-10 w-auto object-contain"
          style={{ width: "auto", height: "auto" }}
          priority
        />
        <h1 className="text-2xl font-semibold">PRIME Flow giriş</h1>
        {changed ? (
          <p className="mt-2 text-sm text-[var(--success)]">
            Şifrə yeniləndi. Yenidən daxil olun.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg border border-[rgba(232,91,91,.45)] p-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        <form action={signInAction} className="mt-6 grid gap-4">
          <label className="text-sm text-[var(--muted)]">
            İstifadəçi adı
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              maxLength={32}
              required
              className="field mt-2"
            />
          </label>
          <label className="text-sm text-[var(--muted)]">
            Şifrə
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
              className="field mt-2"
            />
          </label>
          <SubmitButton pendingText="Yoxlanılır...">Daxil ol</SubmitButton>
        </form>
      </section>
    </main>
  );
}
