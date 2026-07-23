import { apiFetch } from "./client";
import type {
  AuthAccount,
  AuthSession,
  ChangePasswordRequest,
  CreateAuthAccountRequest,
  LoginRequest,
  PasswordResetToken,
  ResetPasswordRequest,
} from "../types/auth";

export function login(request: LoginRequest): Promise<AuthSession> {
  return apiFetch<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

export function loadAuthSession(): Promise<AuthSession> {
  return apiFetch<AuthSession>("/auth/session");
}

export function changePassword(request: ChangePasswordRequest): Promise<void> {
  return apiFetch<void>("/auth/password/change", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function resetPassword(request: ResetPasswordRequest): Promise<void> {
  return apiFetch<void>("/auth/password/reset", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function listAuthAccounts(): Promise<AuthAccount[]> {
  return apiFetch<AuthAccount[]>("/auth/accounts");
}

export function createAuthAccount(
  request: CreateAuthAccountRequest,
): Promise<AuthAccount> {
  return apiFetch<AuthAccount>("/auth/accounts", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function setAuthAccountActive(
  accountId: string,
  active: boolean,
): Promise<AuthAccount> {
  return apiFetch<AuthAccount>(`/auth/accounts/${accountId}/active`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export function issuePasswordResetToken(
  accountId: string,
): Promise<PasswordResetToken> {
  return apiFetch<PasswordResetToken>(
    `/auth/accounts/${accountId}/password-reset-tokens`,
    { method: "POST" },
  );
}
