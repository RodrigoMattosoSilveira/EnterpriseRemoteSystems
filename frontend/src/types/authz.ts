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
  supportLeaseId?: string;
  supportLeaseExpiresAt?: string;
  supportLeasePermissions?: string[];
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
  lifecycleSuspended?: boolean;
};

export type AuthzActorBinding = {
  accountId: string;
  globalPersonId?: string;
  accountLogin?: string;
  scopeType: string;
  tenantId?: string;
  membershipId?: string;
  membershipTenantId?: string;
  membershipActive: boolean;
  membershipSameTenant: boolean;
};

export type AuthzActor = {
  id: string;
  actorKey: string;
  displayName: string;
  personId?: string;
  globalPersonId?: string;
  collaboratorId?: string;
  active: boolean;
  roleGrants?: AuthzActorRoleGrant[];
  binding?: AuthzActorBinding;
};

export type CreateAuthzActorInput = {
  actorKey: string;
  displayName: string;
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
  accountId?: string;
  actorId?: string;
  actorRecordId?: string;
  actorScope?: string;
  personId?: string;
  membershipId?: string;
  tenantId?: string;
  sessionId?: string;
  correlationId?: string;
  permissionCode?: string;
  authorizationSource?: string;
  authorizationSourceId?: string;
  authorizationRoleCode?: string;
  supportLeaseId?: string;
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
  accountId?: string;
  actorId?: string;
  tenantId?: string;
  sessionId?: string;
  correlationId?: string;
  authorizationSource?: string;
  operation?: string;
  targetType?: string;
  targetId?: string;
  supportLeaseId?: string;
  decision?: string;
  limit?: number;
};

export type SupportAccessLeaseStatus = "PENDING" | "APPROVED" | "TERMINATED" | "EXPIRED" | string;

export type SupportAccessLease = {
  id: string;
  tenantId: string;
  applicationActorId: string;
  requestedByActorId: string;
  requestedAt: string;
  expiresAt: string;
  reason: string;
  status: string;
  effectiveStatus: SupportAccessLeaseStatus;
  permissions: string[];
  approvedAt?: string;
  approvedByActorId?: string;
  terminatedAt?: string;
  terminatedByActorId?: string;
  terminationReason?: string;
};

export type CreateSupportAccessLeaseInput = {
  tenantId: string;
  expiresAt: string;
  reason: string;
  permissions: string[];
};

export type SupportAccessLeaseFilters = {
  tenantId?: string;
  status?: SupportAccessLeaseStatus;
};
