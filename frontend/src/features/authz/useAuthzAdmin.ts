import { useMutation, useQuery, useQueryClient, type QueryFilters } from "@tanstack/react-query";
import {
  createAuthzActor,
  getCurrentAuthzActor,
  grantAuthzActorRole,
  listAuthzActors,
  listTenantAuthzActors,
  listTenantRoleActors,
  grantTenantOperatorRole,
  revokeTenantOperatorRoleGrant,
  listAuthzAuditLogs,
  listAuthzPermissions,
  listAuthzRoles,
  revokeAuthzActorRoleGrant,
  setAuthzActorActive,
} from "../../api/authz.api";
import type {
  AuthzActor,
  AuthzActorRoleGrant,
  AuthzAdminRequestActor,
  AuthzAuditLogFilters,
  CreateAuthzActorInput,
  GrantAuthzActorRoleInput,
  GrantTenantOperatorRoleInput,
} from "../../types/authz";

function enabled(actor: AuthzAdminRequestActor) {
  return Boolean(actor.actorId.trim() && actor.tenantId.trim());
}

function authzQueryKey(actor: AuthzAdminRequestActor) {
  return ["authz-admin", actor.actorId, actor.tenantId] as const;
}

export function useCurrentAuthzActor(actor: AuthzAdminRequestActor) {
  return useQuery({
    queryKey: [...authzQueryKey(actor), "current-actor"],
    queryFn: () => getCurrentAuthzActor(actor),
    enabled: enabled(actor),
  });
}

export function useAuthzRoles(actor: AuthzAdminRequestActor) {
  return useQuery({
    queryKey: [...authzQueryKey(actor), "roles"],
    queryFn: () => listAuthzRoles(actor),
    enabled: enabled(actor),
    // Roles are application-global control-plane data. Changing the selected
    // tenant only changes the context used to validate the request and the
    // target of a tenant grant; it must not blank the catalog while the new
    // query key revalidates.
    placeholderData: (previousData) => previousData,
  });
}

export function useAuthzPermissions(actor: AuthzAdminRequestActor) {
  return useQuery({
    queryKey: [...authzQueryKey(actor), "permissions"],
    queryFn: () => listAuthzPermissions(actor),
    enabled: enabled(actor),
    // Permissions are application-global control-plane data; keep the current
    // catalog visible while a tenant-context change is revalidated.
    placeholderData: (previousData) => previousData,
  });
}


export function useAuthzAuditLogs(
  actor: AuthzAdminRequestActor,
  filters: AuthzAuditLogFilters,
) {
  return useQuery({
    queryKey: [...authzQueryKey(actor), "audit-logs", filters],
    queryFn: () => listAuthzAuditLogs(actor, filters),
    enabled: enabled(actor),
  });
}

export function useAuthzActors(actor: AuthzAdminRequestActor) {
  return useQuery({
    queryKey: [...authzQueryKey(actor), "actors"],
    queryFn: () => listAuthzActors(actor),
    enabled: enabled(actor),
    // /authz/actors is the application-global Actor catalog. Preserve it
    // during tenant selection changes so Actor cards stay mounted while the
    // request is revalidated with the new X-Tenant-ID context.
    placeholderData: (previousData) => previousData,
  });
}

export function useTenantAuthzActors(actor: AuthzAdminRequestActor) {
  return useQuery({
    queryKey: [...authzQueryKey(actor), "tenant-actors"],
    queryFn: () => listTenantAuthzActors(actor),
    enabled: enabled(actor),
  });
}

export function useCreateAuthzActor(actor: AuthzAdminRequestActor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAuthzActorInput) => createAuthzActor(actor, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...authzQueryKey(actor), "actors"] });
    },
  });
}

export function useSetAuthzActorActive(actor: AuthzAdminRequestActor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetActorId, active }: { targetActorId: string; active: boolean }) =>
      setAuthzActorActive(actor, targetActorId, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...authzQueryKey(actor), "actors"] });
      queryClient.invalidateQueries({ queryKey: [...authzQueryKey(actor), "current-actor"] });
    },
  });
}

