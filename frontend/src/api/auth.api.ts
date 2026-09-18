import { apiFetch } from "./client";
import type {
  AuthAccount,
  AuthSession,
  AuthSelfServiceHome,
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

export function loadAuthSession(): Promise<AuthSession | null> {
  return apiFetch<AuthSession | null>("/auth/session", { cache: "no-store" });
}

export function loadAuthSelfServiceHome(): Promise<AuthSelfServiceHome> {
  return apiFetch<AuthSelfServiceHome>("/auth/self-service", { cache: "no-store" });
}

export async function loadAuthTenantOptions(): Promise<AuthTenantOption[]> {
  const payload = await apiFetch<unknown>("/auth/tenant-options", {
    cache: "no-store",
  });
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

  const normalized = options.filter(isAuthTenantOption).map((option) => ({
    id: option.id,
    code: option.code,
    name: option.name,
    roleCodes: Array.isArray(option.roleCodes)
      ? option.roleCodes.filter((role): role is string => typeof role === "string")
      : [],
    ...(isAuthTenantContextKind(option.contextKind)
      ? { contextKind: option.contextKind }
      : {}),
    ...(typeof option.actorRecordId === "string" && option.actorRecordId.trim()
      ? { actorRecordId: option.actorRecordId }
      : {}),
    ...(typeof option.actorKey === "string" && option.actorKey.trim()
      ? { actorKey: option.actorKey }
      : {}),
    ...(typeof option.actorScope === "string" && option.actorScope.trim()
      ? { actorScope: option.actorScope }
      : {}),
    ...(typeof option.membershipId === "string" && option.membershipId.trim()
      ? { membershipId: option.membershipId }
      : {}),
    ...(typeof option.supportLeaseId === "string" && option.supportLeaseId.trim()
      ? { supportLeaseId: option.supportLeaseId }
      : {}),
    ...(typeof option.supportLeaseExpiresAt === "string" && option.supportLeaseExpiresAt.trim()
      ? { supportLeaseExpiresAt: option.supportLeaseExpiresAt }
      : {}),
  }));

  // A GLOBAL/Application Account must never acquire an ordinary Tenant identity.
  // The only Tenant entries allowed beside Global administration are exact
  // temporary contexts backed by an approved Support Access Lease. Enforce this
  // again at the client boundary so malformed/stale responses cannot turn an
  // Application Administrator into a Tenant Actor/Membership in the UI.
  if (!normalized.some((option) => option.id === "*")) return normalized;

  return normalized.filter(
    (option) => option.id === "*" || isSupportLeaseTenantOption(option),
  );
}

function isSupportLeaseTenantOption(option: AuthTenantOption): boolean {
  return (
    option.id !== "*" &&
    option.contextKind === "SUPPORT_LEASE" &&
    option.actorScope === "APPLICATION" &&
    Boolean(option.supportLeaseId?.trim()) &&
    Boolean(option.supportLeaseExpiresAt?.trim()) &&
    !option.membershipId?.trim()
  );
}

function isAuthTenantContextKind(value: unknown): value is AuthTenantOption["contextKind"] {
  return value === "GLOBAL" || value === "TENANT_IDENTITY" || value === "SUPPORT_LEASE";
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
  code?: "account_ready" | "account_not_created";
  login?: string;
  detail?: string;
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
      code: "account_ready",
      login: account.login,
      message: `Authentication account ${account.login} is ready.`,
    });
    return account;
  } catch (error) {
    const feedback = authenticationAccountErrorFeedback(error);
    notifyAuthenticationAccountFeedback({
      kind: "error",
      code: "account_not_created",
      message: feedback.message,
      detail: feedback.detail,
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

function authenticationAccountErrorFeedback(error: unknown): { message: string; detail?: string } {
  if (typeof error === "object" && error !== null && "fields" in error) {
    const fields = (error as { fields?: Record<string, string> }).fields;
    const fieldMessage = fields
      ? Object.values(fields).find((message) => message.trim() !== "")
      : undefined;
    if (fieldMessage) {
      return {
        message: `Authentication account was not created. ${fieldMessage}`,
        detail: fieldMessage,
      };
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return {
      message: `Authentication account was not created. ${error.message}`,
      detail: error.message,
    };
  }
  return {
    message: "Authentication account was not created. Review the account details and try again.",
  };
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
