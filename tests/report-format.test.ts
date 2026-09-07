import { describe, expect, it } from "vitest";
import {
  formatReportDate,
  formatReportDateTime,
  formatReportMoney,
  formatReportQuantity,
  reportFundingLabels,
  reportJobStatusLabels,
  reportPaymentLabels,
  reportPurchaseSourceLabels,
  reportWorkStatusLabels
} from "@/lib/reports/report-format";

describe("report formatting", () => {
  it("formats money without relying on the manat glyph", () => {
    expect(formatReportMoney(5000)).toBe("5 000,00 AZN");
    expect(formatReportMoney(1500.5)).toBe("1 500,50 AZN");
    expect(formatReportMoney(0)).toBe("0,00 AZN");
  });

  it("formats dates and quantities consistently", () => {
    expect(formatReportDate("2026-09-07")).toBe("07.09.2026");
    expect(formatReportDateTime(new Date("2026-09-07T17:04:00"))).toContain("17:04");
    expect(formatReportQuantity(1)).toBe("1");
    expect(formatReportQuantity(1.5)).toBe("1,5");
  });

  it("localizes database enums for Azerbaijani reports", () => {
    expect(reportWorkStatusLabels.IN_PROGRESS).toBe("İcra olunur");
    expect(reportJobStatusLabels.WAITING_PARTS).toBe("Detal gözləyir");
    expect(reportFundingLabels.INSURANCE_CLAIM).toBe("Sığorta hadisəsi üzrə");
    expect(reportPaymentLabels.UNPAID).toBe("Ödənilməyib");
    expect(reportPurchaseSourceLabels.SUPPLIER).toBe("Təchizatçı");
  });
});
