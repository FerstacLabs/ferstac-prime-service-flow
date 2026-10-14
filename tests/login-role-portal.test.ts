// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  host: "kassa.primetuning.ferstaclabs.com",
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getUserById: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: state.host,
      "x-forwarded-host": state.host,
    }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signInWithPassword: state.signInWithPassword,
      signOut: state.signOut,
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              auth_user_id: "10000000-0000-4000-8000-000000000001",
              role: "ADMIN",
              is_active: true,
              must_change_password: false,
            },
          }),
        }),
      }),
    }),
    auth: {
      admin: {
        getUserById: state.getUserById,
      },
    },
    rpc: state.rpc,
  }),
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentAccess: vi.fn(),
  requireAccess: vi.fn(),
}));

import { signInAction } from "@/app/actions/auth";

beforeEach(() => {
  vi.clearAllMocks();

  state.host = "kassa.primetuning.ferstaclabs.com";

  process.env.PRIME_ADMIN_ORIGIN =
    "https://admin.primetuning.ferstaclabs.com";
  process.env.PRIME_CASHIER_ORIGIN =
    "https://kassa.primetuning.ferstaclabs.com";
  process.env.PRIME_INTAKE_ORIGIN =
    "https://qeydiyyat.primetuning.ferstaclabs.com";

  state.getUserById.mockResolvedValue({
    data: {
      user: {
        id: "10000000-0000-4000-8000-000000000001",
        email: "admin@example.invalid",
      },
    },
  });

  state.signInWithPassword.mockResolvedValue({
    data: {
      user: {
        id: "10000000-0000-4000-8000-000000000001",
      },
    },
    error: null,
  });

  state.signOut.mockResolvedValue({ error: null });
  state.rpc.mockResolvedValue({ error: null });
});

describe("role-specific login portal", () => {
  it("verifies credentials but rejects ADMIN on the CASHIER portal without recording login success", async () => {
    const form = new FormData();
    form.set("username", "admin");
    form.set("password", "CorrectPassword123");

    await expect(signInAction(form)).rejects.toThrow(
      "REDIRECT:/login?error=",
    );

    expect(state.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(state.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("allows ADMIN on the ADMIN portal to continue to the normal role home", async () => {
    state.host = "admin.primetuning.ferstaclabs.com";

    const form = new FormData();
    form.set("username", "admin");
    form.set("password", "CorrectPassword123");

    await expect(signInAction(form)).rejects.toThrow(
      "REDIRECT:/overview",
    );

    expect(state.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(state.signOut).not.toHaveBeenCalled();
    expect(state.rpc).toHaveBeenCalledWith("record_security_event", {
      p_actor: "10000000-0000-4000-8000-000000000001",
      p_event: "LOGIN_SUCCESS",
    });
  });
});
