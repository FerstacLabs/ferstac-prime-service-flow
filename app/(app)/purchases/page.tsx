import { requireAccess } from "@/lib/supabase/auth";
import Link from "next/link";
import { saveSupplierAction } from "@/app/actions/purchases";
import { PageHeader } from "@/components/app-shell";
import { ActionForm } from "@/components/action-form";
import { SearchSelect } from "@/components/search-select";
import { SubmitButton } from "@/components/submit-button";
import { ReportActions } from "@/components/report-actions";
import { PurchaseEntry } from "@/components/purchase-entry";
import { PurchaseList } from "@/components/purchase-list";
import {
  WorkshopFilters,
  Pagination,
  pageRows,
} from "@/components/workshop-filters";
import { parseFilters, filterQuery, type SearchParams } from "@/lib/filters";
import { getWorkshop, selectPurchases } from "@/lib/supabase/workshop";
import {
  supplierDisplayName,
  workerDisplayName,
  getMasterData,
} from "@/lib/supabase/queries";
export const dynamic = "force-dynamic";
export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAccess(["ADMIN"]);
  const f = parseFilters(await searchParams),
    data = await getWorkshop(),
    items = selectPurchases(data, f),
    master = await getMasterData();
  const jobs = data.jobs
      .filter((j) => !j.deleted_at)
      .map((j) => ({
        id: j.id,
        name: `${j.vehicles?.plate} · ${j.vehicles?.make} ${j.vehicles?.model} · ${j.job_no}`,
      })),
    suppliers = data.suppliers.map((s) => ({
      id: s.id,
      name: supplierDisplayName(s),
    })),
    workers = data.workers.map((w) => ({
      id: w.id,
      name: workerDisplayName(w),
    }));
  const selectedJob = data.jobs.find((j) => j.id === f.job && !j.deleted_at);
  const requirements = data.parts.filter(
    (p) => p.service_job_id === selectedJob?.id,
  );
  return (
    <>
      <PageHeader
        title="Satınalma"
        eyebrow="Detal, material və təchizatçılar"
        actions={<ReportActions report="purchases" query={filterQuery(f)} />}
      />
      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Yeni alış</h2>
        <form className="mb-4 grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <SearchSelect
            name="job"
            label="Avtomobil / servis kartı"
            required
            options={jobs}
            defaultValue={f.job}
          />
          <button className="btn btn-primary">Seç</button>
        </form>
        {requirements.map((part) => {
          const purchase = data.purchases.find(
            (p) => p.required_part_id === part.id,
          );
          return (
            <div key={part.id} className="border-t border-[var(--border)] py-4">
              <h3 className="mb-3 font-semibold">{part.part_catalog?.name}</h3>
              {purchase ? (
                <p className="text-sm text-[var(--success)]">
                  {purchase.source_type === "CUSTOMER_PROVIDED"
                    ? "Müştəri təqdim edib"
                    : "Alınıb"}
                </p>
              ) : (
                <PurchaseEntry
                  jobId={part.service_job_id}
                  part={part}
                  suppliers={suppliers}
                  workers={workers}
                />
              )}
            </div>
          );
        })}
        {selectedJob && !requirements.length ? (
          <p className="text-sm text-[var(--muted)]">
            Bu servis kartında tələb olunan detal yoxdur.
          </p>
        ) : null}
        {selectedJob ? (
          <details className="mt-4 border-t border-[var(--border)] pt-4">
            <summary className="cursor-pointer text-sm text-[var(--muted)]">
              Təklifdən kənar əlavə alış
            </summary>
            <div className="mt-4">
              <PurchaseEntry
                jobId={f.job}
                catalog={master.partCatalog}
                suppliers={suppliers}
                workers={workers}
              />
            </div>
          </details>
        ) : null}
      </section>
      <details className="mb-5 border-y border-[var(--border)] py-4">
        <summary className="cursor-pointer font-semibold">
          Yeni təchizatçı
        </summary>
        <ActionForm
          action={saveSupplierAction}
          className="mt-4 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-3"
          reset
        >
          <label className="text-xs text-[var(--muted)]">
            Təchizatçı növü
            <select
              name="entity_type"
              aria-label="Təchizatçı növü"
              className="field mt-1"
            >
              <option value="LEGAL_ENTITY">Hüquqi şəxs</option>
              <option value="INDIVIDUAL">Fiziki şəxs</option>
            </select>
          </label>
          {[
            ["company_name", "Firma adı"],
            ["shop_name", "Mağaza adı"],
            ["tax_id_voen", "VÖEN"],
            ["first_name", "Ad"],
            ["last_name", "Soyad"],
            ["father_name", "Ata adı"],
            ["phone", "Telefon"],
            ["address", "Ünvan"],
          ].map(([name, label]) => (
            <label key={name} className="text-xs text-[var(--muted)]">
              {label}
              <input name={name} aria-label={label} className="field mt-1" />
            </label>
          ))}
          <label className="text-xs text-[var(--muted)] sm:col-span-2">
            Qeyd
            <textarea
              name="notes"
              maxLength={250}
              aria-label="Qeyd"
              rows={3}
              className="field mt-1"
            />
          </label>
          <SubmitButton pendingText="Saxlanır...">
            Təchizatçını saxla
          </SubmitButton>
        </ActionForm>
      </details>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.suppliers.map((s) => (
          <Link
            key={s.id}
            href={`/purchases/suppliers/${s.id}`}
            className="interactive-card"
          >
            <strong>{supplierDisplayName(s)}</strong>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {s.phone || s.tax_id_voen || "-"}
            </p>
          </Link>
        ))}
      </div>
      <h2 className="text-lg font-semibold">Alış tarixçəsi</h2>
      <WorkshopFilters
        scope="purchases"
        filters={f}
        jobs={jobs}
        suppliers={suppliers}
      />
      <PurchaseList data={data} items={pageRows(items, f)} editable />
      <Pagination filters={f} total={items.length} />
    </>
  );
}
