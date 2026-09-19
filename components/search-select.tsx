"use client";
import { useId, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { createCatalogAction } from "@/app/actions/finance";
export type SelectOption = { id: string; name: string };
export function SearchSelect({
  name,
  label,
  options,
  defaultValue = "",
  value,
  onChange,
  required = false,
  createKind,
}: {
  name?: string;
  label: string;
  options: SelectOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (id: string) => void;
  required?: boolean;
  createKind?: "work" | "part" | "role";
}) {
  const id = useId();
  const [local, setLocal] = useState(defaultValue);
  const selected = value ?? local;
  const [added, setAdded] = useState<SelectOption[]>([]);
  const all = [
    ...options,
    ...added.filter((a) => !options.some((o) => o.id === a.id)),
  ];
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const filtered = all.filter((o) =>
    o.name
      .toLocaleLowerCase("az")
      .includes((query ?? "").toLocaleLowerCase("az")),
  );
  const choose = (item: SelectOption) => {
    setLocal(item.id);
    onChange?.(item.id);
    setQuery(null);
    setOpen(false);
    ref.current?.setCustomValidity("");
  };
  return (
    <div
      className="relative min-w-0"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          setQuery(null);
          ref.current?.setCustomValidity("");
        }
      }}
    >
      <label htmlFor={id} className="mb-1 block text-xs text-[var(--muted)]">
        {label}
      </label>
      <input type="hidden" name={name} value={selected} />
      <div className="flex gap-1">
        <div className="relative min-w-0 flex-1">
          <input
            ref={ref}
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            autoComplete="off"
            required={required}
            className="field pr-8"
            value={query ?? all.find((o) => o.id === selected)?.name ?? ""}
            placeholder={label}
            onFocus={() => {
              setQuery("");
              setOpen(true);
              setActive(0);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
              ref.current?.setCustomValidity(
                required ? "Siyahıdan seçim edin." : "",
              );
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                setQuery(null);
              }
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setOpen(true);
                setActive((a) =>
                  Math.max(
                    0,
                    Math.min(
                      filtered.length - 1,
                      a + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
                );
              }
              if (e.key === "Enter" && open) {
                e.preventDefault();
                if (filtered[active]) choose(filtered[active]);
              }
            }}
          />
          <ChevronDown
            className="pointer-events-none absolute right-2 top-3"
            size={16}
          />
        </div>
        {createKind ? (
          <button
            type="button"
            title={`Yeni ${label.toLocaleLowerCase("az")}`}
            aria-label={`Yeni ${label.toLocaleLowerCase("az")}`}
            className="btn btn-secondary px-3"
            onClick={() => {
              setCreating(true);
              setNewName(query ?? "");
              setOpen(false);
            }}
          >
            <Plus size={18} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded border border-[var(--border)] bg-[var(--surface)] shadow-xl"
        >
          {!required ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm"
              onClick={() => choose({ id: "", name: "" })}
            >
              Hamısı / seçilməyib
            </button>
          ) : null}
          {filtered.map((o, i) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={selected === o.id}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-white/10 ${i === active ? "bg-white/10" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
            >
              {o.name}
              {selected === o.id ? <Check size={14} /> : null}
            </button>
          ))}
          {!filtered.length ? (
            <div className="p-3 text-sm text-[var(--muted)]">Nəticə yoxdur</div>
          ) : null}
        </div>
      ) : null}
      {creating ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Yeni ${label}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">
                Yeni {label.toLocaleLowerCase("az")}
              </h3>
              <button
                type="button"
                title="Bağla"
                onClick={() => setCreating(false)}
              >
                <X size={20} />
              </button>
            </div>
            <input
              aria-label="Yeni ad"
              value={newName}
              maxLength={120}
              className="field"
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
            />
            {error ? (
              <p role="alert" className="mt-2 text-sm text-red-300">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={pending || !newName.trim()}
              className="btn btn-primary mt-4"
              onClick={() =>
                startTransition(async () => {
                  try {
                    const result = await createCatalogAction(
                      createKind!,
                      newName,
                    );
                    if (result.error) {
                      setError(result.error);
                      return;
                    }
                    if (result.item) {
                      setAdded((a) => [...a, result.item!]);
                      choose(result.item);
                      setCreating(false);
                      setError("");
                    }
                  } catch {
                    setError("Saxlama alınmadı. Yenidən cəhd edin.");
                  }
                })
              }
            >
              {pending ? "Saxlanır..." : "Saxla"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
