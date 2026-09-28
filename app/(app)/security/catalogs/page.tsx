import Link from "next/link";
import { Archive, RotateCcw, Save, Plus, Search, Trash2 } from "lucide-react";
import { requireAccess } from "@/lib/supabase/auth";
import { PageHeader } from "@/components/app-shell";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { manageCatalogAction } from "@/app/actions/catalogs";

type CatalogRow = {
  id: string;
  name: string;
  short_name?: string;
  active?: boolean;
  is_active?: boolean;
};
const catalogs = {
  work: "İşlər / xidmətlər",
  part: "Detallar / materiallar",
  unit: "Ölçü vahidləri",
} as const;
export default async function CatalogsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string; page?: string }>;
}) {
  const { supabase } = await requireAccess(["ADMIN"]);
  const params = await searchParams;
  const kind =
    params.kind === "part" || params.kind === "unit" ? params.kind : "work";
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1),
  );
  const search = (params.q ?? "").trim().slice(0, 120);
  let query = supabase
    .from(`${kind}_catalog`)
    .select("*", { count: "exact" })
    .order("name")
    .order("id")
    .range((page - 1) * 50, page * 50 - 1);
  if (search)
    query = query.ilike("name", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
  const { data, error, count } = await query;
  if (error) throw new Error("Kataloq yüklənmədi.");
  return (
    <>
      <PageHeader title="Məlumat kataloqları" eyebrow="Təhlükəsizlik" />
      <nav
        className="mb-6 flex flex-wrap gap-4 border-b border-[var(--border)] pb-3"
        aria-label="Kataloqlar"
      >
        {Object.entries(catalogs).map(([key, label]) => (
          <Link
            key={key}
            href={`?kind=${key}`}
            aria-current={kind === key ? "page" : undefined}
            className={
              kind === key ? "font-semibold text-white" : "text-[var(--muted)]"
            }
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <form className="flex gap-2">
          <input type="hidden" name="kind" value={kind} />
          <input
            aria-label="Kataloqda axtar"
            className="field min-w-0"
            name="q"
            defaultValue={search}
            maxLength={120}
          />
          <button
            className="btn btn-secondary btn-icon"
            aria-label="Axtar"
            title="Axtar"
          >
            <Search size={18} />
          </button>
        </form>
        <ActionForm
          key={kind}
          action={manageCatalogAction}
          reset
          className="flex flex-wrap gap-2"
        >
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="catalog_action" value="create" />
          <input
            aria-label="Yeni qeyd"
            name="name"
            required
            maxLength={120}
            className="field min-w-0 flex-1"
          />
          <SubmitButton pendingText="Əlavə edilir...">
            <Plus size={16} /> Əlavə et
          </SubmitButton>
        </ActionForm>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {(data as CatalogRow[]).map((row) => {
          const active = kind === "unit" ? row.is_active : row.active;
          return (
            <section key={row.id} className="py-4">
              <p className="mb-2 text-xs text-[var(--muted)]">
                {active ? "Aktiv" : "Arxiv"}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <ActionForm
                  action={manageCatalogAction}
                  className="flex min-w-0 flex-1 gap-2"
                >
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="catalog_action" value="rename" />
                  <input
                    type="hidden"
                    name="short_name"
                    value={row.short_name ?? ""}
                  />
                  <input
                    aria-label={`${row.name}: ad`}
                    name="name"
                    defaultValue={row.name}
                    required
                    maxLength={120}
                    className="field min-w-0"
                  />
                  <button
                    className="btn btn-secondary btn-icon"
                    title="Adı yenilə"
                    aria-label={`${row.name}: adı yenilə`}
                  >
                    <Save size={18} />
                  </button>
                </ActionForm>
                <ActionForm action={manageCatalogAction}>
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="id" value={row.id} />
                  <input
                    type="hidden"
                    name="catalog_action"
                    value={active ? "archive" : "restore"}
                  />
                  <button
                    className="btn btn-secondary btn-icon"
                    title={active ? "Arxivlə" : "Bərpa et"}
                    aria-label={`${row.name}: ${active ? "arxivlə" : "bərpa et"}`}
                  >
                    {active ? <Archive size={18} /> : <RotateCcw size={18} />}
                  </button>
                </ActionForm>
                <details className="w-full text-sm sm:w-auto">
                  <summary className="cursor-pointer text-red-300">Sil</summary>
                  <ActionForm
                    action={manageCatalogAction}
                    className="mt-2 flex flex-wrap gap-2"
                  >
                    <input type="hidden" name="kind" value={kind} />
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="catalog_action" value="delete" />
                    <input
                      name="confirmation"
                      aria-label="Təsdiq üçün SİL"
                      placeholder="SİL"
                      required
                      pattern="SİL"
                      className="field w-24"
                    />
                    <button
                      className="btn btn-secondary btn-icon"
                      title="Birdəfəlik sil"
                      aria-label={`${row.name}: birdəfəlik sil`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </ActionForm>
                </details>
              </div>
            </section>
          );
        })}
      </div>
      {!data?.length && (
        <p className="py-6 text-[var(--muted)]">Qeyd tapılmadı.</p>
      )}
      <nav className="mt-6 flex gap-4" aria-label="Səhifələr">
        {page > 1 && (
          <Link
            href={`?${new URLSearchParams({ kind, q: search, page: String(page - 1) })}`}
          >
            Əvvəlki
          </Link>
        )}
        {page * 50 < (count ?? 0) && (
          <Link
            href={`?${new URLSearchParams({ kind, q: search, page: String(page + 1) })}`}
          >
            Növbəti
          </Link>
        )}
      </nav>
    </>
  );
}
