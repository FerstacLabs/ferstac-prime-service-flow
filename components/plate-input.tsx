"use client";

import { useState } from "react";
import { isValidAzPlate, normalizeAzPlate } from "@/lib/plate";

export function PlateInput() {
  const [plate, setPlate] = useState("");
  return (
    <>
      <input
        name="plate"
        value={plate}
        onChange={(event) => setPlate(normalizeAzPlate(event.target.value))}
        className="w-full rounded-lg border border-[var(--border)] bg-black/25 px-3 py-3 font-mono text-2xl font-bold uppercase outline-none focus:border-[var(--accent)]"
        placeholder="99-AA-999"
        required
      />
      <p className={`mt-2 text-sm ${plate && isValidAzPlate(plate) ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>
        Nömrə avtomatik böyük hərflə 99-AA-999 formatına salınır.
      </p>
    </>
  );
}
