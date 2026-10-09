import { bakuDate } from "@/lib/filters";
import { formatMoneyAZN } from "@/lib/decimal";
import { formatIntakeDate } from "@/lib/intake-date";

export function formatMoney(value: number) {
  return formatMoneyAZN(value);
}

export function formatDate(value: string) {
  return formatIntakeDate(bakuDate(value));
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
