import { describe, expect, it } from "vitest";
import { isValidAzPlate, normalizeAzPlate } from "@/lib/plate";

describe("Azerbaijan plate helpers", () => {
  it("normalizes lowercase and spacing into the 99-AA-999 mask", () => {
    expect(normalizeAzPlate(" 10 aa 001 ")).toBe("10-AA-001");
    expect(normalizeAzPlate("99-xx-999")).toBe("99-XX-999");
  });

  it("rejects malformed plates", () => {
    expect(isValidAzPlate("1-AA-001")).toBe(false);
    expect(isValidAzPlate("10-A1-001")).toBe(false);
    expect(isValidAzPlate("10-AA-001")).toBe(true);
  });
});
