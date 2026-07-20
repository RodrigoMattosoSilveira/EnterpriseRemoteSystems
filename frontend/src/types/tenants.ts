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
  createdAt: string;
  updatedAt: string;
};

export type CreateTenantInput = {
  code: string;
  name: string;
  description?: string;
  active?: boolean;
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
  active: boolean;
  assigned: boolean;
};
