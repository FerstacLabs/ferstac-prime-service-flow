import { describe, expect, it } from "vitest";
import {
  actionFailure,
  databaseActionError,
  duplicatePartFailure,
  visibleActionError,
} from "@/lib/action-errors";

describe("mutation error boundary", () => {
  it("keeps actionable domain validation and hides technical details", () => {
    expect(
      databaseActionError({ code: "P0001", message: duplicatePartFailure }),
    ).toBe(duplicatePartFailure);
    expect(
      databaseActionError({
        code: "23505",
        message: "duplicate key constraint private_table",
      }),
    ).not.toContain("private_table");
    expect(
      databaseActionError({ code: "XX000", message: "private error" }),
    ).toBe(actionFailure);
    for (const message of [
      "Minified React error #441; ə",
      "Səhv: 7ae4b1e8-951f-4f2d-8519-a4c5ba841b96",
      "constraint pozuldu",
      "https://private.test xəta",
      { message: "raw" },
    ]) {
      expect(visibleActionError(message)).toBe(actionFailure);
    }
  });
});
