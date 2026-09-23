import { requireAccess } from "@/lib/supabase/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  archiveServiceJobAction,
  restoreServiceJobAction,
  deleteServiceJobAction,
} from "@/app/actions/vehicles";
import {
  PageHeader,
  fundingLabels,
  statusLabels,
  StatusBadge,
} from "@/components/app-shell";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { ReportActions } from "@/components/report-actions";
import { JobFinance, CashHistory } from "@/components/job-finance";
import { HandoverAction } from "@/components/handover-action";
import { SubmitButton } from "@/components/submit-button";
import { Archive, ArchiveRestore } from "lucide-react";
import { getWorkshop } from "@/lib/supabase/workshop";
import { formatDate, formatMoney } from "@/lib/format";
import { IntakeDetail } from "@/components/intake-detail";
export const dynamic = "force-dynamic";
export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { profile } = await requireAccess(["ADMIN", "INTAKE"]);
  const { jobId } = await params,
    data = await getWorkshop(jobId),
    job = data.jobs[0];
  if (!job || (job.deleted_at && profile.role !== "ADMIN")) notFound();
  if (profile.role === "INTAKE") return <IntakeDetail data={data} />;
  const v = job.vehicles!;
  const info: Array<[string, string | number | null | undefined]> = [
    ["Müştəri", job.customer_name],
    ["Telefon", job.customer_phone],
    ["Mənbə", fundingLabels[job.funding_source]],
    ["Status", statusLabels[job.status]],
    ["Qəbul tarixi", formatDate(job.received_at)],
    [
      "Hədəf təhvil",
      job.target_delivery_date ? formatDate(job.target_delivery_date) : null,
    ],
    ["Təhvil", job.delivered_at ? formatDate(job.delivered_at) : null],
    ["Sığorta şirkəti", job.insurance_company],
    ["Sığorta işi", job.insurance_claim_no],
    [
      "Sığorta təsdiqi",
      job.insurance_approved_amount != null
        ? formatMoney(job.insurance_approved_amount)
        : null,
    ],
    ["Qeyd", job.notes],
  ];
  const registration: Array<[string, string | number | null | undefined]> = [
    ["Tip", v.vehicle_type],
    ["Ban tipi", v.body_type],
    ["İstehsalçı", v.manufacturer],
    ["İl", v.production_year],
    ["İlk qeydiyyat", v.first_registration_date],
    ["VIN / ban", v.vin_body_number],
    ["Şassi", v.chassis_number],
    ["Mühərrik", v.engine_number],
    ["Güc (a.g.)", v.engine_power_hp],
    ["Güc (kW)", v.engine_power_kw],
    ["Rəng", v.color],
    ["Şəhadətnamə", v.registration_certificate_series_no],
    ["Etibarlılıq", v.registration_valid_until],
    ["Maksimum kütlə", v.max_permitted_mass_kg],
    ["Yüksüz kütlə", v.unladen_mass_kg],
    ["Qeydiyyat sahibi", v.registered_owner_full_name],
    ["Ünvan", v.registered_owner_address],
  ];
  return (
    <>
      <PageHeader
        title={`${v.plate} · ${job.job_no}`}
        eyebrow={`${v.make} ${v.model}`}
        actions={<ReportActions report={`vehicle/${job.id}`} />}
      />
      {job.archived_at ? (
        <div className="mb-4">
          <StatusBadge tone="warning">
            {job.deleted_at ? "Silinib" : "Arxivdə"}
          </StatusBadge>
        </div>
      ) : null}
      <div className="mb-5 flex flex-wrap items-start gap-3">
        {!job.archived_at ? (
          <Link href={`/vehicles/${job.id}/edit`} className="btn btn-secondary">
            Qeydiyyatı redaktə et
          </Link>
        ) : null}
        <Link href={`/kassa?job=${job.id}`} className="btn btn-primary">
          Kassa
        </Link>
        <Link href={`/purchases?job=${job.id}`} className="btn btn-secondary">
          Satınalma
        </Link>
        <Link href={`/work?job=${job.id}`} className="btn btn-secondary">
          İşlər
        </Link>
        <HandoverAction job={job} />
        <ActionForm
          action={
            job.archived_at ? restoreServiceJobAction : archiveServiceJobAction
          }
        >
          <input name="id" type="hidden" value={job.id} />
          {job.archived_at ? (
            <SubmitButton variant="secondary" pendingText="Bərpa edilir...">
              <ArchiveRestore size={16} /> Arxivdən çıxar
            </SubmitButton>
          ) : (
            <ConfirmButton
              message="Bu servis kartını arxivləmək istəyirsiniz? Məlumatlar silinməyəcək və Arxiv bölməsindən bərpa edilə biləcək."
              danger
            >
              <Archive size={16} /> Arxivlə
            </ConfirmButton>
          )}
        </ActionForm>
        {!job.deleted_at ? (
          <ActionForm action={deleteServiceJobAction}>
            <input name="id" type="hidden" value={job.id} />
            <ConfirmButton message="Servis kartı aktiv siyahılardan silinsin? Ödəniş və audit tarixçəsi saxlanılacaq; kart arxivdən bərpa edilə bilər." />
          </ActionForm>
        ) : null}
      </div>
      <dl className="identity-grid mb-5 grid gap-4 text-sm sm:grid-cols-3">
        {info.map(([k, value]) => (
          <div key={k} className={k === "Qeyd" ? "wide-detail" : undefined}>
            <dt className="text-[var(--muted)]">{k}</dt>
            <dd className="mt-1 break-words">{value ?? "-"}</dd>
          </div>
        ))}
      </dl>
      <details className="mb-5 border-t border-[var(--border)] pt-4">
        <summary className="cursor-pointer font-semibold">
          Qeydiyyat məlumatları
        </summary>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          {registration.map(([k, value]) => (
            <div key={k}>
              <dt className="text-[var(--muted)]">{k}</dt>
              <dd>{value ?? "-"}</dd>
            </div>
          ))}
        </dl>
      </details>
      <JobFinance job={job} data={data} />
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Ödəniş tarixçəsi</h2>
        <CashHistory cash={data.cash} data={data} />
      </section>
    </>
  );
}
