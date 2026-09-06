import { createContext, useContext } from "react";
import type { AuthzCurrentActor } from "../../types/authz";

export type AuthorizationContextValue = AuthzCurrentActor & {
  selectedTenantName?: string;
  selectedTenantCode?: string;
};

const AuthorizationContext =
  createContext<AuthorizationContextValue | null>(null);
export const AuthorizationProvider = AuthorizationContext.Provider;
export function useAuthorizationContext(): AuthorizationContextValue {
  const value = useContext(AuthorizationContext);
  if (!value) throw new Error("Authorization context is unavailable");
  return value;
}

export function useOptionalAuthorizationContext():
  | AuthorizationContextValue
  | null {
  return useContext(AuthorizationContext);
}
