import { UserRole } from "../../types/domain";

const demoAuthTokens: Record<UserRole, string> = {
  guest: "guest-demo-token",
  clinician: "clinician-demo-token",
  admin: "admin-demo-token",
};

export function getDemoAuthToken(role: UserRole): string {
  return demoAuthTokens[role];
}

export function getAuthorizationHeader(role: UserRole): Record<string, string> {
  return {
    Authorization: `Bearer ${getDemoAuthToken(role)}`,
  };
}
