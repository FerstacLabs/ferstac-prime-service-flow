import Link from "next/link";
import { Pencil } from "lucide-react";
import {
  PageHeader,
  StatusBadge,
  statusLabels,
  fundingLabels,
} from "@/components/app-shell";
import { ReportActions } from "@/components/report-actions";
import { formatDate, formatMoney } from "@/lib/format";
import { sumMoney } from "@/lib/workshop";
import { workTitle } from "@/lib/supabase/queries";
import type { WorkshopData } from "@/lib/supabase/workshop";
import { vehicleIntakeFields } from "@/lib/intake-fields";

export function IntakeDetail({ data }: { data: WorkshopData }) {
  const job = data.jobs[0],
    vehicle = job.vehicles!;
  return (
    <>
      <PageHeader
        title={`${vehicle.plate} · ${job.job_no}`}
        eyebrow={`${vehicle.make} ${vehicle.model}`}
        actions={<ReportActions report="quotation" query={`job=${job.id}`} />}
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge>{statusLabels[job.status]}</StatusBadge>
        {job.archived_at ? (
          <StatusBadge>Arxivdə</StatusBadge>
        ) : (
          <Link className="btn btn-secondary" href={`/vehicles/${job.id}/edit`}>
            <Pencil size={16} />
            Qeydiyyatı redaktə et
          </Link>
        )}
      </div>
      <dl className="identity-grid grid gap-4 sm:grid-cols-3">
        {[
          ["Müştəri", job.customer_name],
          ["Telefon", job.customer_phone],
          ["Mənbə", fundingLabels[job.funding_source]],
          ["Qəbul", formatDate(job.received_at)],
          ["Hədəf təhvil", job.target_delivery_date],
          ["Razılaşdırılmış büdcə", formatMoney(job.agreed_budget)],
          ["Qeyd", job.notes],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-[var(--muted)]">{label}</dt>
            <dd className="mt-1 break-words">{value || "-"}</dd>
          </div>
        ))}
      </dl>
      <details className="my-6 border-y border-[var(--border)] py-4">
        <summary className="cursor-pointer font-semibold">
          Qeydiyyat məlumatları
        </summary>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {vehicleIntakeFields.map(({ name, label }) => (
            <div key={name}>
              <dt className="text-sm text-[var(--muted)]">{label}</dt>
              <dd className="break-words">
                {String(vehicle[name as keyof typeof vehicle] ?? "-")}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      {[
        {
          title: "Planlaşdırılan işlər",
          rows: data.work.map((w) => ({
            id: w.id,
            name: workTitle(w),
            price: w.quoted_price,
            note: w.notes,
            status: statusLabels[w.status],
          })),
        },
        {
          title: "Alınacaq detallar",
          rows: data.parts.map((p) => ({
            id: p.id,
            name: p.part_catalog?.name,
            price: p.quoted_price,
            note: p.notes,
            status: "",
          })),
        },
      ].map((section) => (
        <section key={section.title} className="mt-6">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <div className="divide-y divide-[var(--border)]">
            {section.rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <h3>{row.name}</h3>
                  <p className="whitespace-pre-wrap break-words text-sm text-[var(--muted)]">
                    {row.note}
                  </p>
                  {row.status ? (
                    <span className="text-xs text-[var(--muted)]">
                      {row.status}
                    </span>
                  ) : null}
                </div>
                <strong>
                  {row.price == null ? "-" : formatMoney(row.price)}
                </strong>
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="mt-6 flex justify-between border-t border-[var(--border)] py-4 font-semibold">
        <span>Ümumi təklif</span>
        <span>
          {formatMoney(
            job.has_line_quotes
              ? sumMoney([
                  ...data.work.map((w) => w.quoted_price),
                  ...data.parts.map((p) => p.quoted_price),
                ])
              : job.agreed_budget,
          )}
        </span>
      </div>
    </>
  );
}
