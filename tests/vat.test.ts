import { describe, expect, it } from "vitest";
import { decimalMinor, fromMinor } from "@/lib/decimal";
import { splitVatSettlement, vatPricing } from "@/lib/vat";

describe("exact VAT pricing and cumulative allocation", () => {
  it("leaves VAT-off amounts unchanged", () => {
    expect(vatPricing("1500", false)).toEqual({
      net: "1500.00",
      vat: "0.00",
      gross: "1500.00",
    });
  });
  it("uses 18 percent with half-up rounding in integer minor units", () => {
    expect(vatPricing("1500", true)).toEqual({
      net: "1500.00",
      vat: "270.00",
      gross: "1770.00",
    });
    expect(vatPricing("2101.25", true)).toEqual({
      net: "2101.25",
      vat: "378.23",
      gross: "2479.48",
    });
    expect(vatPricing("200", true)).toEqual({
      net: "200.00",
      vat: "36.00",
      gross: "236.00",
    });
  });
  it("splits gross 118 into operating 100 and VAT 18 without double counting", () => {
    expect(splitVatSettlement(vatPricing("100", true), "118")).toEqual({
      net: "100.00",
      vat: "18.00",
      gross: "118.00",
    });
    expect(splitVatSettlement(vatPricing("100", true), "59")).toEqual({
      net: "50.00",
      vat: "9.00",
      gross: "59.00",
    });
  });
  it("reconciles every cent over many tiny partial payments", () => {
    const invoice = vatPricing("1.01", true);
    let vat = 0n,
      net = 0n;
    for (let prior = 0n; prior < decimalMinor(invoice.gross); prior++) {
      const split = splitVatSettlement(invoice, "0.01", fromMinor(prior));
      net += decimalMinor(split.net);
      vat += decimalMinor(split.vat);
      expect(decimalMinor(split.net) + decimalMinor(split.vat)).toBe(1n);
    }
    expect(fromMinor(net)).toBe(invoice.net);
    expect(fromMinor(vat)).toBe(invoice.vat);
  });
  it("retains invoice components for partial credit/refund allocation", () => {
    const original = vatPricing("100", true);
    expect(splitVatSettlement(original, "59", "59")).toEqual({
      net: "50.00",
      vat: "9.00",
      gross: "59.00",
    });
    const replacement = vatPricing("150", true);
    expect(
      fromMinor(decimalMinor(replacement.gross) - decimalMinor(original.gross)),
    ).toBe("59.00");
    expect(
      fromMinor(decimalMinor(replacement.vat) - decimalMinor(original.vat)),
    ).toBe("9.00");
  });
  it("keeps VAT out of the net margin basis", () => {
    expect(
      fromMinor(
        decimalMinor(vatPricing("1000", true).net) -
          decimalMinor(vatPricing("500", true).net),
      ),
    ).toBe("500.00");
  });
  it("rejects overpayments, negative inputs and inconsistent invoice snapshots", () => {
    expect(() =>
      splitVatSettlement(vatPricing("100", true), "59.01", "59"),
    ).toThrow();
    expect(() => vatPricing("-0.01", true)).toThrow();
    expect(() =>
      splitVatSettlement({ net: "100", vat: "18", gross: "100" }, "1"),
    ).toThrow();
  });
});
