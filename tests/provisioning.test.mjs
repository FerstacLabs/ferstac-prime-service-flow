// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  provisionPrimeUsers,
  temporaryPassword,
} from "../scripts/provision-prime-users.mjs";

function fixture() {
  const users = [{ id: "original-owner", email: "original@example.test" }];
  const members = [
    {
      auth_user_id: "original-owner",
      organization_id: "prime",
      username: "admin",
      role: "ADMIN",
      must_change_password: false,
      is_active: true,
    },
  ];
  const client = {
    from(table) {
      const filters = [];
      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          filters.push([key, value]);
          return query;
        },
        single() {
          return query.then((x) => ({ data: x.data[0], error: null }));
        },
        maybeSingle() {
          return query.single();
        },
        then(resolve) {
          return Promise.resolve(
            resolve({
              data: (table === "organizations"
                ? [{ id: "prime", slug: "prime" }]
                : members
              ).filter((row) =>
                filters.every(([key, value]) => row[key] === value),
              ),
              error: null,
            }),
          );
        },
        insert(profile) {
          members.push(profile);
          return Promise.resolve({ error: null });
        },
      };
      return query;
    },
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({ data: { users }, error: null })),
        createUser: vi.fn(async ({ email }) => {
          const user = { id: email, email };
          users.push(user);
          return { data: { user }, error: null };
        }),
        updateUserById: vi.fn(),
      },
    },
  };
  return { client, users, members };
}
describe("idempotent staff provisioning", () => {
  it("retains original admin and never resets passwords or flags on rerun", async () => {
    const { client, users, members } = fixture(),
      output = vi.fn();
    await provisionPrimeUsers(client, {}, output);
    expect(users).toHaveLength(3);
    expect(members).toHaveLength(3);
    expect(members[0].auth_user_id).toBe("original-owner");
    expect(members[0].must_change_password).toBe(false);
    expect(
      output.mock.calls.filter(([line]) =>
        line.includes("temporary password:"),
      ),
    ).toHaveLength(2);
    output.mockClear();
    await provisionPrimeUsers(client, {}, output);
    expect(users).toHaveLength(3);
    expect(client.auth.admin.createUser).toHaveBeenCalledTimes(2);
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(
      output.mock.calls.some(([line]) => line.includes("temporary password:")),
    ).toBe(false);
  });
  it("generates long independent temporary credentials", () => {
    const a = temporaryPassword(),
      b = temporaryPassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
  it("refuses conflicting roles without silent escalation", async () => {
    const { client, members } = fixture();
    members[0].role = "INTAKE";
    await expect(provisionPrimeUsers(client, {}, vi.fn())).rejects.toThrow(
      "membership conflict",
    );
    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
  });
});
