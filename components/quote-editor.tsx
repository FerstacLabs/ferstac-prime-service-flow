"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SearchSelect, type SelectOption } from "@/components/search-select";
import { DecimalInput } from "@/components/decimal-input";
import {
  decimalMinor,
  formatMoneyAZN,
  fromMinor,
  multiplyMoney,
} from "@/lib/decimal";

type Unit = SelectOption & { is_active?: boolean };
export type QuoteLine = {
  catalogId: string;
  quotedPrice: string;
  quantity: string;
  unitId: string;
  note: string;
  costNote: string;
};
const lineTotal = (line: Pick<QuoteLine, "quantity" | "quotedPrice">) => {
  try {
    return multiplyMoney(line.quantity, line.quotedPrice);
  } catch {
    return null;
  }
};
export function QuoteLineFields({
  line,
  update,
  units,
  named = false,
}: {
  line: QuoteLine;
  update: (patch: Partial<QuoteLine>) => void;
  units: Unit[];
  named?: boolean;
}) {
  const total = lineTotal(line);
  return (
    <>
      <label className="text-xs text-[var(--muted)]">
        Miqdar
        <DecimalInput
          name={named ? "quantity" : undefined}
          scale={3}
          min="0.001"
          max="100000"
          value={line.quantity}
          required
          className="field mt-1"
          onChange={(e) => update({ quantity: e.target.value })}
        />
      </label>
      <SearchSelect
        name={named ? "unit_id" : undefined}
        label="Ölçü vahidi"
        options={units.filter(
          (u) => u.is_active !== false || u.id === line.unitId,
        )}
        createKind="unit"
        required
        value={line.unitId}
        onChange={(unitId) => update({ unitId })}
      />
      <label className="text-xs text-[var(--muted)]">
        Vahid qiyməti (AZN)
        <DecimalInput
          name={named ? "quoted_price" : undefined}
          required
          className="field mt-1"
          value={line.quotedPrice}
          onChange={(e) => update({ quotedPrice: e.target.value })}
        />
      </label>
      <div className="text-xs text-[var(--muted)]">
        Məbləğ
        <output className="mt-1 flex min-h-11 items-center font-semibold text-[var(--text)]">
          {total === null ? "-" : formatMoneyAZN(total)}
        </output>
      </div>
      <label className="min-w-0 text-xs text-[var(--muted)] sm:col-span-2">
        <span className="flex justify-between gap-2">
          Qeyd <span>{line.note.length}/250</span>
        </span>
        <textarea
          name={named ? "notes" : undefined}
          rows={2}
          maxLength={250}
          className="field mt-1"
          value={line.note}
          onChange={(e) => update({ note: e.target.value })}
        />
      </label>
      <label
        className="min-w-0 text-xs text-[var(--muted)] sm:col-span-2"
        title="Satınalma və ya usta maya dəyəri daxil edilərkən daxili məlumat üçün."
      >
        Maya qeydi
        <textarea
          name={named ? "cost_note" : undefined}
          rows={2}
          maxLength={250}
          className="field mt-1"
          value={line.costNote}
          onChange={(e) => update({ costNote: e.target.value })}
        />
      </label>
    </>
  );
}
export function EditQuoteFields({
  initial,
  units,
}: {
  initial: QuoteLine;
  units: Unit[];
}) {
  const [line, setLine] = useState(initial);
  return (
    <QuoteLineFields
      line={line}
      update={(patch) => setLine((l) => ({ ...l, ...patch }))}
      units={units}
      named
    />
  );
}
export function QuoteEditor({
  kind,
  options,
  units = [],
  onTotalChange,
}: {
  kind: "work" | "part";
  options: SelectOption[];
  units?: Unit[];
  onTotalChange?: (total: string) => void;
}) {
  const [lines, setLines] = useState<(QuoteLine & { key: number })[]>([]);
  const [next, setNext] = useState(0);
  const total = fromMinor(
    lines.reduce((sum, line) => sum + decimalMinor(lineTotal(line) ?? 0), 0n),
  );
  useEffect(() => {
    onTotalChange?.(total);
  }, [total, onTotalChange]);
  const update = (key: number, patch: Partial<QuoteLine>) =>
    setLines((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  return (
    <section className="border-t border-[var(--border)] pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {kind === "work" ? "Planlaşdırılan işlər" : "Tələb olunan detallar"}
        </h2>
        <strong>{formatMoneyAZN(total)}</strong>
      </div>
      <input
        type="hidden"
        name={`${kind}_lines`}
        value={JSON.stringify(
          lines.map(
            ({ catalogId, quotedPrice, quantity, unitId, note, costNote }) => ({
              catalogId,
              quotedPrice,
              quantity,
              unitId,
              note,
              costNote,
            }),
          ),
        )}
      />
      <div className="space-y-4">
        {lines.map((line) => (
          <div key={line.key} className="border-b border-[var(--border)] pb-4">
            <div className="mb-3 flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <SearchSelect
                  label={kind === "work" ? "İş / xidmət" : "Detal"}
                  options={options.filter(
                    (o) =>
                      o.id === line.catalogId ||
                      !lines.some((l) => l.catalogId === o.id),
                  )}
                  createKind={kind}
                  required
                  value={line.catalogId}
                  onChange={(catalogId) => update(line.key, { catalogId })}
                />
              </div>
              <button
                type="button"
                className="btn btn-danger btn-icon"
                title="Sətri sil"
                aria-label="Sətri sil"
                onClick={() =>
                  setLines((rows) => rows.filter((r) => r.key !== line.key))
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="grid min-w-0 items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <QuoteLineFields
                line={line}
                update={(patch) => update(line.key, patch)}
                units={units}
              />
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-secondary mt-3"
        onClick={() => {
          setLines((rows) => [
            ...rows,
            {
              key: next,
              catalogId: "",
              quantity: "1",
              unitId:
                units.find(
                  (u) =>
                    u.name === (kind === "work" ? "Xidmət" : "Ədəd") &&
                    u.is_active !== false,
                )?.id ?? "",
              quotedPrice: "",
              note: "",
              costNote: "",
            },
          ]);
          setNext((n) => n + 1);
        }}
      >
        <Plus size={16} />
        {kind === "work" ? "İş əlavə et" : "Detal əlavə et"}
      </button>
    </section>
  );
}
export function IntakeQuotes({
  work,
  parts,
  units,
}: {
  work: SelectOption[];
  parts: SelectOption[];
  units: Unit[];
}) {
  const [workTotal, setWorkTotal] = useState("0.00"),
    [partTotal, setPartTotal] = useState("0.00");
  return (
    <>
      <QuoteEditor
        kind="work"
        options={work}
        units={units}
        onTotalChange={setWorkTotal}
      />
      <QuoteEditor
        kind="part"
        options={parts}
        units={units}
        onTotalChange={setPartTotal}
      />
      <div className="flex flex-wrap justify-between gap-3 border-y border-[var(--border)] py-5 font-semibold">
        <span>Yekun təklif məbləği</span>
        <output>
          {formatMoneyAZN(
            fromMinor(decimalMinor(workTotal) + decimalMinor(partTotal)),
          )}
        </output>
      </div>
    </>
  );
}
