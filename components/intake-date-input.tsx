"use client";
import { useEffect, useRef } from "react";
import { formatIntakeDate, parseIntakeDate } from "@/lib/intake-date";
export function IntakeDateInput({
  name,
  defaultValue = "",
  required = false,
  className = "field mt-1",
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  const normalized = useRef<HTMLInputElement>(null);
  const display = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = display.current;
    const form = input?.form;
    const reset = () => {
      input?.setCustomValidity("");
      if (normalized.current)
        normalized.current.value = defaultValue
          ? parseIntakeDate(defaultValue.slice(0, 10))
          : "";
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue]);
  const validate = (input: HTMLInputElement) => {
    try {
      const iso = input.value.trim() ? parseIntakeDate(input.value) : "";
      if (normalized.current) normalized.current.value = iso;
      input.setCustomValidity("");
      return iso;
    } catch (error) {
      if (normalized.current) normalized.current.value = "";
      input.setCustomValidity((error as Error).message);
      return null;
    }
  };
  return (
    <>
      <input
        ref={display}
        name={`${name}_display`}
        data-date-field={name}
        type="text"
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        title="GÜN/AY/İL"
        className={className}
        required={required}
        defaultValue={formatIntakeDate(defaultValue)}
        onChange={(e) => {
          validate(e.target);
        }}
        onBlur={(e) => {
          const iso = validate(e.target);
          if (iso !== null) e.target.value = formatIntakeDate(iso);
          else e.target.reportValidity();
        }}
      />
      <input
        ref={normalized}
        type="hidden"
        name={name}
        defaultValue={
          defaultValue ? parseIntakeDate(defaultValue.slice(0, 10)) : ""
        }
        data-date-value
      />
    </>
  );
}
