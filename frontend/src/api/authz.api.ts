import { apiFetch } from "./client";
import type {
  AuthzActor,
  AuthzActorRoleGrant,
  AuthzAdminRequestActor,
  AuthzPermission,
  AuthzRole,
  CreateAuthzActorInput,
  GrantAuthzActorRoleInput,
} from "../types/authz";

function authzHeaders(actor: AuthzAdminRequestActor) {
  return {
    "X-Actor-ID": actor.actorId,
    "X-Tenant-ID": actor.tenantId,
  };
}

export function listAuthzRoles(actor: AuthzAdminRequestActor): Promise<AuthzRole[]> {
  return apiFetch<AuthzRole[]>("/authz/roles", {
    headers: authzHeaders(actor),
  });
}

export function listAuthzPermissions(actor: AuthzAdminRequestActor): Promise<AuthzPermission[]> {
  return apiFetch<AuthzPermission[]>("/authz/permissions", {
    headers: authzHeaders(actor),
  });
}

export function listAuthzActors(actor: AuthzAdminRequestActor): Promise<AuthzActor[]> {
  return apiFetch<AuthzActor[]>("/authz/actors", {
    headers: authzHeaders(actor),
  });
}

export function createAuthzActor(
  actor: AuthzAdminRequestActor,
  input: CreateAuthzActorInput,
): Promise<AuthzActor> {
  return apiFetch<AuthzActor>("/authz/actors", {
    method: "POST",
    headers: authzHeaders(actor),
    body: JSON.stringify(input),
  });
}

export function grantAuthzActorRole(
  actor: AuthzAdminRequestActor,
  targetActorId: string,
  input: GrantAuthzActorRoleInput,
): Promise<AuthzActorRoleGrant> {
  return apiFetch<AuthzActorRoleGrant>(
    `/authz/actors/${encodeURIComponent(targetActorId)}/role-grants`,
    {
      method: "POST",
      headers: authzHeaders(actor),
      body: JSON.stringify(input),
    },
  );
}

export function revokeAuthzActorRoleGrant(
  actor: AuthzAdminRequestActor,
  targetActorId: string,
  grantId: string,
): Promise<AuthzActorRoleGrant> {
  return apiFetch<AuthzActorRoleGrant>(
    `/authz/actors/${encodeURIComponent(targetActorId)}/role-grants/${encodeURIComponent(grantId)}`,
    {
      method: "DELETE",
      headers: authzHeaders(actor),
    },
  );
}
