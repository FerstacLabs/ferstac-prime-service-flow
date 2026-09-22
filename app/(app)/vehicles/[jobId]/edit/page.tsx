import { notFound } from "next/navigation";
import Link from "next/link";
import { Save } from "lucide-react";
import { requireAccess } from "@/lib/supabase/auth";
import { getWorkshop } from "@/lib/supabase/workshop";
import { getMasterData, workTitle } from "@/lib/supabase/queries";
import { vehicleIntakeFields, jobIntakeFields } from "@/lib/intake-fields";
import {
  updateVehicleIntakeAction,
  saveQuoteLineAction,
} from "@/app/actions/vehicles";
import { PageHeader } from "@/components/app-shell";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { SearchSelect } from "@/components/search-select";

export default async function EditIntakePage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  await requireAccess(["ADMIN", "INTAKE"]);
  const { jobId } = await params,
    data = await getWorkshop(jobId),
    job = data.jobs[0];
  if (!job || job.archived_at) notFound();
  const master = await getMasterData();
  const fields = (list: typeof vehicleIntakeFields, values: object) =>
    list.map(({ name, label, type, required }) => (
      <label key={name} className="text-sm text-[var(--muted)]">
        {label}
        <input
          className="field mt-1"
          name={name}
          type={type || "text"}
          step={type === "number" ? "0.01" : undefined}
          required={required}
          defaultValue={String(values[name as keyof typeof values] ?? "")}
        />
      </label>
    ));
  return (
    <>
      <PageHeader
        title="Qeydiyyatı redaktə et"
        eyebrow={job.vehicles?.plate}
        actions={
          <Link className="btn btn-secondary" href={`/vehicles/${jobId}`}>
            Servis kartı
          </Link>
        }
      />
      <ActionForm action={updateVehicleIntakeAction} className="space-y-6">
        <input type="hidden" name="service_job_id" value={jobId} />
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {fields(vehicleIntakeFields, job.vehicles!)}
        </section>
        <section className="grid gap-4 border-t border-[var(--border)] pt-6 sm:grid-cols-2 xl:grid-cols-3">
          {fields(jobIntakeFields, job)}
          <label className="text-sm text-[var(--muted)]">
            Mənbə
            <select
              name="funding_source"
              className="field mt-1"
              defaultValue={job.funding_source}
            >
              <option value="CUSTOMER_FUNDED">Müştəri hesabına</option>
              <option value="INSURANCE_CLAIM">Sığorta hadisəsi üzrə</option>
            </select>
          </label>
          <label className="text-sm text-[var(--muted)]">
            Qəbul tarixi
            <input
              name="received_at"
              className="field mt-1"
              type="datetime-local"
              defaultValue={new Date(
                new Date(job.received_at).getTime() + 4 * 3600000,
              )
                .toISOString()
                .slice(0, 16)}
              required
            />
          </label>
          <label className="text-sm text-[var(--muted)]">
            Qeyd
            <textarea
              name="notes"
              className="field mt-1"
              maxLength={250}
              defaultValue={job.notes ?? ""}
            />
          </label>
        </section>
        <SubmitButton>
          <Save size={16} />
          Qeydiyyatı saxla
        </SubmitButton>
      </ActionForm>
      {job.has_line_quotes
        ? (["work", "part"] as const).map((kind) => {
            const rows =
              kind === "work"
                ? data.work
                    .filter((w) => w.work_catalog_id)
                    .map((w) => ({
                      id: w.id,
                      catalog: w.work_catalog_id!,
                      title: workTitle(w),
                      price: w.quoted_price,
                      note: w.notes,
                    }))
                : data.parts.map((p) => ({
                    id: p.id,
                    catalog: p.part_catalog_id,
                    title: p.part_catalog?.name,
                    price: p.quoted_price,
                    note: p.notes,
                  }));
            return (
              <section
                key={kind}
                className="mt-8 border-t border-[var(--border)] pt-6"
              >
                <h2 className="mb-4 text-lg font-semibold">
                  {kind === "work"
                    ? "Planlaşdırılan işlər"
                    : "Alınacaq detallar"}
                </h2>
                {[
                  ...rows,
                  { id: "new", catalog: "", title: "", price: "", note: "" },
                ].map((row) => (
                  <ActionForm
                    key={row.id}
                    action={saveQuoteLineAction}
                    className="grid items-end gap-3 border-b border-[var(--border)] py-4 sm:grid-cols-2 xl:grid-cols-4"
                  >
                    <input type="hidden" name="service_job_id" value={jobId} />
                    <input type="hidden" name="kind" value={kind} />
                    {row.catalog ? (
                      <div>
                        <input
                          type="hidden"
                          name="catalog_id"
                          value={row.catalog}
                        />
                        <strong>{row.title}</strong>
                      </div>
                    ) : (
                      <SearchSelect
                        label={kind === "work" ? "Yeni iş" : "Yeni detal"}
                        name="catalog_id"
                        required
                        createKind={kind}
                        options={(kind === "work"
                          ? master.workCatalog
                          : master.partCatalog
                        ).filter((c) => !rows.some((r) => r.catalog === c.id))}
                      />
                    )}
                    <label className="text-sm text-[var(--muted)]">
                      Müştəri qiyməti
                      <input
                        name="quoted_price"
                        type="number"
                        min="0"
                        step="0.01"
                        className="field mt-1"
                        required
                        defaultValue={row.price ?? ""}
                      />
                    </label>
                    <label className="text-sm text-[var(--muted)]">
                      Qeyd
                      <textarea
                        name="notes"
                        maxLength={250}
                        className="field mt-1"
                        defaultValue={row.note ?? ""}
                      />
                    </label>
                    <SubmitButton variant="secondary">
                      {row.catalog ? "Təklifi saxla" : "Əlavə et"}
                    </SubmitButton>
                  </ActionForm>
                ))}
              </section>
            );
          })
        : null}
    </>
  );
}
