import { requireAccess } from "@/lib/supabase/auth";
import { Save } from "lucide-react";
import { createServiceJobAction } from "@/app/actions/vehicles";
import { PageHeader } from "@/components/app-shell";
import { PlateInput } from "@/components/plate-input";
import { SubmitButton } from "@/components/submit-button";
import { IntakeQuotes } from "@/components/quote-editor";
import { FundingFields } from "@/components/funding-fields";
import { IntakeDateInput } from "@/components/intake-date-input";
import { bakuDate } from "@/lib/filters";
import { ActionForm } from "@/components/action-form";
import { getMasterData } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function NewVehiclePage() {
  await requireAccess(["ADMIN", "INTAKE"]);
  const { workCatalog, partCatalog, units } = await getMasterData();

  return (
    <>
      <PageHeader
        title="Yeni avtomobil / servis kartı"
        eyebrow="Sürətli qəbul"
      />
      <div>
        <ActionForm action={createServiceJobAction} className="grid gap-6">
          <section className="grid gap-4 md:grid-cols-2">
            <Field label="Dövlət qeydiyyat nişanı">
              <PlateInput />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Marka">
                <input name="make" required className="field" />
              </Field>
              <Field label="Model">
                <input name="model" required className="field" />
              </Field>
            </div>
            <Field label="Müştərinin adı">
              <input name="customer_name" className="field" />
            </Field>
            <Field label="Müştərinin telefon nömrəsi">
              <input name="customer_phone" className="field" />
            </Field>
          </section>

          <details className="border-y border-[var(--border)] py-4">
            <summary className="cursor-pointer font-semibold">
              Qeydiyyat məlumatları
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Field label="nəqliyyat vasitəsinin tipi">
                <input name="vehicle_type" className="field" />
              </Field>
              <Field label="istehsalçı">
                <input name="manufacturer" className="field" />
              </Field>
              <Field label="banın tipi">
                <input name="body_type" className="field" />
              </Field>
              <Field label="buraxılış ili">
                <input name="production_year" type="number" className="field" />
              </Field>
              <Field label="ilk qeydiyyat tarixi">
                <input
                  name="first_registration_date"
                  type="date"
                  className="field"
                />
              </Field>
              <Field label="mühərrik nömrəsi">
                <input name="engine_number" className="field" />
              </Field>
              <Field label="ban/VIN nömrəsi">
                <input name="vin_body_number" className="field uppercase" />
              </Field>
              <Field label="şassi nömrəsi">
                <input name="chassis_number" className="field" />
              </Field>
              <Field label="rəng">
                <input name="color" className="field" />
              </Field>
              <Field label="mühərrik gücü (a.g.)">
                <input name="engine_power_hp" type="number" className="field" />
              </Field>
              <Field label="mühərrik gücü (kW)">
                <input name="engine_power_kw" type="number" className="field" />
              </Field>
              <Field label="qeydiyyat şəhadətnaməsi">
                <input
                  name="registration_certificate_series_no"
                  className="field"
                />
              </Field>
              <Field label="etibarlılıq tarixi">
                <input
                  name="registration_valid_until"
                  type="date"
                  className="field"
                />
              </Field>
              <Field label="qeydiyyatda olan sahib">
                <input name="registered_owner_full_name" className="field" />
              </Field>
              <Field label="sahibin ünvanı">
                <input name="registered_owner_address" className="field" />
              </Field>
              <Field label="icazə verilən maksimum kütlə">
                <input
                  name="max_permitted_mass_kg"
                  type="number"
                  className="field"
                />
              </Field>
              <Field label="yüksüz kütlə">
                <input name="unladen_mass_kg" type="number" className="field" />
              </Field>
            </div>
          </details>

          <section className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FundingFields />
            <Field label="Qəbul tarixi">
              <IntakeDateInput
                name="received_at"
                defaultValue={bakuDate()}
                required
              />
            </Field>
            <Field label="Hədəf təhvil tarixi">
              <IntakeDateInput name="target_delivery_date" />
            </Field>
            <Field label="Qeyd">
              <textarea
                name="notes"
                maxLength={250}
                rows={2}
                className="field"
              />
            </Field>
          </section>

          <IntakeQuotes work={workCatalog} parts={partCatalog} units={units} />

          <SubmitButton className="w-fit px-5 py-3" pendingText="Saxlanır...">
            <Save size={18} />
            Servis kartını saxla
          </SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm text-[var(--muted)]">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}
