"use client";
import type { InputHTMLAttributes } from "react";
import { decimalMinor, parseLocalizedDecimal } from "@/lib/decimal";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "min" | "max"
> & { scale?: number; min?: string | number; max?: string | number };
export function DecimalInput({
  scale = 2,
  min = 0,
  max = "9999999999.99",
  onChange,
  onBlur,
  ...props
}: Props) {
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      onChange={(e) => {
        e.currentTarget.setCustomValidity("");
        onChange?.(e);
      }}
      onBlur={(e) => {
        const input = e.currentTarget;
        try {
          if (input.value.trim()) {
            const normalized = parseLocalizedDecimal(input.value, scale);
            if (
              decimalMinor(normalized, scale) < decimalMinor(min, scale) ||
              decimalMinor(normalized, scale) > decimalMinor(max, scale)
            )
              throw new Error("Məbləğ icazə verilən aralıqda deyil.");
          }
          input.setCustomValidity("");
        } catch (error) {
          input.setCustomValidity((error as Error).message);
          input.reportValidity();
        }
        onBlur?.(e);
      }}
    />
  );
}
