"use client";

import { useMemo, useState } from "react";
import { Check, Save, X } from "lucide-react";
import { PageHeader, Panel } from "@/components/app-shell";
import { normalizeAzPlate, isValidAzPlate } from "@/lib/plate";
import { vehicles, workCatalog } from "@/lib/demo-data";

export default function NewVehiclePage() {
  const [plate, setPlate] = useState("");
  const [selectedWork, setSelectedWork] = useState<string[]>(["initial-inspection"]);
  const existingVehicle = useMemo(() => vehicles.find((vehicle) => vehicle.plate === normalizeAzPlate(plate)), [plate]);
  const selectedItems = workCatalog.filter((item) => selectedWork.includes(item.id));

  return (
    <>
      <PageHeader title="Yeni avtomobil / servis kartı" eyebrow="Sürətli qəbul" />
      <Panel>
        <form className="grid gap-6">
          <section className="grid gap-4 md:grid-cols-2">
            <Field label="Dövlət qeydiyyat nişanı">
              <input
                value={plate}
                onChange={(event) => setPlate(normalizeAzPlate(event.target.value))}
                className="w-full rounded-lg border border-[var(--border)] bg-black/25 px-3 py-3 font-mono text-2xl font-bold uppercase outline-none focus:border-[var(--accent)]"
                placeholder="99-AA-999"
                required
              />
              <p className={`mt-2 text-sm ${plate && isValidAzPlate(plate) ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>
                {existingVehicle ? `${existingVehicle.make} ${existingVehicle.model} tapıldı, yeni servis kartı yaradılacaq.` : "Nömrə avtomatik böyük hərflə 99-AA-999 formatına salınır."}
              </p>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Marka"><input defaultValue={existingVehicle?.make} required className="field" /></Field>
              <Field label="Model"><input defaultValue={existingVehicle?.model} required className="field" /></Field>
            </div>
            <Field label="Müştərinin adı"><input className="field" /></Field>
            <Field label="Müştərinin telefon nömrəsi"><input className="field" /></Field>
          </section>

          <details className="rounded-lg border border-[var(--border)] p-4">
            <summary className="cursor-pointer font-semibold">Qeydiyyat məlumatları</summary>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {["nəqliyyat vasitəsinin tipi", "banın tipi", "buraxılış ili", "ilk qeydiyyat tarixi", "mühərrik nömrəsi", "ban/VIN nömrəsi", "şassi nömrəsi", "rəng", "mühərrik gücü (a.g. / kW)", "qeydiyyat şəhadətnaməsinin seriya və nömrəsi", "qeydiyyatda olan sahibin soyadı, adı, ata adı", "sahibin ünvanı"].map((label) => (
                <Field key={label} label={label}><input className="field" /></Field>
              ))}
            </div>
          </details>

          <section className="grid gap-4 md:grid-cols-3">
            <Field label="Mənbə">
              <select className="field"><option>Müştəri hesabına</option><option>Sığorta hadisəsi üzrə</option></select>
            </Field>
            <Field label="Razılaşdırılmış büdcə (AZN)"><input type="number" min="0" defaultValue="0" className="field text-xl font-semibold" /></Field>
            <Field label="Hədəf təhvil tarixi"><input type="date" className="field" /></Field>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Planlaşdırılan işlər</h2>
              <select
                className="field max-w-sm"
                onChange={(event) => {
                  if (event.target.value && !selectedWork.includes(event.target.value)) setSelectedWork([...selectedWork, event.target.value]);
                }}
              >
                <option value="">+ Əlavə et</option>
                {workCatalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedItems.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedWork(selectedWork.filter((id) => id !== item.id))} className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-2 text-sm">
                  <Check size={14} />{item.name}<X size={14} />
                </button>
              ))}
            </div>
            <input className="field mt-3" placeholder="Digər iş" />
          </section>

          <button type="button" className="inline-flex w-fit items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 font-semibold text-black">
            <Save size={18} />
            Servis kartını saxla
          </button>
        </form>
      </Panel>
      <style jsx global>{`.field{width:100%;border:1px solid var(--border);background:rgba(0,0,0,.22);border-radius:.5rem;padding:.75rem;color:white;outline:none}.field:focus{border-color:var(--accent)}`}</style>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm text-[var(--muted)]"><span className="mb-2 block">{label}</span>{children}</label>;
}
