export type AuthzAdminRequestActor = {
  actorId: string;
  tenantId: string;
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

export type GrantAuthzActorRoleInput = {
  roleCode: string;
  tenantId: string;
};
