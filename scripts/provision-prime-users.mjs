import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const profiles = [
  {
    username: "admin",
    role: "ADMIN",
    display_name: "Administrator",
    env: "PRIME_ADMIN_INITIAL_PASSWORD",
  },
  {
    username: "kassa",
    role: "CASHIER",
    display_name: "Kassir",
    env: "PRIME_CASHIER_INITIAL_PASSWORD",
  },
  {
    username: "qeydiyyat",
    role: "INTAKE",
    display_name: "İlkin qeydiyyat",
    env: "PRIME_INTAKE_INITIAL_PASSWORD",
  },
];
export const temporaryPassword = () =>
  `P9a!${randomBytes(24).toString("base64url")}`;
const check = (result) => {
  if (result.error)
    throw new Error(
      "Provisioning operation failed; inspect the Supabase dashboard without exposing credentials.",
    );
  return result.data;
};

export async function provisionPrimeUsers(
  client,
  env = process.env,
  output = console.log,
) {
  const org = check(
    await client
      .from("organizations")
      .select("id")
      .eq("slug", "prime")
      .single(),
  );
  if (!org) throw new Error("Apply migration 0004 first.");
  const existing =
    check(
      await client
        .from("user_profiles")
        .select("*")
        .eq("organization_id", org.id),
    ) ?? [];
  const users = [];
  for (let page = 1; ; page++) {
    const data = check(
      await client.auth.admin.listUsers({ page, perPage: 200 }),
    );
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  for (const profile of profiles) {
    const member = existing.find((p) => p.username === profile.username);
    if (member) {
      if (
        member.role !== profile.role ||
        !users.some((u) => u.id === member.auth_user_id)
      )
        throw new Error(
          `Review membership conflict for ${profile.username}; no password was reset.`,
        );
      output(
        `${profile.username}: existing account retained; password, activity and first-login state unchanged.`,
      );
      continue;
    }
    const email = `${profile.username}@primeflow.local`;
    let user = users.find((u) => u.email?.toLowerCase() === email);
    if (profile.role === "ADMIN" && env.PRIME_ADMIN_AUTH_USER_ID) {
      user = users.find((u) => u.id === env.PRIME_ADMIN_AUTH_USER_ID);
      if (!user) throw new Error("PRIME_ADMIN_AUTH_USER_ID was not found.");
    } else if (profile.role === "ADMIN" && !user && users.length) {
      throw new Error(
        "Existing Auth users found. Set PRIME_ADMIN_AUTH_USER_ID to the reviewed original administrator; do not create a replacement owner.",
      );
    }
    let password;
    if (!user) {
      password = env[profile.env] || temporaryPassword();
      if (
        password.length < 12 ||
        password.length > 128 ||
        !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) ||
        !/[0-9]/.test(password)
      )
        throw new Error(
          `${profile.env}: use 12-128 characters with uppercase, lowercase and a digit.`,
        );
      user = check(
        await client.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        }),
      ).user;
      users.push(user);
      // Print immediately, once. If membership creation fails, the operator can recover this Auth user.
      output(`${profile.username}: temporary password: ${password}`);
    }
    const collision = check(
      await client
        .from("user_profiles")
        .select("auth_user_id")
        .eq("auth_user_id", user.id)
        .maybeSingle(),
    );
    if (collision)
      throw new Error(
        `Existing membership for ${profile.username}; review manually.`,
      );
    check(
      await client
        .from("user_profiles")
        .insert({
          auth_user_id: user.id,
          organization_id: org.id,
          username: profile.username,
          display_name: profile.display_name,
          role: profile.role,
          is_active: true,
          must_change_password: true,
        }),
    );
    if (!password)
      output(
        `${profile.username}: existing Auth identity linked; existing password retained; change required at next login.`,
      );
  }
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the operator environment.",
    );
  if (
    !url.startsWith("https://") &&
    !/^http:\/\/(localhost|127\.0\.0\.1):/.test(url)
  )
    throw new Error("Use HTTPS for remote provisioning.");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await provisionPrimeUsers(client);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
