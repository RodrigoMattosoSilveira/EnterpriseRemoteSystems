import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    onSuccess: (grant, { targetActorId }) => {
      const actorsKey = [...authzQueryKey(actor), "actors"] as const;
      queryClient.setQueryData<AuthzActor[]>(actorsKey, (current) =>
        upsertActorRoleGrant(current, targetActorId, grant),
      );
      queryClient.invalidateQueries({
        predicate: (query) => isActorCatalogQuery(query.queryKey, actor.actorId),
      });
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
