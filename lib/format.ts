import { az } from "date-fns/locale";
import { format } from "date-fns";

export const moneyFormatter = new Intl.NumberFormat("az-AZ", {
  style: "currency",
  currency: "AZN",
  maximumFractionDigits: 2
});

export function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

export function formatDate(value: string) {
  return format(new Date(value), "dd MMM yyyy", { locale: az });
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
