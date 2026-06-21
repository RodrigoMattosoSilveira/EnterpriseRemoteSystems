const API_BASE_URL = "/api/v1";
const AUTHZ_REQUEST_ACTOR_STORAGE_KEY = "ers.authzAdmin.requestActor";
const LOCAL_DEV_DEFAULT_ACTOR = {
  actorId: "bootstrap-admin",
  tenantId: "default",
  actorPermissions: "*",
} as const;

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
  };
};

type StoredRequestActor = {
  actorId?: string;
  tenantId?: string;
  actorPermissions?: string;
};

export class ApiError extends Error {
  status?: number;
  code?: string;
  fields?: Record<string, string>;
  details?: unknown;
  url?: string;

  constructor(args: {
    message: string;
    status?: number;
    code?: string;
    fields?: Record<string, string>;
    details?: unknown;
    url?: string;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.status = args.status;
    this.code = args.code;
    this.fields = args.fields;
    this.details = args.details;
    this.url = args.url;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...temporaryAuthzHeaders(),
        ...(options.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ApiError({
      message: error instanceof Error ? error.message : "Network request failed",
      url,
      details: error,
    });
  }

  const text = await response.text();

  let json: ApiEnvelope<T> | T | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const envelope = json as ApiEnvelope<T> | null;

    throw new ApiError({
      status: response.status,
      code: envelope?.error?.code,
      message:
        envelope?.error?.message ||
        text ||
        `API request failed with status ${response.status}`,
      fields: envelope?.error?.fields,
      details: json ?? text,
      url,
    });
  }

  if (json && typeof json === "object" && "data" in json) {
    return (json as ApiEnvelope<T>).data as T;
  }

  return json as T;
}

function temporaryAuthzHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};

  const storage = window.localStorage;
  const stored = typeof storage?.getItem === "function"
    ? storage.getItem(AUTHZ_REQUEST_ACTOR_STORAGE_KEY)
    : null;
  const parsed = withLocalDevelopmentDefaults(parseStoredRequestActor(stored));
  const actorId = typeof parsed.actorId === "string" ? parsed.actorId.trim() : "";
  const tenantId = typeof parsed.tenantId === "string" ? parsed.tenantId.trim() : "";
  if (!actorId || !tenantId) return {};

  const headers: Record<string, string> = {
    "X-Actor-ID": actorId,
    "X-Authorized-By": actorId,
    "X-Tenant-ID": tenantId,
  };

  const actorPermissions = typeof parsed.actorPermissions === "string"
    ? parsed.actorPermissions.trim()
    : "";
  if (actorPermissions) {
    headers["X-Actor-Permissions"] = actorPermissions;
  }

  return headers;
}

function parseStoredRequestActor(stored: string | null): StoredRequestActor {
  if (!stored || !stored.trim()) {
    return localDevelopmentDefaultActor();
  }

  try {
    const parsed = JSON.parse(stored) as StoredRequestActor;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Fall through to the local development default below. A blank or malformed
    // localStorage value should not break the local app before the Authz helper
    // can be opened.
  }

  return localDevelopmentDefaultActor();
}

function withLocalDevelopmentDefaults(actor: StoredRequestActor): StoredRequestActor {
  if (!import.meta.env.DEV) return actor;

  return {
    actorId: actor.actorId || LOCAL_DEV_DEFAULT_ACTOR.actorId,
    tenantId: actor.tenantId || LOCAL_DEV_DEFAULT_ACTOR.tenantId,
    actorPermissions: actor.actorPermissions || LOCAL_DEV_DEFAULT_ACTOR.actorPermissions,
  };
}

function localDevelopmentDefaultActor(): StoredRequestActor {
  return import.meta.env.DEV ? LOCAL_DEV_DEFAULT_ACTOR : {};
}
