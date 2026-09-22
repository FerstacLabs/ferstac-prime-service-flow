export const appRoles = ["ADMIN", "CASHIER", "INTAKE"] as const;
export type AppRole = (typeof appRoles)[number];
export type AccessProfile = {
  auth_user_id: string;
  organization_id: string;
  username: string;
  display_name: string;
  role: AppRole;
  is_active: boolean;
  must_change_password: boolean;
  session_valid: boolean;
  last_login_at: string | null;
};
export const roleHome = (role: AppRole) =>
  role === "CASHIER" ? "/kassa" : role === "INTAKE" ? "/vehicles" : "/overview";
export const normalizeUsername = (value: string) => value.trim().toLowerCase();
export const canReport = (role: AppRole, scope: string) =>
  role === "ADMIN" ||
  (role === "CASHIER"
    ? ["kassa", "workers"].includes(scope)
    : scope === "quotation");
export function canAccessPath(role: AppRole, path: string) {
  if (path === "/change-password") return true;
  const report = /^\/(?:api\/)?reports\/([^/]+)\//.exec(path);
  if (report) return canReport(role, report[1]);
  if (role === "ADMIN") return true;
  const home = roleHome(role);
  return path === home || (role === "INTAKE" && path.startsWith(`${home}/`));
}
export const validPassword = (password: string) =>
  password.length >= 12 &&
  password.length <= 128 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /[0-9]/.test(password);
export const invalidLogin = "İstifadəçi adı və ya şifrə yanlışdır.";
export const disabledAccount =
  "Hesab deaktiv edilib. Administratorla əlaqə saxlayın.";
