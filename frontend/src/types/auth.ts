export type AuthSession = {
  accountId: string;
  displayName: string;
  login: string;
  mustChangePassword: boolean;
  expiresAt: string;
};

export type AuthSelfServicePerson = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string;
  cpf: string;
  rg: string;
  cellular: string;
  email: string;
  street1?: string;
  street2?: string;
  state?: string;
  city?: string;
  cep?: string;
  country: string;
  bankName?: string;
  bankNumber?: string;
  checkingAccount?: string;
  pixKey?: string;
  emergencyName?: string;
  emergencyCellular?: string;
  emergencyEmail?: string;
  profileCompletionStatus: string;
  canCreateCollaborator: boolean;
};

export type AuthSelfServiceBalance = {
  tenantId: string;
  tenantName: string;
  valueUnitId: string;
  valueUnitCode: string;
  valueUnitLabel: string;
  balance: number;
};

export type AuthSelfServiceLedgerEntry = {
  id: string;
  tenantId: string;
  tenantName: string;
  personId: string;
  collaboratorId: string;
  valueUnitId: string;
  valueUnitCode: string;
  valueUnitLabel: string;
  entryType: string;
  direction: string;
  amount: number;
  signedAmount: number;
  effectiveDate: string;
  sourceType: string;
  sourceId: string;
  description?: string;
};

export type AuthSelfServiceHome = {
  accountId: string;
  person: AuthSelfServicePerson;
  balances: AuthSelfServiceBalance[];
  entries: AuthSelfServiceLedgerEntry[];
};

export type AuthAccountActor = {
  actorId: string;
  actorKey: string;
  displayName: string;
  scope: "GLOBAL" | "TENANT" | string;
  tenantId?: string;
  tenantName?: string;
  membershipId?: string;
  personId?: string;
  personName?: string;
  personNickname?: string;
  collaboratorId?: string;
  active: boolean;
  primary: boolean;
};

export type AuthAccount = {
  id: string;
  actorId: string;
  actorKey: string;
  displayName: string;
  globalPersonId?: string;
  globalPersonName?: string;
  globalPersonEmail?: string;
  actors?: AuthAccountActor[];
  login: string;
  active: boolean;
  securitySuspended?: boolean;
  operationalActive?: boolean;
  actorActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string;
  passwordChangedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type LoginRequest = {
  login: string;
  password: string;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type ResetPasswordRequest = {
  token: string;
  newPassword: string;
};

export type CreateAuthAccountRequest = {
  actorId: string;
  tenantId?: string;
  login: string;
  temporaryPassword: string;
  mustChangePassword?: boolean;
};

export type PasswordResetToken = {
  accountId: string;
  login: string;
  token: string;
  expiresAt: string;
};

export type PasswordResetResult = {
  accountId: string;
  login: string;
  passwordChangedAt: string;
};

export type AuthTenantOption = {
  id: string;
  code: string;
  name: string;
  roleCodes: string[];
  actorRecordId?: string;
  actorKey?: string;
  actorScope?: string;
  membershipId?: string;
};

export type AccountReactivationRequest = {
  id: string;
  accountId: string;
  login: string;
  globalPersonName?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  requestedByType: "SELF" | "TENANT_ADMIN" | string;
  requestedTenantId?: string;
  firstRequestedAt: string;
  lastRequestedAt: string;
  requestCount: number;
  reviewedByActorId?: string;
  reviewedAt?: string;
  reviewReason?: string;
};

export type ReactivationRequestAcknowledgement = {
  status: string;
};
