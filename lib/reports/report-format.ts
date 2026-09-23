import type {
  FundingSource,
  JobStatus,
  PaymentStatus,
  PurchaseSource,
  WorkStatus,
} from "@/lib/types";
import { bakuDate } from "@/lib/filters";
import { formatMoneyAZN } from "@/lib/decimal";

export const reportJobStatusLabels: Record<JobStatus, string> = {
  RECEIVED: "Qəbul edilib",
  WAITING: "İş gözləyir",
  IN_PROGRESS: "İş gedir",
  WAITING_PARTS: "Detal gözləyir",
  READY: "Hazırdır",
  DELIVERED: "Təhvil verilib",
  PAUSED: "Dayandırılıb",
};

export const reportWorkStatusLabels: Record<WorkStatus, string> = {
  TODO: "Gözləyir",
  IN_PROGRESS: "İcra olunur",
  DONE: "Tamamlanıb",
  CANCELLED: "Ləğv edilib",
};

export const reportFundingLabels: Record<FundingSource, string> = {
  CUSTOMER_FUNDED: "Müştəri hesabına",
  INSURANCE_CLAIM: "Sığorta hadisəsi üzrə",
};

export const reportPaymentLabels: Record<PaymentStatus, string> = {
  PAID: "Ödənilib",
  UNPAID: "Ödənilməyib",
  PARTIAL: "Qismən ödənilib",
};

export const reportPurchaseSourceLabels: Record<PurchaseSource, string> = {
  SUPPLIER: "Təchizatçı",
  INTERNAL_STOCK: "Servis daxili ehtiyat",
  CUSTOMER_PROVIDED: "Müştərinin təqdim etdiyi detal",
};

export function formatReportMoney(value: number | null | undefined) {
  return formatMoneyAZN(value, "AZN");
}

export function formatReportDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const [year, month, day] = bakuDate(value).split("-");
  return `${day}.${month}.${year}`;
}

export function formatReportDateTime(value: Date | string = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return `${formatReportDate(date.toISOString())} ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Baku", hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}`;
}

export function formatReportQuantity(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isInteger(amount)
    ? String(amount)
    : String(amount).replace(".", ",");
}

export function dash(value: string | number | null | undefined) {
  const text =
    value === null || value === undefined ? "" : String(value).trim();
  return text || "-";
}
