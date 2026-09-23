import { bakuDate } from "@/lib/filters";
import { formatMoneyAZN } from "@/lib/decimal";

export function formatMoney(value: number) {
  return formatMoneyAZN(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("az-AZ", {
    timeZone: "Asia/Baku",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${bakuDate(value)}T12:00:00+04:00`));
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
