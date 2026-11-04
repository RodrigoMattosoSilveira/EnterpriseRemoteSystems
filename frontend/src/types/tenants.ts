export type TenantOperationalStatus =
  | "ACTIVE_READY"
  | "ACTIVE_NO_TENANT_ADMIN"
  | "INACTIVE";

export type Tenant = {
  id: string;
  code: string;
  name: string;
  description?: string;
  active: boolean;
  operationalStatus: TenantOperationalStatus;
  tenantAdminCount: number;
  tenantAdminAssignmentCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateTenantInput = {
  code: string;
  name: string;
  description?: string;
  active?: boolean;
  firstAdministrator?: FirstAdministratorInput;
};

export type FirstAdministratorInput = {
  firstName: string;
  lastName: string;
  nickname?: string;
  cpf: string;
  rg: string;
  cellular: string;
  email: string;
  temporaryPassword: string;
};

export type UpdateTenantInput = {
  code: string;
  name: string;
  description?: string;
};

export type TenantAdminCandidate = {
  actorId: string;
  actorKey: string;
  displayName: string;
  globalPersonId?: string;
  personName?: string;
  personNickname?: string;
  accountLogin?: string;
  active: boolean;
  assigned: boolean;
  eligible?: boolean;
  ineligibilityReason?: string;
  hasDelegatedAuthorityInOtherTenant?: boolean;
};
