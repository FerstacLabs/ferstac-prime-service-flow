import { sumMoney } from "@/lib/workshop";

type Profit = {
  grossProfit: number | null;
  missingWork: number;
  missingParts: number;
  detailed: boolean;
};
export function profitReason(n: Profit) {
  if (!n.detailed)
    return "Sətir qiymətləri daxil edilməyib; mənfəət hesablanmır.";
  if (n.missingWork && n.missingParts)
    return `${n.missingWork + n.missingParts} xərc məlumatı tamamlanmayıb.`;
  if (n.missingParts)
    return `${n.missingParts} detal üçün faktiki maya daxil edilməyib.`;
  if (n.missingWork) return "Usta maya məlumatı tamamlanmayıb.";
  return "";
}
export function profitSummary(rows: Profit[]) {
  const missing = rows.filter((n) => n.grossProfit == null).length;
  const complete = rows.length - missing;
  return {
    amount:
      complete || !rows.length
        ? sumMoney(rows.map((n) => n.grossProfit))
        : null,
    status: missing
      ? complete
        ? "Qismən hesablanıb"
        : "Maya məlumatı natamamdır"
      : "Tam hesablanıb",
    explanation: missing
      ? `${missing} servis kartında ${rows.some((n) => !n.detailed) ? "maya və ya sətir qiyməti" : "maya"} məlumatı natamamdır; ümumi mənfəət yekun deyil.`
      : "",
  };
}
