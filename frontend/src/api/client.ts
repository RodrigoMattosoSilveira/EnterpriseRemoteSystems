import { readSelectedTenantId } from "./tenantSelection";
import {
  notifyAuthenticationRequired,
  notifyForbidden,
  type AuthenticationInterruptionReason,
} from "../app/authEvents";

const API_BASE_URL = "/api/v1";
type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
  };
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
  const result = await performApiFetch<T>(url, options);

  if (!result.response.ok) {
    if (result.response.status === 401 && !isPublicAuthenticationRequest(path)) {
      notifyAuthenticationRequired(authenticationInterruptionReason(result.errorCode));
    }
    if (result.response.status === 403 && result.errorCode === "forbidden") {
      notifyForbidden();
    }
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
): Promise<ApiFetchResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      credentials: options.credentials ?? "same-origin",
      headers: authenticatedRequestHeaders(options.headers),
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

function selectedTenantHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};

  const tenantId = readSelectedTenantId(window.localStorage);
  return tenantId ? { "X-Tenant-ID": tenantId } : {};
}


const FORBIDDEN_ACTOR_HEADERS = new Set([
  "x-actor-id",
  "x-actor-permissions",
  "x-authorized-by",
]);

function authenticatedRequestHeaders(input: HeadersInit | undefined): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [name, value] of headerEntries(input)) {
    if (FORBIDDEN_ACTOR_HEADERS.has(name.toLowerCase())) continue;
    headers[name] = value;
  }

  if (!hasHeader(headers, "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  const tenantId = selectedTenantHeaders()["X-Tenant-ID"];
  if (tenantId) {
    removeHeader(headers, "x-tenant-id");
    headers["X-Tenant-ID"] = tenantId;
  }

  return headers;
}

function headerEntries(input: HeadersInit | undefined): Array<[string, string]> {
  if (!input) return [];
  if (typeof Headers !== "undefined" && input instanceof Headers) {
    return Array.from(input.entries());
  }
  if (Array.isArray(input)) {
    return input.map(([name, value]) => [String(name), String(value)]);
  }
  return Object.entries(input).map(([name, value]) => [name, String(value)]);
}

function hasHeader(headers: Record<string, string>, target: string): boolean {
  return Object.keys(headers).some((name) => name.toLowerCase() === target);
}

function removeHeader(headers: Record<string, string>, target: string): void {
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === target) delete headers[name];
  }
}

function authenticationInterruptionReason(
  errorCode: string | undefined,
): AuthenticationInterruptionReason {
  if (errorCode === "session_expired") return "expired";
  if (errorCode === "account_inactive" || errorCode === "actor_inactive") {
    return "inactive";
  }
  return "expired";
}

function isPublicAuthenticationRequest(path: string): boolean {
  return path === "/auth/login" || path === "/auth/password/reset";
}
