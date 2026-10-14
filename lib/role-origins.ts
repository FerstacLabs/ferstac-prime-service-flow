import type { AppRole } from "@/lib/security";

const roleOriginEnv: Record<AppRole, string> = {
  ADMIN: "PRIME_ADMIN_ORIGIN",
  CASHIER: "PRIME_CASHIER_ORIGIN",
  INTAKE: "PRIME_INTAKE_ORIGIN",
};

type EnvLike = Readonly<Record<string, string | undefined>>;

function rawRoleOrigin(
  role: AppRole,
  env: EnvLike = process.env,
) {
  return env[roleOriginEnv[role]]?.trim() || null;
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;

  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

export function configuredRoleOrigin(
  role: AppRole,
  env: EnvLike = process.env,
) {
  return normalizeOrigin(rawRoleOrigin(role, env));
}

export function roleOriginConfigIsValid(
  role: AppRole,
  env: EnvLike = process.env,
) {
  const raw = rawRoleOrigin(role, env);
  return !raw || configuredRoleOrigin(role, env) !== null;
}

export function roleOriginMatches(
  role: AppRole,
  requestOrigin: string,
  env: EnvLike = process.env,
) {
  const raw = rawRoleOrigin(role, env);

  // Domain routing is optional until production hostnames are configured.
  if (!raw) return true;

  const configured = configuredRoleOrigin(role, env);
  const current = normalizeOrigin(requestOrigin);

  if (!configured || !current) return false;

  // Hostname + port define the portal. Scheme is terminated by Nginx/Cloudflare.
  return new URL(configured).host === new URL(current).host;
}

export function roleLoginUrl(
  role: AppRole,
  env: EnvLike = process.env,
) {
  const origin = configuredRoleOrigin(role, env);
  return origin ? `${origin}/login` : "/login";
}
