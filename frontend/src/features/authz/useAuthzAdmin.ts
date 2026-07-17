import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAuthzActor,
  getCurrentAuthzActor,
  grantAuthzActorRole,
  listAuthzActors,
  listAuthzAuditLogs,
  listAuthzPermissions,
  listAuthzRoles,
  revokeAuthzActorRoleGrant,
  setAuthzActorActive,
} from "../../api/authz.api";
import type {
  AuthzAdminRequestActor,
  AuthzAuditLogFilters,
  CreateAuthzActorInput,
  GrantAuthzActorRoleInput,
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
  });
}

export function useAuthzPermissions(actor: AuthzAdminRequestActor) {
  return useQuery({
    queryKey: [...authzQueryKey(actor), "permissions"],
    queryFn: () => listAuthzPermissions(actor),
    enabled: enabled(actor),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...authzQueryKey(actor), "actors"] });
    },
  });
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
