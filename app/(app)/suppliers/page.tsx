import Link from "next/link";
import { requireAccess } from "@/lib/supabase/auth";
import { getWorkshop } from "@/lib/supabase/workshop";
import { supplierDisplayName } from "@/lib/supabase/queries";
import { PageHeader } from "@/components/app-shell";
import { SupplierForm } from "@/components/supplier-form";
import type { SearchParams } from "@/lib/filters";
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAccess(["ADMIN"]);
  const params = await searchParams,
    data = await getWorkshop(),
    archived = params.status === "archived",
    q = typeof params.q === "string" ? params.q : "";
  return (
    <>
      <PageHeader title="Təchizatçılar" eyebrow="Təchizatçı məlumatları" />
      <div className="mb-5 flex gap-4">
        <Link href="/suppliers" aria-current={!archived ? "page" : undefined}>
          Aktiv
        </Link>
        <Link
          href="/suppliers?status=archived"
          aria-current={archived ? "page" : undefined}
        >
          Arxiv
        </Link>
      </div>
      <form className="mb-5 flex gap-3">
        <input
          type="hidden"
          name="status"
          value={archived ? "archived" : "active"}
        />
        <input
          name="q"
          aria-label="Təchizatçı axtar"
          placeholder="Ad, VÖEN, telefon"
          defaultValue={q}
          className="field max-w-md"
        />
        <button className="btn btn-secondary">Axtar</button>
      </form>
      <details className="mb-6 border-y border-[var(--border)] py-4">
        <summary className="cursor-pointer font-semibold">
          Yeni təchizatçı
        </summary>
        <SupplierForm />
      </details>
      <div className="divide-y divide-[var(--border)]">
        {data.suppliers
          .filter(
            (s) =>
              s.active !== archived &&
              [supplierDisplayName(s), s.tax_id_voen, s.phone]
                .join(" ")
                .toLocaleLowerCase("az")
                .includes(q.toLocaleLowerCase("az")),
          )
          .map((s) => (
            <Link
              key={s.id}
              href={`/suppliers/${s.id}`}
              className="flex flex-wrap justify-between gap-3 py-4"
            >
              <strong>{supplierDisplayName(s)}</strong>
              <span className="text-sm text-[var(--muted)]">
                {s.phone} · {s.tax_id_voen}
              </span>
            </Link>
          ))}
      </div>
    </>
  );
}
