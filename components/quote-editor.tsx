"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SearchSelect, type SelectOption } from "@/components/search-select";
import { formatMoney } from "@/lib/format";
import { sumMoney } from "@/lib/workshop";
type Line = {
  key: number;
  catalogId: string;
  quotedPrice: string;
  note: string;
};
export function QuoteEditor({
  kind,
  options,
}: {
  kind: "work" | "part";
  options: SelectOption[];
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [next, setNext] = useState(0);
  const update = (key: number, patch: Partial<Line>) =>
    setLines((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  const title =
    kind === "work" ? "Planlaşdırılan işlər" : "Maşın üçün alınacaq detallar";
  return (
    <section className="border-t border-[var(--border)] pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <strong>
          {formatMoney(sumMoney(lines.map((l) => Number(l.quotedPrice))))}
        </strong>
      </div>
      <input
        type="hidden"
        name={`${kind}_lines`}
        value={JSON.stringify(
          lines.map(({ catalogId, quotedPrice, note }) => ({
            catalogId,
            quotedPrice,
            note,
          })),
        )}
      />
      <div className="space-y-3">
        {lines.map((line) => (
          <div
            key={line.key}
            className="grid items-start gap-3 border-b border-[var(--border)] pb-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_auto]"
          >
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
            <label className="text-xs text-[var(--muted)]">
              Müştəriyə deyilən qiymət
              <input
                type="number"
                min="0"
                step="0.01"
                required
                className="field mt-1"
                value={line.quotedPrice}
                onChange={(e) =>
                  update(line.key, { quotedPrice: e.target.value })
                }
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Qeyd <span className="float-right">{line.note.length}/250</span>
              <input
                maxLength={250}
                className="field mt-1"
                value={line.note}
                onChange={(e) => update(line.key, { note: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary mt-5"
              title="Sətri sil"
              onClick={() =>
                setLines((l) => l.filter((r) => r.key !== line.key))
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-secondary mt-3"
        onClick={() => {
          setLines((l) => [
            ...l,
            { key: next, catalogId: "", quotedPrice: "", note: "" },
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
