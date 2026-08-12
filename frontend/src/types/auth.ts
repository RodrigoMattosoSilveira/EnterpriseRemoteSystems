export type AuthSession = {
  accountId: string;
  actorId: string;
  actorKey: string;
  displayName: string;
  personId?: string;
  collaboratorId?: string;
  login: string;
  mustChangePassword: boolean;
  expiresAt: string;
};

export type AuthAccount = {
  id: string;
  actorId: string;
  actorKey: string;
  displayName: string;
  login: string;
  active: boolean;
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
};
