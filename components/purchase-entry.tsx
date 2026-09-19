"use client";
import { useState } from "react";
import { savePurchaseAction } from "@/app/actions/purchases";
import { ActionForm } from "@/components/action-form";
import { SearchSelect, type SelectOption } from "@/components/search-select";
import { SubmitButton } from "@/components/submit-button";
import type { RequiredPart } from "@/lib/workshop";
import type { DbPurchase } from "@/lib/supabase/queries";
import { bakuDate } from "@/lib/filters";
import { formatMoney } from "@/lib/format";
export function PurchaseEntry({
  jobId,
  part,
  purchase,
  suppliers,
  workers,
  catalog,
}: {
  jobId: string;
  part?: RequiredPart;
  purchase?: DbPurchase;
  suppliers: SelectOption[];
  workers: SelectOption[];
  catalog?: SelectOption[];
}) {
  const [source, setSource] = useState(purchase?.source_type ?? "SUPPLIER");
  const [payment, setPayment] = useState("UNPAID");
  const [cost, setCost] = useState(String(purchase?.unit_price ?? ""));
  return (
    <ActionForm
      action={savePurchaseAction}
      className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4"
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
      <input
        type="hidden"
        name="custom_item_name"
        value={purchase?.custom_item_name ?? ""}
      />
      <input type="hidden" name="quantity" value={purchase?.quantity ?? 1} />
      <label className="text-xs text-[var(--muted)]">
        Mənbə
        <select
          name="source_type"
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
        Faktiki maya (AZN)
        <input
          name="unit_price"
          type="number"
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
      <SearchSelect
        label="Alan işçi"
        name="purchased_by_worker_id"
        options={workers}
        defaultValue={purchase?.purchased_by_worker_id ?? ""}
      />
      <label className="text-xs text-[var(--muted)]">
        Alıcı
        <select
          name="purchased_by"
          defaultValue={
            purchase?.purchased_by_admin === false ? "worker" : "admin"
          }
          className="field mt-1"
        >
          <option value="admin">Mən / Administrator</option>
          <option value="worker">İşçi</option>
        </select>
      </label>
      {!purchase && source === "SUPPLIER" ? (
        <>
          <label className="text-xs text-[var(--muted)]">
            Ödəniş
            <select
              name="payment_status"
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
              className="field mt-1"
            >
              <option value="UNPAID">Ödənilməyib</option>
              <option value="PARTIAL">Qismən ödənilib</option>
              <option value="PAID">Ödənilib</option>
            </select>
          </label>
          {payment === "PARTIAL" ? (
            <label className="text-xs text-[var(--muted)]">
              İndi ödənən (AZN)
              <input
                name="paid_amount"
                required
                min="0.01"
                step="0.01"
                type="number"
                className="field mt-1"
              />
            </label>
          ) : null}
        </>
      ) : null}
      <label className="text-xs text-[var(--muted)]">
        Alış tarixi
        <input
          name="purchase_date"
          type="date"
          required
          defaultValue={purchase?.purchase_date ?? bakuDate()}
          className="field mt-1"
        />
      </label>
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
      {part ? (
        <p className="text-sm">
          Müştəriyə: <strong>{formatMoney(part.quoted_price)}</strong>
          <br />
          Marja:{" "}
          {cost || source === "CUSTOMER_PROVIDED"
            ? formatMoney(
                part.quoted_price -
                  (source === "CUSTOMER_PROVIDED" ? 0 : Number(cost)),
              )
            : "Maya daxil edilməyib"}
        </p>
      ) : null}
      <SubmitButton pendingText="Saxlanır...">
        {purchase ? "Alışı yenilə" : "Alışı saxla"}
      </SubmitButton>
    </ActionForm>
  );
}
