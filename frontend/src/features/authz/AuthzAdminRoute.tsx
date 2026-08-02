import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";
import { shouldRetryQuery } from "../../app/queryRetryPolicy";
import type { AuthzCurrentActor } from "../../types/authz";
import { AuthzAdminPage } from "./AuthzAdminPage";
import { canAccessAuthzAdministration } from "./authzAdminRouteAccess";

export const authzAdminCurrentActorQueryKey = [
  "authz-admin-route",
  "current-actor",
] as const;

export function AuthzAdminRoute() {
  const currentActorQuery = useQuery({
    queryKey: authzAdminCurrentActorQueryKey,
    queryFn: () => apiFetch<AuthzCurrentActor>("/authz/current-actor"),
    gcTime: 0,
    refetchOnMount: "always",
    retry: shouldRetryQuery,
  });

  if (currentActorQuery.error) {
    throw currentActorQuery.error;
  }

  // A cached actor belongs to an earlier authorization evaluation and must not
  // mount protected child queries while the current session is being checked.
  if (currentActorQuery.isPending || currentActorQuery.isFetching) {
    return (
      <main className="p-6">
        <p className="text-sm text-gray-600">Checking authorization…</p>
      </main>
    );
  }

  if (!canAccessAuthzAdministration(currentActorQuery.data)) {
    throw new Response("Forbidden", {
      status: 403,
      statusText: "Forbidden",
    });
  }

  return <AuthzAdminPage />;
}
