import { describe, expect, it } from "vitest";
import {
  parseLocalizedDecimal,
  multiplyMoney,
  formatMoneyAZN,
  formatQuantity,
} from "@/lib/decimal";
import { moneySchema, quantitySchema } from "@/lib/workshop-validation";
import { parseIntakeDate, formatIntakeDate } from "@/lib/intake-date";

describe("localized exact financial inputs", () => {
  it.each(["100,50", "100.50", "100.5", "100,5"])(
    "normalizes %s identically",
    (input) => expect(moneySchema.parse(input)).toBe("100.50"),
  );
  it.each([
    "1 300,75",
    "1 300.75",
    "1,300.75",
    "1.300,75",
    "  1\u00a0300,75  ",
  ])("accepts grouping %s", (input) =>
    expect(parseLocalizedDecimal(input)).toBe("1300.75"),
  );
  it.each([
    "1e2",
    "NaN",
    "12,345",
    "1,2,3",
    "1 30,25",
    "100,",
    "",
    "--1",
    "1.2.3",
    "1,234 567.89",
  ])("rejects malformed money %s", (input) =>
    expect(() => moneySchema.parse(input)).toThrow(),
  );
  it("rejects negative money and excess quantity precision", () => {
    expect(() => moneySchema.parse("-0.01")).toThrow();
    expect(() => quantitySchema.parse("0")).toThrow();
    expect(() => quantitySchema.parse("2.5001")).toThrow();
    expect(quantitySchema.parse("2,5")).toBe("2.500");
  });
  it("multiplies and rounds once using integer minor units", () => {
    expect(multiplyMoney("2.5", "100,40")).toBe("251.00");
    expect(multiplyMoney("0.75", "0.02")).toBe("0.02");
    expect(multiplyMoney("1", "1300.75")).toBe("1300.75");
    expect(() => multiplyMoney("-1", "-100")).toThrow();
    expect(() => multiplyMoney("100000", "9999999999.99")).toThrow();
  });
  it("formats money and quantities without float artifacts", () => {
    expect(formatMoneyAZN(520.4999999998)).toBe("520,50 ₼");
    expect(formatMoneyAZN("1250.50")).toBe("1 250,50 ₼");
    expect(formatQuantity("1000")).toBe("1000");
    expect(formatQuantity("4.500")).toBe("4,5");
  });
});
describe("keyboard and paste intake dates", () => {
  it.each(["09/23/2026", "09-23-2026", "2026-09-23"])(
    "persists %s as ISO",
    (input) => {
      expect(parseIntakeDate(input)).toBe("2026-09-23");
      expect(formatIntakeDate(parseIntakeDate(input))).toBe("09/23/2026");
    },
  );
  it.each(["23/09/2026", "02/29/2025", "04/31/2026", "nonsense"])(
    "rejects invalid date %s",
    (input) => expect(() => parseIntakeDate(input)).toThrow(),
  );
});
