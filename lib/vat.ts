import { decimalMinor, fromMinor } from "@/lib/decimal";

export const VAT_RATE = 18;
export type VatAmounts = { net: string; vat: string; gross: string };

function nonnegative(value: string | number) {
  const amount = decimalMinor(value);
  if (amount < 0n) throw new Error("Məbləğ mənfi ola bilməz.");
  return amount;
}

function amounts(net: bigint, vat: bigint): VatAmounts {
  return {
    net: fromMinor(net),
    vat: fromMinor(vat),
    gross: fromMinor(net + vat),
  };
}

export function vatPricing(
  netAmount: string | number,
  enabled: boolean,
): VatAmounts {
  const net = nonnegative(netAmount);
  const vat = enabled ? (net * BigInt(VAT_RATE) + 50n) / 100n : 0n;
  return amounts(net, vat);
}

// Allocate against the original invoice components, not each payment in isolation.
// Differences between cumulative rounded VAT totals make the final payment exact.
export function splitVatSettlement(
  invoice: VatAmounts,
  grossPayment: string | number,
  previouslySettledGross: string | number = "0",
): VatAmounts {
  const net = nonnegative(invoice.net);
  const vat = nonnegative(invoice.vat);
  const gross = nonnegative(invoice.gross);
  const payment = nonnegative(grossPayment);
  const prior = nonnegative(previouslySettledGross);
  if (net + vat !== gross || prior + payment > gross)
    throw new Error("Məbləğ hesablaşma qalığına uyğun deyil.");
  if (!gross) return amounts(0n, 0n);
  const cumulativeVat = (settled: bigint) =>
    (settled * vat + gross / 2n) / gross;
  const paymentVat = cumulativeVat(prior + payment) - cumulativeVat(prior);
  return amounts(payment - paymentVat, paymentVat);
}
