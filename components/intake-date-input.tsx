"use client";
import { useState } from "react";
import { formatIntakeDate, parseIntakeDate } from "@/lib/intake-date";
export function IntakeDateInput({
  name,
  defaultValue = "",
  required = false,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(formatIntakeDate(defaultValue));
  return (
    <input
      name={name}
      type="text"
      inputMode="numeric"
      placeholder="MM/DD/YYYY"
      title="AY/GÜN/İL"
      className="field mt-1"
      required={required}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        e.target.setCustomValidity("");
      }}
      onBlur={(e) => {
        try {
          if (value.trim()) setValue(formatIntakeDate(parseIntakeDate(value)));
          e.target.setCustomValidity("");
        } catch (error) {
          e.target.setCustomValidity((error as Error).message);
          e.target.reportValidity();
        }
      }}
    />
  );
}
