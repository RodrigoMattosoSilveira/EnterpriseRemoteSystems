import { apiFetch } from "./client";
import type {
  AuthAccount,
  AuthSession,
  AuthTenantOption,
  ChangePasswordRequest,
  CreateAuthAccountRequest,
  LoginRequest,
  PasswordResetResult,
  PasswordResetToken,
  ResetPasswordRequest,
  AccountReactivationRequest,
  ReactivationRequestAcknowledgement,
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
  return apiFetch<AuthSession>("/auth/session", { cache: "no-store" });
}

export async function loadAuthTenantOptions(): Promise<AuthTenantOption[]> {
  const payload = await apiFetch<unknown>("/auth/tenant-options");
  return normalizeAuthTenantOptions(payload);
}

export function normalizeAuthTenantOptions(
  payload: unknown,
): AuthTenantOption[] {
  const options = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.items)
      ? payload.items
      : [];

  return options.filter(isAuthTenantOption).map((option) => ({
    id: option.id,
    code: option.code,
    name: option.name,
    roleCodes: Array.isArray(option.roleCodes)
      ? option.roleCodes.filter((role): role is string => typeof role === "string")
      : [],
  }));
}

function isAuthTenantOption(value: unknown): value is AuthTenantOption {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.code === "string" &&
    typeof value.name === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function changePassword(request: ChangePasswordRequest): Promise<void> {
  return apiFetch<void>("/auth/password/change", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function resetPassword(
  request: ResetPasswordRequest,
): Promise<PasswordResetResult> {
  return apiFetch<PasswordResetResult>("/auth/password/reset", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function listAuthAccounts(): Promise<AuthAccount[]> {
  const accounts = await apiFetch<AuthAccount[]>("/auth/accounts");
  return normalizeAuthAccounts(accounts);
}

export function normalizeAuthAccounts(accounts: AuthAccount[]): AuthAccount[] {
  return accounts.map((account) => {
    if (!account.globalPersonId || account.globalPersonName?.trim()) {
      return account;
    }

    const actorPersonNames = Array.from(
      new Set(
        (account.actors ?? [])
          .map((actor) => actor.personName?.trim())
          .filter((name): name is string => Boolean(name)),
      ),
    );
    if (actorPersonNames.length !== 1) {
      return account;
    }

    return { ...account, globalPersonName: actorPersonNames[0] };
  });
}

export const AUTHENTICATION_ACCOUNT_FEEDBACK_EVENT =
  "ers:authentication-account-feedback";

export type AuthenticationAccountFeedback = {
  kind: "success" | "error";
  message: string;
};

export async function createAuthAccount(
  request: CreateAuthAccountRequest,
): Promise<AuthAccount> {
  try {
    const account = await apiFetch<AuthAccount>("/auth/accounts", {
      method: "POST",
      body: JSON.stringify(request),
    });
    notifyAuthenticationAccountFeedback({
      kind: "success",
      message: `Authentication account ${account.login} is ready.`,
    });
    return account;
  } catch (error) {
    notifyAuthenticationAccountFeedback({
      kind: "error",
      message: authenticationAccountErrorMessage(error),
    });
    throw error;
  }
}

function notifyAuthenticationAccountFeedback(
  detail: AuthenticationAccountFeedback,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AuthenticationAccountFeedback>(
      AUTHENTICATION_ACCOUNT_FEEDBACK_EVENT,
      { detail },
    ),
  );
}

function authenticationAccountErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "fields" in error) {
    const fields = (error as { fields?: Record<string, string> }).fields;
    const fieldMessage = fields
      ? Object.values(fields).find((message) => message.trim() !== "")
      : undefined;
    if (fieldMessage) {
      return `Authentication account was not created. ${fieldMessage}`;
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return `Authentication account was not created. ${error.message}`;
  }
  return "Authentication account was not created. Review the account details and try again.";
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

export function requestAccountReactivation(request: LoginRequest): Promise<ReactivationRequestAcknowledgement> {
  return apiFetch<ReactivationRequestAcknowledgement>("/auth/reactivation-requests", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function listAccountReactivationRequests(): Promise<AccountReactivationRequest[]> {
  return apiFetch<AccountReactivationRequest[]>("/auth/reactivation-requests", { cache: "no-store" });
}

export function listAccountReactivationRequestsForAlert(): Promise<AccountReactivationRequest[]> {
  return apiFetch<AccountReactivationRequest[]>("/auth/reactivation-requests", {
    cache: "no-store",
    // The landing-page alert is supplemental. If its permission contract is
    // temporarily unavailable, render its local error state rather than
    // tearing down the entire People workspace via the global 403 handler.
    suppressForbiddenNavigation: true,
  });
}

export function reviewAccountReactivationRequest(
  requestId: string,
  approve: boolean,
  reason: string,
): Promise<AccountReactivationRequest> {
  return apiFetch<AccountReactivationRequest>(
    `/auth/reactivation-requests/${encodeURIComponent(requestId)}/decision`,
    { method: "POST", body: JSON.stringify({ approve, reason }) },
  );
}
