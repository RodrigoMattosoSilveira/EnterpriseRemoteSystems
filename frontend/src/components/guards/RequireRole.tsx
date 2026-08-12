import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthorizationContext } from "../layout/AuthorizationContext";

export function RequirePermission({ permission, applicationOnly = false, children }: { permission: string; applicationOnly?: boolean; children: ReactNode }) {
  const actor = useAuthorizationContext();
  const permitted = actor.permissions.includes("*") || actor.permissions.includes(permission);
  if (!permitted || (applicationOnly && actor.scope !== "APPLICATION")) {
    return <Navigate to="/forbidden" replace />;
  }
  return children;
}
