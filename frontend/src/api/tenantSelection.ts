import type { AuthzAdminRequestActor } from "../types/authz";

export const SELECTED_TENANT_STORAGE_KEY = "ers.auth.selectedTenantId";
export const SELECTED_TENANT_ACCOUNT_STORAGE_KEY =
  "ers.auth.selectedTenantAccountId";
export const DEFAULT_SELECTED_TENANT_ID = "default";

const LEGACY_REQUEST_ACTOR_STORAGE_KEY = "ers.authzAdmin.requestActor";
const AUTHENTICATED_SESSION_ACTOR_ID = "authenticated-session";

type LegacyRequestActor = {
  actorId?: unknown;
  tenantId?: unknown;
};

export function ensureSelectedTenantStored(storage: Storage): void {
  try {
    const tenantId = readSelectedTenantId(storage);
    storage.setItem(SELECTED_TENANT_STORAGE_KEY, tenantId);
    storage.removeItem(LEGACY_REQUEST_ACTOR_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in locked-down browser contexts. Requests then
    // fail closed through the backend's tenant-selection requirement.
  }
}

export function readSelectedTenantId(storage: Storage): string {
  try {
    const selected = normalizeString(storage.getItem(SELECTED_TENANT_STORAGE_KEY));
    if (selected) return selected;

    const legacyTenant = readLegacyTenantId(storage.getItem(LEGACY_REQUEST_ACTOR_STORAGE_KEY));
    return legacyTenant || DEFAULT_SELECTED_TENANT_ID;
  } catch {
    return DEFAULT_SELECTED_TENANT_ID;
  }
}

export function setSelectedTenantId(storage: Storage, tenantId: string): string {
  const normalized = normalizeString(tenantId) || DEFAULT_SELECTED_TENANT_ID;
  try {
    storage.setItem(SELECTED_TENANT_STORAGE_KEY, normalized);
    storage.removeItem(LEGACY_REQUEST_ACTOR_STORAGE_KEY);
  } catch {
    // The caller can continue rendering; protected requests fail closed when
    // the tenant selection cannot be persisted.
  }
  return normalized;
}

export function reconcileSelectedTenantForAccount(
  storage: Storage,
  accountId: string,
): void {
  const normalizedAccountId = normalizeString(accountId);
  if (!normalizedAccountId) return;

  try {
    const selectedTenantOwner = normalizeString(
      storage.getItem(SELECTED_TENANT_ACCOUNT_STORAGE_KEY),
    );

    if (selectedTenantOwner !== normalizedAccountId) {
      storage.removeItem(SELECTED_TENANT_STORAGE_KEY);
      storage.removeItem(LEGACY_REQUEST_ACTOR_STORAGE_KEY);
    }

    storage.setItem(SELECTED_TENANT_ACCOUNT_STORAGE_KEY, normalizedAccountId);
  } catch {
    // Storage may be unavailable in locked-down browser contexts. Requests then
    // fail closed through the backend's tenant-selection requirement.
  }
}

export function setSelectedTenantForAccount(
  storage: Storage,
  tenantId: string,
  accountId: string,
): string {
  const selectedTenantId = setSelectedTenantId(storage, tenantId);
  const normalizedAccountId = normalizeString(accountId);

  if (!normalizedAccountId) return selectedTenantId;

  try {
    storage.setItem(SELECTED_TENANT_ACCOUNT_STORAGE_KEY, normalizedAccountId);
  } catch {
    // The selected tenant was still returned to the caller. Protected requests
    // fail closed if browser storage cannot persist the Account ownership.
  }

  return selectedTenantId;
}

export function authorizationRequestContext(tenantId: string): AuthzAdminRequestActor {
  return {
    actorId: AUTHENTICATED_SESSION_ACTOR_ID,
    tenantId: normalizeString(tenantId) || DEFAULT_SELECTED_TENANT_ID,
  };
}

function readLegacyTenantId(stored: string | null): string {
  if (!stored || !stored.trim()) return "";

  try {
    const parsed = JSON.parse(stored) as LegacyRequestActor;
    if (!parsed || typeof parsed !== "object") return "";
    return normalizeString(parsed.tenantId);
  } catch {
    return "";
  }
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
