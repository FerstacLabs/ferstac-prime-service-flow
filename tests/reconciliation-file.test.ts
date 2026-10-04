// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validateSignedPdf, signedPdfLimit } from "@/lib/reconciliation";
import { canAccessPath } from "@/lib/security";
describe("signed reconciliation file boundary", () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\nexample\n%%EOF\n");
  it("accepts a bounded PDF header/trailer and MIME", () =>
    expect(() => validateSignedPdf(bytes, "application/pdf")).not.toThrow());
  it("rejects spoofed MIME, non-PDF bytes and missing trailer", () => {
    expect(() => validateSignedPdf(bytes, "image/png")).toThrow();
    expect(() =>
      validateSignedPdf(
        new TextEncoder().encode("<html>fake</html>"),
        "application/pdf",
      ),
    ).toThrow();
    expect(() =>
      validateSignedPdf(bytes.subarray(0, 8), "application/pdf"),
    ).toThrow();
  });
  it("rejects empty and oversized uploads", () => {
    expect(() =>
      validateSignedPdf(new Uint8Array(), "application/pdf"),
    ).toThrow();
    expect(() =>
      validateSignedPdf(new Uint8Array(signedPdfLimit + 1), "application/pdf"),
    ).toThrow();
  });
  it("permits finance roles but denies intake for every archive route", () => {
    for (const path of [
      "/kassa/reconciliations/id",
      "/api/reconciliations/id/signed",
      "/api/reconciliations/id/pdf",
      "/reconciliations/id/print",
    ]) {
      expect(canAccessPath("ADMIN", path)).toBe(true);
      expect(canAccessPath("CASHIER", path)).toBe(true);
      expect(canAccessPath("INTAKE", path)).toBe(false);
    }
  });
});
