"use client";
import { IntakeDateInput } from "@/components/intake-date-input";
import { useState } from "react";
import { FormDraft, useDraftState } from "@/components/form-draft";
import { savePurchaseAction } from "@/app/actions/purchases";
import { ActionForm } from "@/components/action-form";
import { SearchSelect, type SelectOption } from "@/components/search-select";
import { SubmitButton } from "@/components/submit-button";
import type { RequiredPart } from "@/lib/workshop";
import type { DbPurchase } from "@/lib/supabase/queries";
import { bakuDate } from "@/lib/filters";
import { formatMoney } from "@/lib/format";
import { DecimalInput } from "@/components/decimal-input";
import {
  formatQuantity,
  parseLocalizedDecimal,
  multiplyMoney,
} from "@/lib/decimal";
import { subtractMoney } from "@/lib/workshop";
import { AdditionalMeasureFields } from "@/components/work-costing";
import { VatMode } from "@/components/vat-mode";
import { VatTotals } from "@/components/vat-totals";
import { PaymentSource } from "@/components/finance-forms";
import type { FinanceAccount } from "@/lib/finance";
export function PurchaseEntry(props: React.ComponentProps<typeof PurchaseEntryInner>) {
  return <FormDraft id={`purchase:${props.jobId}:${props.purchase?.id ?? props.part?.id ?? "new"}`}>
    <PurchaseEntryInner {...props} />
  </FormDraft>;
}
function PurchaseEntryInner({
  jobId,
  part,
  purchase,
  suppliers,
  workers,
  catalog,
  units = [],
  accounts = [],
}: {
  jobId: string;
  part?: RequiredPart;
  purchase?: DbPurchase;
  suppliers: SelectOption[];
  workers: SelectOption[];
  catalog?: SelectOption[];
  units?: SelectOption[];
  accounts?: FinanceAccount[];
}) {
  const [source, setSource] = useDraftState("purchase:source", purchase?.source_type ?? "SUPPLIER");
  const [buyer, setBuyer] = useDraftState("purchase:buyer",
    purchase?.purchased_by_admin === false ? "worker" : "admin",
  );
  const [payment, setPayment] = useDraftState("purchase:payment", purchase?.payment_status ?? "UNPAID");
  const [paymentAt] = useState(() =>
    new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 16),
  );
  const [vatEnabled, setVatEnabled] = useDraftState("purchase:vat", purchase?.vat_enabled ?? false);
  const [cost, setCost] = useDraftState("purchase:cost", String(purchase?.unit_price ?? ""));
  let actualTotal: number | null = null;
  try {
    actualTotal =
      source === "CUSTOMER_PROVIDED"
        ? 0
        : Number(
            multiplyMoney(purchase?.quantity ?? 1, parseLocalizedDecimal(cost)),
          );
  } catch {}
  return (
    <ActionForm
      action={savePurchaseAction}
      className="grid max-w-6xl items-end gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      <input type="hidden" name="service_job_id" value={jobId} />
      <input
        type="hidden"
        name="required_part_id"
        value={part?.id ?? purchase?.required_part_id ?? ""}
      />
      <input type="hidden" name="id" value={purchase?.id ?? ""} />
      {catalog ? (
        <SearchSelect
          name="part_catalog_id"
          label="Əlavə detal"
          options={catalog}
          createKind="part"
          required
        />
      ) : (
        <input
          type="hidden"
          name="part_catalog_id"
          value={part?.part_catalog_id ?? purchase?.part_catalog_id ?? ""}
        />
      )}
      {catalog ? (
        <>
          <input type="hidden" name="additional" value="true" />
          <AdditionalMeasureFields units={units} />
        </>
      ) : null}
      <input
        type="hidden"
        name="custom_item_name"
        value={purchase?.custom_item_name ?? ""}
      />
      <input type="hidden" name="quantity" value={purchase?.quantity ?? 1} />
      {part ? (
        <div className="sm:col-span-2 xl:col-span-3 text-sm">
          <strong>{part.part_catalog?.name}</strong>
          {part.is_additional ? (
            <span className="ml-2 text-xs text-[var(--accent)]">
              Əlavə alış
            </span>
          ) : null}
          <p className="mt-1 text-[var(--muted)]">
            {formatQuantity(part.quantity ?? 1)}{" "}
            {part.unit_catalog?.name ?? "Ədəd"} · Müştəri vahid qiyməti:{" "}
            {formatMoney(part.customer_unit_price ?? part.quoted_price)} ·
            Müştəri məbləği: {formatMoney(part.quoted_price)}
          </p>
          {part.notes ? <p className="mt-1">{part.notes}</p> : null}
          {part.cost_note ? (
            <div className="mt-3 border-l-2 border-[var(--accent)] pl-3">
              <strong>Maya qeydi</strong>
              <p className="mt-1 whitespace-pre-wrap break-words">
                {part.cost_note}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      <label className="text-xs text-[var(--muted)]">
        Mənbə
        <select
          name="source_type"
          data-draft-managed
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          className="field mt-1"
        >
          <option value="SUPPLIER">Təchizatçı</option>
          <option value="INTERNAL_STOCK">Servis daxili ehtiyat</option>
          <option value="CUSTOMER_PROVIDED">
            Müştərinin təqdim etdiyi detal
          </option>
        </select>
      </label>
      <label className="text-xs text-[var(--muted)]">
        {Number(purchase?.quantity ?? 1) === 1
          ? "Faktiki maya, cəmi (AZN)"
          : "Faktiki vahid mayası (AZN)"}
        <DecimalInput
          name="unit_price"
          data-draft-managed
          step="0.01"
          min="0"
          required
          readOnly={source === "CUSTOMER_PROVIDED"}
          value={source === "CUSTOMER_PROVIDED" ? "0" : cost}
          onChange={(e) => setCost(e.target.value)}
          className="field mt-1"
        />
      </label>
      {source === "SUPPLIER" ? (
        <SearchSelect
          label="Təchizatçı"
          name="supplier_id"
          required
          options={suppliers}
          defaultValue={purchase?.supplier_id ?? ""}
        />
      ) : null}
      <label className="text-xs text-[var(--muted)]">
        Alıcı
        <select
          name="purchased_by"
          data-draft-managed
          value={buyer}
          onChange={(event) => setBuyer(event.target.value)}
          className="field mt-1"
        >
          <option value="admin">Mən / Administrator</option>
          <option value="worker">İşçi</option>
        </select>
      </label>
      {buyer === "worker" ? (
        <SearchSelect
          label="Alan işçi"
          name="purchased_by_worker_id"
          options={workers}
          defaultValue={purchase?.purchased_by_worker_id ?? ""}
          required
        />
      ) : null}
      {source === "SUPPLIER" && (
        <VatMode value={vatEnabled} onChange={setVatEnabled} />
      )}
      {source === "SUPPLIER" && vatEnabled && actualTotal !== null && (
        <div className="sm:col-span-2 xl:col-span-3">
          <VatTotals net={actualTotal} enabled />
        </div>
      )}
      {source === "SUPPLIER" ? (
        <>
          <label className="text-xs text-[var(--muted)]">
            Ödəniş
            <select
              name="payment_status"
              data-draft-managed
              value={payment}
              onChange={(e) => setPayment(e.target.value as typeof payment)}
              className="field mt-1"
            >
              <option value="UNPAID">Ödənilməyib</option>
              <option value="PARTIAL">Qismən ödənilib</option>
              <option value="PAID">Tam ödənilib</option>
            </select>
          </label>
          {payment === "PARTIAL" ? (
            <label className="text-xs text-[var(--muted)]">
              Cəmi ödənilmiş məbləğ (ƏDV daxil, AZN)
              <DecimalInput
                name="paid_amount"
                required
                min="0.01"
                step="0.01"
                defaultValue={purchase?.paid_amount || ""}
                className="field mt-1"
              />
            </label>
          ) : null}
          {payment !== "UNPAID" && (
            <>
              <PaymentSource accounts={accounts} />
              <label className="text-xs text-[var(--muted)]">
                Ödəniş tarixi və saatı
                <input
                  type="datetime-local"
                  name="payment_at"
                  required
                  className="field mt-1"
                  defaultValue={paymentAt}
                />
              </label>
            </>
          )}
        </>
      ) : null}
      <label className="text-xs text-[var(--muted)]">
        Alış tarixi
        <IntakeDateInput
          name="purchase_date"
          required
          defaultValue={purchase?.purchase_date ?? bakuDate()}
          className="field mt-1"
        />
      </label>
      <details className="sm:col-span-2 xl:col-span-3">
        <summary className="cursor-pointer text-sm text-[var(--muted)]">
          Əlavə məlumatlar
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(
            [
              ["part_code_oem", "OEM kodu"],
              ["brand_model", "Brend/model"],
              ["serial_no", "Serial nömrəsi"],
              ["document_no", "Qaimə/sənəd"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-xs text-[var(--muted)]">
              {label}
              <input
                name={key}
                defaultValue={purchase?.[key] ?? ""}
                className="field mt-1"
              />
            </label>
          ))}
          <label className="text-xs text-[var(--muted)] md:col-span-2">
            Qeyd
            <textarea
              name="notes"
              rows={3}
              maxLength={250}
              defaultValue={purchase?.notes ?? ""}
              className="field mt-1"
            />
          </label>
        </div>
      </details>
      {part ? (
        <p className="text-sm">
          Müştəriyə: <strong>{formatMoney(part.quoted_price)}</strong>
          <br />
          Marja:{" "}
          {actualTotal !== null
            ? formatMoney(subtractMoney(part.quoted_price, actualTotal))
            : "Maya daxil edilməyib"}
        </p>
      ) : null}
      <SubmitButton pendingText="Saxlanır...">
        {purchase ? "Alışı yenilə" : "Alışı saxla"}
      </SubmitButton>
    </ActionForm>
  );
}
