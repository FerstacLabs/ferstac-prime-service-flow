"use client";
import { useState } from "react";
import { normalizeAzPlate } from "@/lib/plate";
export function PlateSearch({ defaultValue = "" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <label className="text-xs text-[var(--muted)]">
      Nömrə axtarışı
      <input
        name="plate"
        className="field mt-1 font-mono"
        placeholder="99-AA-999"
        value={value}
        onChange={(e) => setValue(normalizeAzPlate(e.target.value))}
      />
    </label>
  );
}
