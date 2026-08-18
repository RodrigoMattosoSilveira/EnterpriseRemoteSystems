export type AuthzAdminRequestActor = {
  actorId: string;
  tenantId: string;
};

export type AuthzCurrentActor = {
  actorKey: string;
  actorRecordId: string;
  tenantId: string;
  scope: string;
  personId?: string;
  globalPersonId?: string;
  membershipId?: string;
  collaboratorId?: string;
  roleCodes: string[];
  permissions: string[];
  intrinsicPermissions?: string[];
  delegatedPermissions?: string[];
};

export type AuthzPermission = {
  code: string;
  label: string;
  description: string;
};

export type AuthzRole = {
  id: string;
  code: string;
  label: string;
  description: string;
  scopeType: string;
  active: boolean;
  permissions?: AuthzPermission[];
};

export type AuthzActorRoleGrant = {
  id: string;
  actorId: string;
  roleId: string;
  roleCode: string;
  tenantId: string;
  scopeType: string;
  active: boolean;
};

export type AuthzActor = {
  id: string;
  actorKey: string;
  displayName: string;
  personId?: string;
  collaboratorId?: string;
  active: boolean;
  roleGrants?: AuthzActorRoleGrant[];
};

export type CreateAuthzActorInput = {
  actorKey: string;
  displayName: string;
  personId?: string | null;
  collaboratorId?: string | null;
  active: boolean;
};

export type SetAuthzActorActiveInput = {
  active: boolean;
};

export type GrantAuthzActorRoleInput = {
  roleCode: string;
  tenantId: string;
};

export type TenantOperatorRoleCode = "EARNINGS_OPERATOR" | "EXPENSE_OPERATOR";

export type GrantTenantOperatorRoleInput = {
  roleCode: TenantOperatorRoleCode;
};

export type AuthzAuditLog = {
  id: string;
  occurredAt: string;
  actorId?: string;
  actorRecordId?: string;
  tenantId?: string;
  permissionCode?: string;
  operation: string;
  targetType?: string;
  targetId?: string;
  decision: string;
  reason?: string;
  metadataJson?: string;
  requestMethod?: string;
  requestPath?: string;
};

export type AuthzAuditLogFilters = {
  actorId?: string;
  tenantId?: string;
  operation?: string;
  targetType?: string;
  targetId?: string;
  decision?: string;
  limit?: number;
};