export function useGrantAuthzActorRole(actor: AuthzAdminRequestActor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      targetActorId,
      input,
    }: {
      targetActorId: string;
      input: GrantAuthzActorRoleInput;
    }) => grantAuthzActorRole(actor, targetActorId, input),
    onMutate: async () => {
      const filter = actorCatalogFilter(actor.actorId);
      const seedActors = firstCachedActorCatalog(queryClient.getQueriesData<AuthzActor[]>(filter));

      // A tenant-context change can leave /authz/actors in flight while the
      // administrator submits a grant. Cancel those older reads before the
      // write so a pre-grant response cannot overwrite the successful grant.
      await queryClient.cancelQueries(filter);
      return { seedActors };
    },
    onSuccess: async (grant, { targetActorId }, context) => {
      const filter = actorCatalogFilter(actor.actorId);
      const actorsKey = [...authzQueryKey(actor), "actors"] as const;

      // Keep every cached application Actor catalog coherent. The current
      // tenant key can contain only React Query placeholder data, which is not
      // written to the cache; seed that key from another cached catalog when
      // necessary before applying the authoritative POST response.
      queryClient.setQueriesData<AuthzActor[]>(filter, (current) =>
        upsertActorRoleGrant(current, targetActorId, grant),
      );
      queryClient.setQueryData<AuthzActor[]>(actorsKey, (current) =>
        upsertActorRoleGrant(current ?? context?.seedActors, targetActorId, grant),
      );

      // The canceled stale read can no longer win. Revalidate after the write
      // so the visible nested Role Grant card comes from persisted server data.
      await queryClient.invalidateQueries({ ...filter, refetchType: "active" });
    },
  });
}

function upsertActorRoleGrant(
  actors: AuthzActor[] | undefined,
  targetActorId: string,
  grant: AuthzActorRoleGrant,
): AuthzActor[] | undefined {
  if (!actors) return actors;

  return actors.map((actor) => {
    if (actor.id !== targetActorId) return actor;

    const roleGrants = (actor.roleGrants ?? []).filter(
      (existing) =>
        existing.id !== grant.id &&
        !(existing.roleCode === grant.roleCode && existing.tenantId === grant.tenantId),
    );
    return { ...actor, roleGrants: [...roleGrants, grant] };
  });
}

function actorCatalogFilter(actorId: string): QueryFilters {
  return {
    predicate: (query) => isActorCatalogQuery(query.queryKey, actorId),
  };
}

function firstCachedActorCatalog(
  entries: Array<[readonly unknown[], AuthzActor[] | undefined]>,
): AuthzActor[] | undefined {
  return entries.find(([, data]) => Array.isArray(data))?.[1];
}

function isActorCatalogQuery(queryKey: readonly unknown[], actorId: string): boolean {
  return (
    queryKey[0] === "authz-admin" &&
    queryKey[1] === actorId &&
    queryKey[3] === "actors"
  );
}

export function useRevokeAuthzActorRoleGrant(actor: AuthzAdminRequestActor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetActorId, grantId }: { targetActorId: string; grantId: string }) =>
      revokeAuthzActorRoleGrant(actor, targetActorId, grantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...authzQueryKey(actor), "actors"] });
    },
  });
}

export function useTenantRoleActors(actor: AuthzAdminRequestActor) {
  return useQuery({
    queryKey: [...authzQueryKey(actor), "tenant-role-actors"],
    queryFn: () => listTenantRoleActors(actor),
    enabled: enabled(actor),
  });
}

export function useGrantTenantOperatorRole(actor: AuthzAdminRequestActor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetActorId, input }: { targetActorId: string; input: GrantTenantOperatorRoleInput }) =>
      grantTenantOperatorRole(actor, targetActorId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...authzQueryKey(actor), "tenant-role-actors"] });
    },
  });
}

export function useRevokeTenantOperatorRoleGrant(actor: AuthzAdminRequestActor) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetActorId, grantId }: { targetActorId: string; grantId: string }) =>
      revokeTenantOperatorRoleGrant(actor, targetActorId, grantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...authzQueryKey(actor), "tenant-role-actors"] });
    },
  });
}
