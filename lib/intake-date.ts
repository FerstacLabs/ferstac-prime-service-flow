export function parseIntakeDate(value: unknown): string {
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  const [year, month, day] = iso
    ? iso.slice(1).map(Number)
    : local
      ? [Number(local[3]), Number(local[1]), Number(local[2])]
      : [];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !year ||
    year < 1900 ||
    year > 2200 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new Error("Tarixi AY/GÜN/İL formatında daxil edin.");
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function formatIntakeDate(iso: string | null | undefined) {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${month}/${day}/${year}`;
}
