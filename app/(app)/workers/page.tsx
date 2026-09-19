import Link from "next/link";
import { saveWorkerAction } from "@/app/actions/workers";
import { PageHeader } from "@/components/app-shell";
import { ActionForm } from "@/components/action-form";
import { SearchSelect } from "@/components/search-select";
import { SubmitButton } from "@/components/submit-button";
import { ReportActions } from "@/components/report-actions";
import {
  WorkshopFilters,
  Pagination,
  pageRows,
} from "@/components/workshop-filters";
import { getWorkshop } from "@/lib/supabase/workshop";
import { getMasterData, workerDisplayName } from "@/lib/supabase/queries";
import { parseFilters, filterQuery, type SearchParams } from "@/lib/filters";
import { workerFinance } from "@/lib/worker-finance";
import { formatMoney } from "@/lib/format";
export const dynamic = "force-dynamic";
export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const f = parseFilters(await searchParams),
    data = await getWorkshop(),
    master = await getMasterData(),
    workers = data.workers.filter((w) => !f.worker || w.id === f.worker);
  return (
    <>
      <PageHeader
        title="İşçilər"
        eyebrow="Ustalar və məhsuldarlıq"
        actions={<ReportActions report="workers" query={filterQuery(f)} />}
      />
      <details className="mb-5 border-y border-[var(--border)] py-4">
        <summary className="cursor-pointer font-semibold">Yeni işçi</summary>
        <ActionForm
          action={saveWorkerAction}
          className="mt-4 grid items-end gap-3 md:grid-cols-4"
          reset
        >
          {[
            ["first_name", "Ad"],
            ["last_name", "Soyad"],
            ["father_name", "Ata adı"],
            ["phone", "Telefon"],
          ].map(([k, label]) => (
            <label className="text-xs text-[var(--muted)]" key={k}>
              {label}
              <input
                name={k}
                required={k === "first_name" || k === "last_name"}
                className="field mt-1"
              />
            </label>
          ))}
          <SearchSelect
            label="İxtisas / rol"
            name="role_id"
            options={master.workerRoles}
            createKind="role"
            required
          />
          <label className="text-xs text-[var(--muted)]">
            İşə başlama tarixi
            <input name="hire_date" type="date" className="field mt-1" />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Status
            <select name="active" className="field mt-1">
              <option value="true">Aktiv</option>
              <option value="false">Deaktiv</option>
            </select>
          </label>
          <label className="text-xs text-[var(--muted)]">
            Qeyd
            <input name="notes" maxLength={250} className="field mt-1" />
          </label>
          <SubmitButton pendingText="Saxlanır...">İşçini saxla</SubmitButton>
        </ActionForm>
      </details>
      <WorkshopFilters
        scope="workers"
        filters={f}
        workers={data.workers.map((w) => ({
          id: w.id,
          name: workerDisplayName(w),
        }))}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pageRows(workers, f).map((w) => {
          const n = workerFinance(data, w.id, f);
          return (
            <Link
              key={w.id}
              href={`/workers/${w.id}?${filterQuery(f)}`}
              className="rounded-lg border border-[var(--border)] p-4 hover:border-[var(--accent)]"
            >
              <h2 className="font-semibold">{workerDisplayName(w)}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {w.worker_roles?.name} · {w.active ? "Aktiv" : "Deaktiv"}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Tapşırıq", String(n.items.length)],
                  ["Aktiv", String(n.active.length)],
                  ["Tamamlanıb", String(n.done.length)],
                  ["Qazanılmış", formatMoney(n.earned)],
                  ["Ödənilib", formatMoney(n.paid)],
                  ["Qalıq alacaq", formatMoney(n.outstanding)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[var(--muted)]">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              {n.missing ? (
                <p className="mt-3 text-sm text-[var(--warning)]">
                  {n.missing} işdə maya daxil edilməyib.
                </p>
              ) : null}
            </Link>
          );
        })}
      </div>
      <Pagination filters={f} total={workers.length} />
    </>
  );
}
