import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { saveSupplierAction } from "@/app/actions/purchases";
import type { DbSupplier } from "@/lib/supabase/queries";
export function SupplierForm({ supplier: s }: { supplier?: DbSupplier }) {
  return (
    <ActionForm
      action={saveSupplierAction}
      className="my-4 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      <input type="hidden" name="id" value={s?.id || ""} />
      <input type="hidden" name="active" value={String(s?.active ?? true)} />
      <label className="text-sm">
        Təchizatçı növü
        <select
          name="entity_type"
          defaultValue={s?.entity_type || "LEGAL_ENTITY"}
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
        <label key={name} className="text-sm">
          {label}
          <input
            name={name}
            defaultValue={(s?.[name as keyof DbSupplier] as string) || ""}
            maxLength={250}
            className="field mt-1"
          />
        </label>
      ))}
      <label className="text-sm sm:col-span-2">
        Qeyd
        <textarea
          name="notes"
          defaultValue={s?.notes || ""}
          maxLength={250}
          rows={2}
          className="field mt-1"
        />
      </label>
      <SubmitButton>Təchizatçını saxla</SubmitButton>
    </ActionForm>
  );
}
