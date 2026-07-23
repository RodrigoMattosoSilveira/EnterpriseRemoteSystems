export const AUTHZ_REQUEST_ACTOR_STORAGE_KEY = "ers.authzAdmin.requestActor";

export const DEFAULT_REQUEST_ACTOR = {
  actorId: "bootstrap-admin",
  tenantId: "default",
} as const;

export type RequestActorSelection = {
  actorId: string;
  tenantId: string;
};

type StoredRequestActor = {
  actorId?: unknown;
  tenantId?: unknown;
};

export function ensureDefaultRequestActorStored(storage: Storage): void {
  const actor = readRequestActorSelection(storage);
  const next = JSON.stringify(actor);

  try {
    const stored = storage.getItem(AUTHZ_REQUEST_ACTOR_STORAGE_KEY);
    if (stored !== next) {
      storage.setItem(AUTHZ_REQUEST_ACTOR_STORAGE_KEY, next);
    }
  } catch {
    // localStorage can be unavailable in locked-down browser contexts. In that
    // case the API client will continue to fail closed with the backend's
    // normal missing-actor response instead of inventing header permissions.
  }
}

export function readRequestActorSelection(storage: Storage): RequestActorSelection {
  try {
    const stored = storage.getItem(AUTHZ_REQUEST_ACTOR_STORAGE_KEY);
    const parsed = parseStoredRequestActor(stored);
    return {
      actorId: normalizeString(parsed.actorId) || DEFAULT_REQUEST_ACTOR.actorId,
      tenantId: normalizeString(parsed.tenantId) || DEFAULT_REQUEST_ACTOR.tenantId,
    };
  } catch {
    return { ...DEFAULT_REQUEST_ACTOR };
  }
}

export function resetDefaultRequestActorStored(storage: Storage): void {
  storage.setItem(
    AUTHZ_REQUEST_ACTOR_STORAGE_KEY,
    JSON.stringify(DEFAULT_REQUEST_ACTOR),
  );
}

export function isDefaultRequestActor(actor: RequestActorSelection): boolean {
  return (
    actor.actorId === DEFAULT_REQUEST_ACTOR.actorId &&
    actor.tenantId === DEFAULT_REQUEST_ACTOR.tenantId
  );
}

export function isLocalRequestActorRuntime(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

function parseStoredRequestActor(stored: string | null): StoredRequestActor {
  if (!stored || !stored.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as StoredRequestActor;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Malformed localStorage should not prevent the app from bootstrapping a
    // persisted operating actor selection for the development environment.
  }

  return {};
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
