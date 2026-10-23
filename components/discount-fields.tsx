"use client";
import { useEffect, useRef } from "react";
import { useDraftState } from "@/components/form-draft";
import { DecimalInput } from "@/components/decimal-input";
import { discountedPricing, type DiscountType } from "@/lib/discount";
import { decimalMinor, fromMinor, formatMoneyAZN } from "@/lib/decimal";
import { VatMode } from "@/components/vat-mode";

export function DiscountFields({ base, initialType = "NONE", initialValue = 0, initialVat = false, paid = 0, showPayments = true }: {
  base: string | number;
  initialType?: DiscountType;
  initialValue?: number;
  initialVat?: boolean;
  paid?: number;
  showPayments?: boolean;
}) {
  const [type, setType] = useDraftState<DiscountType>("discount:type", initialType,
    (v) => ["NONE", "PERCENT", "AMOUNT"].includes(String(v)));
  const [value, setValue] = useDraftState("discount:value", String(initialValue));
  const [vat, setVat] = useDraftState("quote:vat", initialVat);
  const container = useRef<HTMLDivElement>(null);
  let pricing: ReturnType<typeof discountedPricing> | null = null;
  let error = "";
  try {
    pricing = discountedPricing(base, { discount_type: type, discount_value: type === "NONE" ? 0 : value || "0", vat_enabled: vat });
  } catch (e) { error = (e as Error).message; }
  useEffect(() => {
    container.current?.querySelector<HTMLInputElement>('input[name="discount_value"]')?.setCustomValidity(error);
  }, [error]);
  const due = pricing ? decimalMinor(pricing.gross) - decimalMinor(paid) : 0n;
  return <section className="space-y-4" ref={container}>
    <VatMode value={vat} onChange={setVat} />
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={type !== "NONE"} onChange={(e) => setType(e.target.checked ? "PERCENT" : "NONE")} />
      Endirim tətbiq et
    </label>
    <input type="hidden" name="discount_type" value={type} />
    {type !== "NONE" ? <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Endirim növü
        <select className="field mt-1" value={type} onChange={(e) => setType(e.target.value as DiscountType)}>
          <option value="PERCENT">Faizlə (%)</option>
          <option value="AMOUNT">Məbləğlə (AZN)</option>
        </select>
      </label>
      <label className="text-sm">Endirim dəyəri
        <DecimalInput data-draft-managed name="discount_value" value={value} max={type === "PERCENT" ? 100 : base} onChange={(e) => setValue(e.target.value)} required className="field mt-1" />
      </label>
    </div> : <input type="hidden" name="discount_value" value="0" />}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {pricing && <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-y border-[var(--border)] py-3 text-sm">
      {[
        ...(type !== "NONE" ? [
          ["Endirimdən əvvəl (ƏDV-siz)", pricing.beforeDiscount],
          [`Endirim${type === "PERCENT" ? ` (${value || 0}%)` : ""}`, pricing.discount],
        ] : []),
        ...(vat ? [["ƏDV-siz cəm", pricing.net], ["ƏDV (18%)", pricing.vat]] : []),
        ["Yekun təklif məbləği", pricing.gross],
        ...(showPayments ? [["Müştəridən alınmış ödənişlər", paid],
          ["Müştərinin qalıq borcu", fromMinor(due < 0n ? 0n : due)]] : []),
      ].map(([label, amount]) => <div key={String(label)} className="contents">
        <dt>{label}</dt><dd className="text-right tabular-nums"><output>{formatMoneyAZN(amount)}</output></dd>
      </div>)}
    </dl>}
  </section>;
}
