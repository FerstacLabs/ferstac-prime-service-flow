"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { DecimalInput } from "@/components/decimal-input";
import { IntakeDateInput } from "@/components/intake-date-input";
import { recordVatAdjustmentAction } from "@/app/actions/ledger";
import { bakuDate } from "@/lib/filters";
import { vatEventLabels, type VatLedgerEntry } from "@/lib/vat-ledger";

export function VatAdjustmentForm({ entries }: { entries: VatLedgerEntry[] }) {
  const [kind, setKind] = useState("OPENING");
  const reversible = entries.filter(
    (r) =>
      !r.cash_transaction_id &&
      r.kind !== "REVERSAL" &&
      !entries.some((v) => v.reversal_of === r.id),
  );
  return (
    <details className="w-full border-y border-[var(--border)] py-3">
      <summary className="cursor-pointer text-sm font-semibold">
        ƏDV depoziti
      </summary>
      <ActionForm
        action={recordVatAdjustmentAction}
        className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <label className="text-xs">
          Əməliyyat
          <select
            name="kind"
            className="field mt-1"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {["OPENING", "FUNDING", "BUDGET_PAYMENT", "REVERSAL"].map((k) => (
              <option key={k} value={k}>
                {vatEventLabels[k]}
              </option>
            ))}
          </select>
        </label>
        {kind === "REVERSAL" && (
          <label className="text-xs">
            Ləğv edilən əməliyyat
            <select name="reversal_of" className="field mt-1" required>
              <option value="">Seçin</option>
              {reversible.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.reference_number} · {r.amount} AZN
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs">
          Məbləğ (AZN)
          <DecimalInput
            name="amount"
            className="field mt-1"
            required
            min="0.01"
          />
        </label>
        <label className="text-xs">
          Tarix
          <IntakeDateInput name="date" defaultValue={bakuDate()} required />
        </label>
        <label className="text-xs">
          Saat
          <input
            type="time"
            name="time"
            className="field mt-1"
            required
            defaultValue="12:00"
          />
        </label>
        <label className="text-xs">
          İstinad
          <input
            name="reference_number"
            className="field mt-1"
            required
            maxLength={200}
          />
        </label>
        <label className="text-xs sm:col-span-2">
          Qeyd
          <input name="note" className="field mt-1" required maxLength={500} />
        </label>
        <div className="flex items-end">
          <SubmitButton>ƏDV əməliyyatını saxla</SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}
