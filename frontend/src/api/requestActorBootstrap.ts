const AUTHZ_REQUEST_ACTOR_STORAGE_KEY = "ers.authzAdmin.requestActor";

const DEFAULT_REQUEST_ACTOR = {
  actorId: "bootstrap-admin",
  tenantId: "default",
} as const;

type StoredRequestActor = {
  actorId?: unknown;
  tenantId?: unknown;
};

export function ensureDefaultRequestActorStored(storage: Storage): void {
  try {
    const stored = storage.getItem(AUTHZ_REQUEST_ACTOR_STORAGE_KEY);
    const parsed = parseStoredRequestActor(stored);
    const actorId = normalizeString(parsed.actorId) || DEFAULT_REQUEST_ACTOR.actorId;
    const tenantId = normalizeString(parsed.tenantId) || DEFAULT_REQUEST_ACTOR.tenantId;

    const next = JSON.stringify({ actorId, tenantId });
    if (stored !== next) {
      storage.setItem(AUTHZ_REQUEST_ACTOR_STORAGE_KEY, next);
    }
  } catch {
    // localStorage can be unavailable in locked-down browser contexts. In that
    // case the API client will continue to fail closed with the backend's
    // normal missing-actor response instead of inventing header permissions.
  }
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
