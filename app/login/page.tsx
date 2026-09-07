import Image from "next/image";
import { redirect } from "next/navigation";
import { signInAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { getCurrentUser } from "@/lib/supabase/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/overview");
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <Image src="/brand/prime-logo.png" alt="PRIME" width={140} height={42} className="mb-8 h-10 w-auto object-contain" priority />
        <h1 className="text-2xl font-semibold">PRIME Flow giriş</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Supabase Auth admin istifadəçisi ilə daxil olun.</p>
        {error ? <p className="mt-4 rounded-lg border border-[rgba(232,91,91,.45)] p-3 text-sm text-[var(--danger)]">{error}</p> : null}
        <form action={signInAction} className="mt-6 grid gap-4">
          <label className="text-sm text-[var(--muted)]">Email<input name="email" type="email" required className="mt-2 w-full rounded-lg border border-[var(--border)] bg-black/20 px-3 py-3 text-white outline-none" /></label>
          <label className="text-sm text-[var(--muted)]">Şifrə<input name="password" type="password" required className="mt-2 w-full rounded-lg border border-[var(--border)] bg-black/20 px-3 py-3 text-white outline-none" /></label>
          <SubmitButton pendingText="Yoxlanılır...">Daxil ol</SubmitButton>
        </form>
      </section>
    </main>
  );
}
