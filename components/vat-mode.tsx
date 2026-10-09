"use client";
import { useState } from "react";

export function VatMode({
  initial = false,
  value,
  onChange,
  name = "vat_enabled",
}: {
  name?: string;
  initial?: boolean;
  value?: boolean;
  onChange?: (enabled: boolean) => void;
}) {
  const [selected, setSelected] = useState(initial);
  const enabled = value ?? selected;
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs text-[var(--muted)]">
        Qiymətləndirmə
      </legend>
      <div className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {[false, true].map((option) => (
          <label key={String(option)} className="flex items-center gap-2">
            <input
              type="radio"
              name={name}
              value={String(option)}
              checked={enabled === option}
              onChange={() => {
                setSelected(option);
                onChange?.(option);
              }}
            />
            {option ? "ƏDV-li (18%)" : "ƏDV-siz"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
