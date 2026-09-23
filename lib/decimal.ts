export function parseLocalizedDecimal(value: unknown, scale = 2): string {
  const input = String(value ?? "")
    .trim()
    .replace(/[\u00a0\u202f]/g, " ");
  if (!input || !/^-?[\d., ]+$/.test(input))
    throw new Error("Məbləği düzgün daxil edin.");
  const negative = input.startsWith("-");
  const unsigned = negative ? input.slice(1) : input;
  const separator = Math.max(
    unsigned.lastIndexOf("."),
    unsigned.lastIndexOf(","),
  );
  const whole = separator < 0 ? unsigned : unsigned.slice(0, separator);
  const fraction = separator < 0 ? "" : unsigned.slice(separator + 1);
  if (separator >= 0 && (!/^\d+$/.test(fraction) || fraction.length > scale))
    throw new Error(`Ən çox ${scale} onluq rəqəm daxil edin.`);
  const grouping = whole.match(/[., ]/g);
  if (
    grouping &&
    (!/^\d{1,3}([., ]\d{3})+$/.test(whole) || new Set(grouping).size !== 1)
  )
    throw new Error("Minlik ayırıcıları düzgün deyil.");
  if (!grouping && !/^\d+$/.test(whole)) throw new Error("Rəqəm daxil edin.");
  const digits = whole.replace(/[., ]/g, "").replace(/^0+(?=\d)/, "");
  if (digits.length > 12) throw new Error("Məbləğ çox böyükdür.");
  const minor = BigInt(digits + fraction.padEnd(scale, "0"));
  return `${negative && minor !== 0n ? "-" : ""}${digits}.${fraction.padEnd(scale, "0")}`;
}

export const decimalMinor = (value: unknown, scale = 2) =>
  BigInt(parseLocalizedDecimal(value, scale).replace(".", ""));

export function fromMinor(value: bigint, scale = 2) {
  const digits = (value < 0n ? -value : value)
    .toString()
    .padStart(scale + 1, "0");
  return `${value < 0n ? "-" : ""}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

// Exact integer arithmetic; round half-up once at the financial line boundary.
export function multiplyMoney(quantity: unknown, unitPrice: unknown) {
  const units = decimalMinor(quantity, 3),
    price = decimalMinor(unitPrice);
  if (units < 0n || price < 0n)
    throw new Error("Miqdar və qiymət mənfi ola bilməz.");
  const total = (units * price + 500n) / 1000n;
  if (total > 999999999999n) throw new Error("Sətrin məbləği çox böyükdür.");
  return fromMinor(total);
}

export function formatMoneyAZN(value: unknown, currency = "₼") {
  const canonical = parseLocalizedDecimal(
    typeof value === "number" ? value.toFixed(2) : (value ?? 0),
  );
  const [whole, fraction] = canonical.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${fraction}${currency ? ` ${currency}` : ""}`;
}

export function formatQuantity(value: unknown) {
  return parseLocalizedDecimal(value ?? 1, 3)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}
