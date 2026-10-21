import { decimalMinor, fromMinor } from "@/lib/decimal";
import { vatPricing } from "@/lib/vat";

export type DiscountType = "NONE" | "PERCENT" | "AMOUNT";
export type Discount = {
  discount_type?: DiscountType;
  discount_value?: number | string;
  vat_enabled?: boolean;
};
// Contract-level discount on net customer pricing. Costs and cash never enter this calculation.
export function discountedPricing(base: number | string, job: Discount = {}) {
  const subtotal = decimalMinor(typeof base === "number" ? base.toFixed(2) : base);
  const type = job.discount_type ?? "NONE";
  const value = decimalMinor(job.discount_value ?? 0);
  if (subtotal < 0n || value < 0n || !["NONE", "PERCENT", "AMOUNT"].includes(type) ||
    (type === "NONE" && value !== 0n) || (type === "PERCENT" && value > 10000n))
    throw new Error("Endirim dəyəri düzgün deyil.");
  const discount = type === "PERCENT"
    ? (subtotal * value + 5000n) / 10000n
    : type === "AMOUNT" ? value : 0n;
  if (discount > subtotal) throw new Error("Endirim ümumi məbləğdən çox ola bilməz.");
  return {
    beforeDiscount: fromMinor(subtotal),
    discount: fromMinor(discount),
    ...vatPricing(fromMinor(subtotal - discount), job.vat_enabled ?? false),
  };
}
export function discountFromForm(form: FormData) {
  const type = String(form.get("discount_type") ?? "NONE") as DiscountType;
  const value = fromMinor(decimalMinor(form.get("discount_value") || 0));
  // Upper-bound against the actual quote is additionally enforced in PostgreSQL.
  discountedPricing("9999999999.99", { discount_type: type, discount_value: value });
  return { discount_type: type, discount_value: value };
}
