// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  configuredRoleOrigin,
  roleLoginUrl,
  roleOriginConfigIsValid,
  roleOriginMatches,
} from "@/lib/role-origins";

const env = {
  PRIME_ADMIN_ORIGIN: "https://admin.primetuning.ferstaclabs.com",
  PRIME_CASHIER_ORIGIN: "https://kassa.primetuning.ferstaclabs.com/",
  PRIME_INTAKE_ORIGIN: "https://qeydiyyat.primetuning.ferstaclabs.com",
};

describe("role origins", () => {
  it("maps every PRIME role to its configured origin", () => {
    expect(configuredRoleOrigin("ADMIN", env)).toBe(
      "https://admin.primetuning.ferstaclabs.com",
    );
    expect(configuredRoleOrigin("CASHIER", env)).toBe(
      "https://kassa.primetuning.ferstaclabs.com",
    );
    expect(configuredRoleOrigin("INTAKE", env)).toBe(
      "https://qeydiyyat.primetuning.ferstaclabs.com",
    );
  });

  it("accepts only the hostname configured for that role", () => {
    expect(
      roleOriginMatches(
        "ADMIN",
        "https://admin.primetuning.ferstaclabs.com",
        env,
      ),
    ).toBe(true);

    expect(
      roleOriginMatches(
        "ADMIN",
        "https://kassa.primetuning.ferstaclabs.com",
        env,
      ),
    ).toBe(false);
  });

  it("builds the correct cross-host login URL", () => {
    expect(roleLoginUrl("INTAKE", env)).toBe(
      "https://qeydiyyat.primetuning.ferstaclabs.com/login",
    );
  });

  it("does not enforce host routing before origins are configured", () => {
    expect(roleOriginMatches("ADMIN", "http://127.0.0.1:3001", {})).toBe(true);
    expect(roleLoginUrl("ADMIN", {})).toBe("/login");
  });

  it("fails closed for malformed configured origins", () => {
    const malformed = {
      PRIME_ADMIN_ORIGIN: "not-a-url",
    };

    expect(configuredRoleOrigin("ADMIN", malformed)).toBeNull();
    expect(roleOriginConfigIsValid("ADMIN", malformed)).toBe(false);
    expect(roleOriginMatches("ADMIN", "https://example.com", malformed)).toBe(
      false,
    );
  });
});
