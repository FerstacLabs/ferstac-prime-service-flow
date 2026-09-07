import { Save } from "lucide-react";
import { createServiceJobAction } from "@/app/actions/vehicles";
import { PageHeader, Panel } from "@/components/app-shell";
import { PlateInput } from "@/components/plate-input";
import { getMasterData } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function NewVehiclePage() {
  const { workCatalog } = await getMasterData();

  return (
    <>
      <PageHeader title="Yeni avtomobil / servis kartı" eyebrow="Sürətli qəbul" />
      <Panel>
        <form action={createServiceJobAction} className="grid gap-6">
          <section className="grid gap-4 md:grid-cols-2">
            <Field label="Dövlət qeydiyyat nişanı"><PlateInput /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Marka"><input name="make" required className="field" /></Field>
              <Field label="Model"><input name="model" required className="field" /></Field>
            </div>
            <Field label="Müştərinin adı"><input name="customer_name" className="field" /></Field>
            <Field label="Müştərinin telefon nömrəsi"><input name="customer_phone" className="field" /></Field>
          </section>

          <details className="rounded-lg border border-[var(--border)] p-4">
            <summary className="cursor-pointer font-semibold">Qeydiyyat məlumatları</summary>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Field label="nəqliyyat vasitəsinin tipi"><input name="vehicle_type" className="field" /></Field>
              <Field label="istehsalçı"><input name="manufacturer" className="field" /></Field>
              <Field label="banın tipi"><input name="body_type" className="field" /></Field>
              <Field label="buraxılış ili"><input name="production_year" type="number" className="field" /></Field>
              <Field label="ilk qeydiyyat tarixi"><input name="first_registration_date" type="date" className="field" /></Field>
              <Field label="mühərrik nömrəsi"><input name="engine_number" className="field" /></Field>
              <Field label="ban/VIN nömrəsi"><input name="vin_body_number" className="field uppercase" /></Field>
              <Field label="şassi nömrəsi"><input name="chassis_number" className="field" /></Field>
              <Field label="rəng"><input name="color" className="field" /></Field>
              <Field label="mühərrik gücü (a.g.)"><input name="engine_power_hp" type="number" className="field" /></Field>
              <Field label="mühərrik gücü (kW)"><input name="engine_power_kw" type="number" className="field" /></Field>
              <Field label="qeydiyyat şəhadətnaməsi"><input name="registration_certificate_series_no" className="field" /></Field>
              <Field label="etibarlılıq tarixi"><input name="registration_valid_until" type="date" className="field" /></Field>
              <Field label="qeydiyyatda olan sahib"><input name="registered_owner_full_name" className="field" /></Field>
              <Field label="sahibin ünvanı"><input name="registered_owner_address" className="field" /></Field>
              <Field label="icazə verilən maksimum kütlə"><input name="max_permitted_mass_kg" type="number" className="field" /></Field>
              <Field label="yüksüz kütlə"><input name="unladen_mass_kg" type="number" className="field" /></Field>
            </div>
          </details>

          <section className="grid gap-4 md:grid-cols-4">
            <Field label="Mənbə">
              <select name="funding_source" className="field"><option value="CUSTOMER_FUNDED">Müştəri hesabına</option><option value="INSURANCE_CLAIM">Sığorta hadisəsi üzrə</option></select>
            </Field>
            <Field label="Sığorta şirkəti"><input name="insurance_company" className="field" /></Field>
            <Field label="Sığorta işi / claim nömrəsi"><input name="insurance_claim_no" className="field" /></Field>
            <Field label="Sığorta təsdiq məbləği"><input name="insurance_approved_amount" type="number" min="0" className="field" /></Field>
            <Field label="Razılaşdırılmış büdcə (AZN)"><input name="agreed_budget" type="number" min="0" defaultValue="0" className="field text-xl font-semibold" /></Field>
            <Field label="Qəbul tarixi"><input name="received_at" type="datetime-local" className="field" /></Field>
            <Field label="Hədəf təhvil tarixi"><input name="target_delivery_date" type="date" className="field" /></Field>
            <Field label="Qeyd"><input name="notes" className="field" /></Field>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Planlaşdırılan işlər</h2>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {workCatalog.map((item) => (
                <label key={item.id} className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm">
                  <input name="work_catalog_id" value={item.id} type="checkbox" className="mt-1" />
                  <span><span className="block font-medium">{item.name}</span><span className="text-[var(--muted)]">{item.category}</span></span>
                </label>
              ))}
            </div>
            <input name="custom_work_title" className="field mt-3" placeholder="Digər iş" />
          </section>

          <button className="inline-flex w-fit items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 font-semibold text-black">
            <Save size={18} />
            Servis kartını saxla
          </button>
        </form>
      </Panel>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm text-[var(--muted)]"><span className="mb-2 block">{label}</span>{children}</label>;
}
