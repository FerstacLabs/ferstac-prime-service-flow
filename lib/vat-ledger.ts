import { decimalMinor, fromMinor } from "@/lib/decimal";
import { bakuDate } from "@/lib/filters";

export const vatEventLabels: Record<string, string> = {
  OPENING: "ƏDV başlanğıc qalığı",
  CUSTOMER_RECEIPT: "Müştəridən ƏDV mədaxili",
  SUPPLIER_PAYMENT: "Təchizatçıya ƏDV məxarici",
  SUPPLIER_REFUND: "Təchizatçıdan ƏDV qaytarılması",
  FUNDING: "ƏDV depozit artırılması",
  BUDGET_PAYMENT: "ƏDV büdcəyə ödəniş",
  REVERSAL: "ƏDV əməliyyatının ləğvi",
};
export type VatLedgerEntry = {
  id: string;
  posting_order: number;
  kind: string;
  direction: "IN" | "OUT";
  amount: number;
  occurred_at: string;
  created_by_name: string;
  reference_number: string;
  note: string;
  service_job_id: string | null;
  supplier_id: string | null;
  cash_transaction_id: string | null;
  reversal_of: string | null;
  channel?: string | null;
  party?: string;
  plate?: string;
};
export type VatFilters = {
  from?: string;
  to?: string;
  vatKind?: string;
  job?: string;
  supplier?: string;
  channel?: string;
};

export function vatLedgerPosition(
  entries: VatLedgerEntry[],
  f: VatFilters = {},
) {
  let balance = 0n,
    opening = 0n,
    closing = 0n;
  const chronological = [...entries].sort(
    (a, b) =>
      a.occurred_at.localeCompare(b.occurred_at) ||
      a.posting_order - b.posting_order,
  );
  const rows = chronological.map((entry) => {
    balance +=
      decimalMinor(entry.amount) * (entry.direction === "IN" ? 1n : -1n);
    const date = bakuDate(entry.occurred_at);
    if (f.from && date < f.from) opening = balance;
    if (!f.to || date <= f.to) closing = balance;
    return { ...entry, balance: Number(fromMinor(balance)) };
  });
  const period = rows.filter(
    (r) =>
      (!f.from || bakuDate(r.occurred_at) >= f.from) &&
      (!f.to || bakuDate(r.occurred_at) <= f.to),
  );
  return {
    balance: Number(fromMinor(balance)),
    opening: Number(fromMinor(opening)),
    closing: Number(fromMinor(closing)),
    period,
    rows: period.filter(
      (r) =>
        (!f.vatKind || r.kind === f.vatKind) &&
        (!f.job || r.service_job_id === f.job) &&
        (!f.supplier || r.supplier_id === f.supplier) &&
        (!f.channel || r.channel === f.channel),
    ),
  };
}
