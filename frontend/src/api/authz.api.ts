import { apiFetch } from "./client";
import type {
  AuthzActor,
  AuthzActorRoleGrant,
  AuthzCurrentActor,
  AuthzAdminRequestActor,
  AuthzAuditLog,
  AuthzAuditLogFilters,
  AuthzPermission,
  AuthzRole,
  CreateAuthzActorInput,
  GrantAuthzActorRoleInput,
  SetAuthzActorActiveInput,
} from "../types/authz";

function authzHeaders(actor: AuthzAdminRequestActor) {
  return {
    "X-Tenant-ID": actor.tenantId,
  };
}

export function getCurrentAuthzActor(actor: AuthzAdminRequestActor): Promise<AuthzCurrentActor> {
  return apiFetch<unknown>("/authz/current-actor", {
    headers: authzHeaders(actor),
  }).then(normalizeAuthzCurrentActor);
}

export function normalizeAuthzCurrentActor(input: unknown): AuthzCurrentActor {
  const actor = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    actorKey: stringValue(actor.actorKey),
    actorRecordId: stringValue(actor.actorRecordId),
    tenantId: stringValue(actor.tenantId),
    scope: stringValue(actor.scope),
    personId: optionalStringValue(actor.personId),
    globalPersonId: optionalStringValue(actor.globalPersonId),
    membershipId: optionalStringValue(actor.membershipId),
    collaboratorId: optionalStringValue(actor.collaboratorId),
    roleCodes: stringArray(actor.roleCodes),
    permissions: stringArray(actor.permissions),
    intrinsicPermissions: stringArray(actor.intrinsicPermissions),
    delegatedPermissions: stringArray(actor.delegatedPermissions),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
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


export function listAuthzAuditLogs(
  actor: AuthzAdminRequestActor,
  filters: AuthzAuditLogFilters = {},
): Promise<AuthzAuditLog[]> {
  const query = auditLogQuery(filters);
  return apiFetch<AuthzAuditLog[]>(`/authz/audit-logs${query}`, {
    headers: authzHeaders(actor),
  });
}

function auditLogQuery(filters: AuthzAuditLogFilters): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "number") {
      if (Number.isFinite(value) && value > 0) {
        params.set(key, String(value));
      }
      continue;
    }

    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) {
      params.set(key, trimmed);
    }
  }

  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
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

export function setAuthzActorActive(
  actor: AuthzAdminRequestActor,
  targetActorId: string,
  input: SetAuthzActorActiveInput,
): Promise<AuthzActor> {
  return apiFetch<AuthzActor>(`/authz/actors/${encodeURIComponent(targetActorId)}/active`, {
    method: "PATCH",
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
