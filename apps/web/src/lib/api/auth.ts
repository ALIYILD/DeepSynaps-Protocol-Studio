import { UserRole } from "../../types/domain";

const demoAuthTokens: Record<UserRole, string> = {
  guest: "guest-demo-token",
  clinician: "clinician-demo-token",
  admin: "admin-demo-token",
};

export function getDemoAuthToken(role: UserRole): string {
  return demoAuthTokens[role];
}

/** Returns Authorization header — prefers real JWT from localStorage, falls back to demo token */
export function getAuthorizationHeader(role: UserRole): Record<string, string> {
  const realToken = localStorage.getItem("access_token");
  const token = realToken ?? demoAuthTokens[role];
  return { Authorization: `Bearer ${token}` };
}

export function getBearerToken(): string | null {
  return localStorage.getItem("access_token");
}
