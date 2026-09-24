"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { SearchSelect, type SelectOption } from "@/components/search-select";
import { DecimalInput } from "@/components/decimal-input";
import {
  saveWorkCostingAction,
  createAdditionalWorkAction,
} from "@/app/actions/purchases";
import { formatMoney } from "@/lib/format";
import {
  formatQuantity,
  multiplyMoney,
  parseLocalizedDecimal,
} from "@/lib/decimal";
import { costKnown } from "@/lib/workshop";
import type { DbWorkItem } from "@/lib/supabase/queries";
import { statusLabels } from "@/components/app-shell";

export function AdditionalMeasureFields({ units }: { units: SelectOption[] }) {
  const [quantity, setQuantity] = useState("1"),
    [price, setPrice] = useState("0");
  let total: string | null = null;
  try {
    total = multiplyMoney(
      parseLocalizedDecimal(quantity, 3),
      parseLocalizedDecimal(price),
    );
  } catch {}
  return (
    <>
      <label className="text-xs text-[var(--muted)]">
        Miqdar
        <DecimalInput
          name="quoted_quantity"
          scale={3}
          min="0.001"
          max="100000"
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="field mt-1"
        />
      </label>
      <SearchSelect
        name="unit_id"
        label="Ölçü vahidi"
        options={units}
        createKind="unit"
        required
      />
      <label className="text-xs text-[var(--muted)]">
        Müştəri vahid qiyməti (AZN)
        <DecimalInput
          name="customer_unit_price"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="field mt-1"
        />
      </label>
      <p className="text-sm">
        Müştəri məbləği:{" "}
        <strong>{total === null ? "-" : formatMoney(Number(total))}</strong>
      </p>
      <label className="text-xs text-[var(--muted)] sm:col-span-2">
        Maya qeydi
        <textarea
          name="cost_note"
          maxLength={250}
          rows={2}
          className="field mt-1"
        />
      </label>
    </>
  );
}

export function WorkerCostForm({
  work,
  paid,
  workers = [],
}: {
  work: DbWorkItem;
  paid: number;
  workers?: SelectOption[];
}) {
  return (
    <ActionForm
      action={saveWorkCostingAction}
      className="grid max-w-4xl items-end gap-3 sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={work.id} />
      <div className="sm:col-span-2">
        <h3 className="font-semibold">
          {work.custom_title || work.work_catalog?.name || "Digər iş"}{" "}
          {work.is_additional ? (
            <span className="text-xs text-[var(--accent)]">Əlavə iş</span>
          ) : null}
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {formatQuantity(work.quantity ?? 1)}{" "}
          {work.unit_catalog?.name ?? "Xidmət"} · Vahid qiyməti:{" "}
          {work.customer_unit_price == null
            ? "-"
            : formatMoney(work.customer_unit_price)}{" "}
          · Müştəri məbləği:{" "}
          {work.quoted_price == null ? "-" : formatMoney(work.quoted_price)} ·{" "}
          {statusLabels[work.status]}
        </p>
        {work.notes ? <p className="mt-2 text-sm">{work.notes}</p> : null}
        {work.cost_note ? (
          <div className="mt-2 border-l-2 border-[var(--accent)] pl-3 text-sm">
            <strong>Maya qeydi</strong>
            <p className="whitespace-pre-wrap break-words">{work.cost_note}</p>
          </div>
        ) : null}
      </div>
      <SearchSelect
        name="assigned_worker_id"
        label="İşi görəcək usta"
        options={workers}
        defaultValue={work.assigned_worker_id ?? ""}
      />
      <label className="text-xs text-[var(--muted)]">
        Usta maya dəyəri
        <DecimalInput
          name="labor_cost"
          min={paid}
          required
          defaultValue={costKnown(work) ? work.labor_cost : ""}
          className="field mt-1"
        />
      </label>
      <div>
        <SubmitButton pendingText="Saxlanır...">Mayanı saxla</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AdditionalWorkForm({
  jobId,
  catalog,
  units,
  workers,
}: {
  jobId: string;
  catalog: SelectOption[];
  units: SelectOption[];
  workers: SelectOption[];
}) {
  return (
    <ActionForm
      action={createAdditionalWorkAction}
      className="mt-4 grid max-w-5xl items-end gap-3 sm:grid-cols-2 xl:grid-cols-3"
      reset
    >
      <input type="hidden" name="service_job_id" value={jobId} />
      <SearchSelect
        name="catalog_id"
        label="İşin adı"
        options={catalog}
        required
        createKind="work"
      />
      <AdditionalMeasureFields units={units} />
      <SearchSelect
        name="assigned_worker_id"
        label="İşi görəcək usta"
        options={workers}
      />
      <label className="text-xs text-[var(--muted)]">
        Usta maya dəyəri
        <DecimalInput name="labor_cost" required className="field mt-1" />
      </label>
      <label className="text-xs text-[var(--muted)] sm:col-span-2">
        Qeyd
        <textarea
          name="notes"
          maxLength={250}
          rows={2}
          className="field mt-1"
        />
      </label>
      <SubmitButton pendingText="Saxlanır...">Əlavə işi saxla</SubmitButton>
    </ActionForm>
  );
}
