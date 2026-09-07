import Image from "next/image";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <Image src="/brand/prime-logo.png" alt="PRIME" width={140} height={42} className="mb-8 h-10 w-auto object-contain" priority />
        <h1 className="text-2xl font-semibold">PRIME Flow giriş</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Supabase Auth admin istifadəçisi ilə daxil olun.</p>
        <form className="mt-6 grid gap-4">
          <label className="text-sm text-[var(--muted)]">Email<input type="email" className="mt-2 w-full rounded-lg border border-[var(--border)] bg-black/20 px-3 py-3 text-white outline-none" /></label>
          <label className="text-sm text-[var(--muted)]">Şifrə<input type="password" className="mt-2 w-full rounded-lg border border-[var(--border)] bg-black/20 px-3 py-3 text-white outline-none" /></label>
          <button className="rounded-lg bg-[var(--accent)] px-4 py-3 font-semibold text-black">Daxil ol</button>
        </form>
      </section>
    </main>
  );
}
