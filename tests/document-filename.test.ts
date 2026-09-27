// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  documentFilename,
  documentDisposition,
} from "@/lib/reports/document-filename";
import type { PrimeReport } from "@/lib/reports/report-types";
const report: PrimeReport = {
  scope: "quotation",
  title: "Qiymət təklifi",
  generatedAt: "",
  summary: [],
  sections: [],
  documentContext: ["99-BZ-312"],
};
const now = new Date("2026-09-27T10:30:15Z");
describe("professional document filenames", () => {
  it("uses actual plate and Baku timestamp", () =>
    expect(documentFilename(report, now, "12345678")).toBe(
      "PRIME_Qiymet-teklifi_99-BZ-312_2026-09-27_143015_12345678.pdf",
    ));
  it("distinguishes report types and vehicles", () => {
    const filename = documentFilename(report, now, "same");
    expect(
      documentFilename({ ...report, title: "Satınalma" }, now, "same"),
    ).not.toBe(filename);
    expect(
      documentFilename(
        { ...report, documentContext: ["77-AH-118"] },
        now,
        "same",
      ),
    ).not.toBe(filename);
  });
  it("preserves supplier and selected period", () =>
    expect(
      documentFilename(
        {
          ...report,
          title: "Təchizatçı",
          documentContext: ["Premium Auto Parts", "2026-09-01", "2026-09-27"],
        },
        now,
        "test",
      ),
    ).toContain("Techizatci_Premium-Auto-Parts_2026-09-01_2026-09-27"));
  it("is unique even within one second", () =>
    expect(documentFilename(report, now)).not.toBe(
      documentFilename(report, now),
    ));
  it("sanitizes unsafe characters, UUIDs and bounds length", () => {
    const name = documentFilename(
      {
        ...report,
        documentContext: [
          'a/b\\c:*?"<>|',
          "12345678-1234-1234-1234-123456789abc",
          "Ə Ş Ç İ ı Ü Ö Ğ".repeat(50),
        ],
      },
      now,
      "safe",
    );
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    expect(name).not.toContain("123456789abc");
    expect(name.length).toBeLessThanOrEqual(180);
    expect(name).toMatch(/_143015_safe\.pdf$/);
  });
  it("sets an attachment disposition with both safe filename parameters", () =>
    expect(documentDisposition(report)).toMatch(
      /^attachment; filename="PRIME_.*\.pdf"; filename\*=UTF-8''PRIME_/,
    ));
});
