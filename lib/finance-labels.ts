import { allocationLabels } from "@/lib/workshop";

const labels: Record<string, string> = {
  ...allocationLabels,
  SUPPLIER_PURCHASE: "Təchizatçı ödənişi",
  SUPPLIER_PAYMENT: "Təchizatçı ödənişi",
  WORKER_WORK_ITEM: "Usta işi üzrə ödəniş",
  CASH_IN: "Nağd mədaxil",
  CASH_OUT: "Nağd məxaric",
  BANK_IN: "Bank mədaxili",
  BANK_OUT: "Bank məxarici",
  TRANSFER: "Daxili köçürmə",
  OPENING_BALANCE: "Başlanğıc qalıq",
  VEHICLE_SETTLEMENT: "Avtomobil üzrə hesablaşma",
  REVERSAL: "Ləğv / əks əməliyyat",
};
export const financialLabel = (code: string) =>
  labels[code] || "Digər əməliyyat";
export function financialCategoryLabel(
  entry: {
    allocation_type: string;
    transfer_id?: string | null;
    category_id?: string | null;
  },
  categories: Array<{ id: string; name: string }>,
) {
  if (entry.transfer_id) return "Daxili köçürmə";
  if (entry.allocation_type.startsWith("OPENING_")) return "Başlanğıc qalıq";
  return (
    categories.find((c) => c.id === entry.category_id)?.name ||
    financialLabel(entry.allocation_type)
  );
}
