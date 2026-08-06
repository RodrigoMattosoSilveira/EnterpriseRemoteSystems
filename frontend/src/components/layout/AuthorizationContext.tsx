import { createContext, useContext } from "react";
import type { AuthzCurrentActor } from "../../types/authz";

const AuthorizationContext = createContext<AuthzCurrentActor | null>(null);
export const AuthorizationProvider = AuthorizationContext.Provider;
export function useAuthorizationContext(): AuthzCurrentActor {
  const value = useContext(AuthorizationContext);
  if (!value) throw new Error("Authorization context is unavailable");
  return value;
}
