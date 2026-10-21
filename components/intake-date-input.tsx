"use client";
import { useEffect, useRef } from "react";
import { CalendarDays } from "lucide-react";
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
  const calendar = useRef<HTMLInputElement>(null);
  const previous = useRef(formatIntakeDate(defaultValue));
  useEffect(() => {
    const input = display.current;
    const form = input?.form;
    const reset = () => {
      previous.current = formatIntakeDate(defaultValue);
      input?.setCustomValidity("");
      if (normalized.current)
        normalized.current.value = defaultValue
          ? parseIntakeDate(defaultValue.slice(0, 10))
          : "";
    };
    const restore = () => {
      if (!input) return;
      previous.current = input.value;
      try {
        const iso = input.value.trim() ? parseIntakeDate(input.value) : "";
        if (normalized.current) normalized.current.value = iso;
        input.setCustomValidity("");
      } catch (error) {
        if (normalized.current) normalized.current.value = "";
        input.setCustomValidity((error as Error).message);
      }
    };
    form?.addEventListener("reset", reset);
    form?.addEventListener("prime:draft-restored", restore);
    return () => {
      form?.removeEventListener("reset", reset);
      form?.removeEventListener("prime:draft-restored", restore);
    };
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
  const selectDate = (input: HTMLInputElement, iso: string) => {
    const value = formatIntakeDate(iso);
    // Native setter lets React and containing filter forms observe picker/paste changes.
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    previous.current = value;
    validate(input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return (
    <span className="relative block min-w-0">
      <input
        ref={display}
        name={`${name}_display`}
        data-date-field={name}
        type="text"
        inputMode="numeric"
        placeholder="GG/AA/İİİİ"
        title="GÜN/AY/İL"
        className={`${className} pr-11`}
        maxLength={10}
        required={required}
        defaultValue={formatIntakeDate(defaultValue)}
        onChange={(e) => {
          const input = e.target;
          const raw = input.value;
          if (/[^\d/ .-]/.test(raw)) {
            input.value = previous.current;
            return;
          }
          const caret = input.selectionStart ?? raw.length;
          let digits = raw.replace(/\D/g, "").slice(0, 8);
          const deleting = (e.nativeEvent as InputEvent).inputType?.startsWith(
            "delete",
          );
          if (
            deleting &&
            previous.current.endsWith("/") &&
            raw === previous.current.slice(0, -1)
          )
            digits = digits.slice(0, -1);
          let next: string;
          try {
            next = formatIntakeDate(parseIntakeDate(raw));
          } catch {
            next =
              digits.slice(0, 2) +
              (digits.length > 2 || (digits.length === 2 && !deleting)
                ? "/"
                : "") +
              digits.slice(2, 4) +
              (digits.length > 4 || (digits.length === 4 && !deleting)
                ? "/"
                : "") +
              digits.slice(4);
          }
          input.value = next;
          previous.current = next;
          if (caret < raw.length) {
            const before = raw.slice(0, caret).replace(/\D/g, "").length;
            const position =
              before + (before > 2 ? 1 : 0) + (before > 4 ? 1 : 0);
            input.setSelectionRange(position, position);
          }
          validate(e.target);
        }}
        onPaste={(e) => {
          e.preventDefault();
          const input = e.currentTarget;
          const pasted = e.clipboardData.getData("text").trim();
          try {
            const iso = parseIntakeDate(pasted);
            selectDate(input, iso);
          } catch {
            if (/^\d{2}[/.-]\d{2}[/.-]\d{4}$/.test(pasted)) {
              input.value = pasted.replace(/[.-]/g, "/");
              previous.current = input.value;
            }
            input.setCustomValidity("Düzgün tarix daxil edin (GG/AA/İİİİ).");
            if (normalized.current) normalized.current.value = "";
            input.reportValidity();
          }
        }}
        onBlur={(e) => {
          const iso = validate(e.target);
          if (iso !== null) e.target.value = formatIntakeDate(iso);
          else e.target.reportValidity();
        }}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
        aria-label="Təqvimi aç"
        title="Təqvimi aç"
        onClick={(e) => {
          e.preventDefault();
          const picker = calendar.current;
          if (!picker) return;
          picker.value = normalized.current?.value || "";
          try {
            if (typeof picker.showPicker === "function") picker.showPicker();
            else {
              picker.className = "field mt-2";
              picker.focus();
            }
          } catch {
            picker.className = "field mt-2";
            picker.focus();
          }
        }}
      >
        <CalendarDays size={18} />
      </button>
      <input
        ref={calendar}
        type="date"
        aria-hidden="true"
        tabIndex={-1}
        data-date-field={name}
        min="1900-01-01"
        max="2200-12-31"
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        onChange={(e) => {
          if (!display.current) return;
          selectDate(display.current, e.target.value);
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
    </span>
  );
}
