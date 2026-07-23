const API_BASE_URL = "/api/v1";
const AUTHZ_REQUEST_ACTOR_STORAGE_KEY = "ers.authzAdmin.requestActor";
const LOCAL_DEV_DEFAULT_ACTOR = {
  actorId: "bootstrap-admin",
  tenantId: "default",
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
  let result = await performApiFetch<T>(url, options);

  if (!result.response.ok && shouldRetryWithLocalBootstrapActor(result.errorCode)) {
    resetToLocalDevelopmentDefaultActor();
    result = await performApiFetch<T>(url, options, localDevelopmentDefaultHeaders());
  }

  if (!result.response.ok) {
    throw new ApiError({
      status: result.response.status,
      code: result.errorCode,
      message:
        result.errorMessage ||
        result.text ||
        `API request failed with status ${result.response.status}`,
      fields: result.errorFields,
      details: result.json ?? result.text,
      url,
    });
  }

  if (result.json && typeof result.json === "object" && "data" in result.json) {
    return (result.json as ApiEnvelope<T>).data as T;
  }

  return result.json as T;
}

type ApiFetchResult<T> = {
  response: Response;
  text: string;
  json: ApiEnvelope<T> | T | null;
  errorCode?: string;
  errorMessage?: string;
  errorFields?: Record<string, string>;
};

async function performApiFetch<T>(
  url: string,
  options: RequestInit,
  authzHeaderOverride: Record<string, string> = {},
): Promise<ApiFetchResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      credentials: options.credentials ?? "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...temporaryAuthzHeaders(),
        ...(options.headers ?? {}),
        ...authzHeaderOverride,
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

  const envelope = json as ApiEnvelope<T> | null;
  return {
    response,
    text,
    json,
    errorCode: envelope?.error?.code,
    errorMessage: envelope?.error?.message,
    errorFields: envelope?.error?.fields,
  };
}

function temporaryAuthzHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};

  const stored = readStoredRequestActor();
  const parsed = withLocalDevelopmentDefaults(parseStoredRequestActor(stored));
  const actorId = typeof parsed.actorId === "string" ? parsed.actorId.trim() : "";
  const tenantId = typeof parsed.tenantId === "string" ? parsed.tenantId.trim() : "";
  if (!actorId || !tenantId) return {};

  return {
    "X-Actor-ID": actorId,
    "X-Tenant-ID": tenantId,
  };
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
  if (!isLocalAppRuntime()) return actor;

  return {
    actorId: actor.actorId || LOCAL_DEV_DEFAULT_ACTOR.actorId,
    tenantId: actor.tenantId || LOCAL_DEV_DEFAULT_ACTOR.tenantId,
  };
}

function localDevelopmentDefaultActor(): StoredRequestActor {
  return isLocalAppRuntime() ? LOCAL_DEV_DEFAULT_ACTOR : {};
}

function shouldRetryWithLocalBootstrapActor(errorCode?: string): boolean {
  if (!isLocalAppRuntime() || errorCode !== "missing_actor") {
    return false;
  }

  const stored = readStoredRequestActor();
  if (!stored || !stored.trim()) {
    return false;
  }

  const actor = withLocalDevelopmentDefaults(parseStoredRequestActor(stored));
  return (
    actor.actorId !== LOCAL_DEV_DEFAULT_ACTOR.actorId ||
    actor.tenantId !== LOCAL_DEV_DEFAULT_ACTOR.tenantId
  );
}

function localDevelopmentDefaultHeaders(): Record<string, string> {
  return {
    "X-Actor-ID": LOCAL_DEV_DEFAULT_ACTOR.actorId,
    "X-Tenant-ID": LOCAL_DEV_DEFAULT_ACTOR.tenantId,
  };
}

function resetToLocalDevelopmentDefaultActor() {
  if (!isLocalAppRuntime() || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      AUTHZ_REQUEST_ACTOR_STORAGE_KEY,
      JSON.stringify(LOCAL_DEV_DEFAULT_ACTOR),
    );
  } catch {
    // If browser storage is unavailable, the next request still falls back to the
    // same local default through temporaryAuthzHeaders.
  }
}

function readStoredRequestActor(): string | null {
  if (typeof window === "undefined") return null;

  const storage = window.localStorage;
  return typeof storage?.getItem === "function"
    ? storage.getItem(AUTHZ_REQUEST_ACTOR_STORAGE_KEY)
    : null;
}

function isLocalAppRuntime(): boolean {
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
