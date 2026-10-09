import { formatMoneyAZN } from "@/lib/decimal";
import { vatPricing } from "@/lib/vat";

export function VatTotals({
  net,
  enabled,
}: {
  net: string | number;
  enabled: boolean;
}) {
  const totals = vatPricing(net, enabled);
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 border-y border-[var(--border)] py-3 text-sm">
      {enabled && (
        <>
          <dt>ƏDV-siz cəm</dt>
          <dd className="text-right tabular-nums">
            {formatMoneyAZN(totals.net)}
          </dd>
          <dt>ƏDV (18%)</dt>
          <dd className="text-right tabular-nums">
            {formatMoneyAZN(totals.vat)}
          </dd>
        </>
      )}
      <dt className="font-semibold">
        {enabled ? "Yekun ƏDV-li məbləğ" : "Yekun təklif məbləği"}
      </dt>
      <dd className="text-right font-semibold tabular-nums">
        <output>{formatMoneyAZN(totals.gross)}</output>
      </dd>
    </dl>
  );
}
