const API_BASE_URL = "/api/v1";
const AUTHZ_REQUEST_ACTOR_STORAGE_KEY = "ers.authzAdmin.requestActor";

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
  if (typeof storage?.getItem !== "function") return {};

  try {
    const stored = storage.getItem(AUTHZ_REQUEST_ACTOR_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as StoredRequestActor;
    const actorId = typeof parsed.actorId === "string" ? parsed.actorId.trim() : "";
    const tenantId = typeof parsed.tenantId === "string" ? parsed.tenantId.trim() : "";
    if (!actorId || !tenantId) return {};
    return {
      "X-Actor-ID": actorId,
      "X-Tenant-ID": tenantId,
    };
  } catch {
    return {};
  }
}
