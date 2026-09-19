import { bakuDate } from "@/lib/filters";

export const moneyFormatter = new Intl.NumberFormat("az-AZ", {
  style: "currency",
  currency: "AZN",
  maximumFractionDigits: 2,
});

export function formatMoney(value: number) {
  const [whole, fraction] = Math.abs(Number(value)).toFixed(2).split(".");
  return `${value < 0 ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${fraction} ₼`;
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
