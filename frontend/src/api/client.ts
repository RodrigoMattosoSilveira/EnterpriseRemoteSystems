import { readSelectedTenantId } from "./tenantSelection";
import {
  notifyAuthenticationRequired,
  notifyForbidden,
  notifyTenantActorUnavailable,
  type AuthenticationInterruptionReason,
} from "../app/authEvents";

const API_BASE_URL = "/api/v1";
export const LOCAL_SESSION_STORAGE_KEY = "ers.local.session";
const LOCAL_SESSION_TOKEN_HEADER = "X-ERS-Local-Session";
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

export type ApiFetchOptions = RequestInit & {
  suppressForbiddenNavigation?: boolean;
};

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { suppressForbiddenNavigation = false, ...requestOptions } = options;
  const url = `${API_BASE_URL}${path}`;
  const result = await performApiFetch<T>(url, requestOptions);

  if (!result.response.ok) {
    if (
      result.response.status === 401 &&
      !result.authenticationInterruptionSuperseded &&
      !isPublicAuthenticationRequest(path, requestOptions.method)
    ) {
      notifyAuthenticationRequired(authenticationInterruptionReason(result.errorCode));
    }
    if (
      result.response.status === 403 &&
      result.errorCode === "forbidden" &&
      !suppressForbiddenNavigation
    ) {
      notifyForbidden();
    }
    if (
      result.response.status === 403 &&
      result.errorCode === "tenant_actor_unavailable"
    ) {
      notifyTenantActorUnavailable();
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
  authenticationInterruptionSuperseded: boolean;
};

async function performApiFetch<T>(
  url: string,
  options: RequestInit,
): Promise<ApiFetchResult<T>> {
  let response: Response;
  let authenticationInterruptionSuperseded = false;

  try {
    const headers = authenticatedRequestHeaders(options.headers);
    const requestLocalSessionToken = headers[LOCAL_SESSION_TOKEN_HEADER] ?? "";
    response = await fetch(url, {
      ...options,
      credentials: options.credentials ?? "same-origin",
      headers,
    });
    authenticationInterruptionSuperseded =
      response.status === 401 &&
      localSessionResponseWasSuperseded(requestLocalSessionToken);
    syncLocalSessionTransport(response, requestLocalSessionToken);
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
    authenticationInterruptionSuperseded,
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
  "x-ers-local-lan-proxy",
  "x-ers-local-session",
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

  const localSessionToken = readLocalSessionTransportToken();
  if (localSessionToken) {
    headers[LOCAL_SESSION_TOKEN_HEADER] = localSessionToken;
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
  if (
    errorCode === "account_inactive" ||
    errorCode === "account_security_suspended" ||
    errorCode === "account_operationally_inactive" ||
    errorCode === "actor_inactive"
  ) {
    return "inactive";
  }
  return "expired";
}

function isPublicAuthenticationRequest(
  path: string,
  method: string | undefined,
): boolean {
  const normalizedMethod = (method ?? "GET").toUpperCase();
  return (
    path === "/auth/login" ||
    path === "/auth/session" ||
    path === "/auth/password/reset" ||
    (path === "/auth/reactivation-requests" && normalizedMethod === "POST")
  );
}

export function shouldUseLocalSessionTransport(
  location: Pick<Location, "protocol" | "hostname">,
): boolean {
  return location.protocol === "http:" && isPrivateIPv4Host(location.hostname);
}

export function clearLocalSessionTransport(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in restrictive/private browser modes. The
    // ordinary cookie transport remains authoritative whenever it works.
  }
}

function readLocalSessionTransportToken(): string {
  if (typeof window === "undefined") return "";
  return localSessionTokenForRequest(window.location, window.sessionStorage);
}

export function localSessionTokenForRequest(
  location: Pick<Location, "protocol" | "hostname">,
  storage: Pick<Storage, "getItem">,
): string {
  if (!shouldUseLocalSessionTransport(location)) return "";
  try {
    return storage.getItem(LOCAL_SESSION_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function localSessionResponseWasSuperseded(
  requestLocalSessionToken: string,
): boolean {
  if (typeof window === "undefined") return false;
  return isSupersededLocalSessionResponse(
    window.location,
    window.sessionStorage,
    requestLocalSessionToken,
  );
}

export function isSupersededLocalSessionResponse(
  location: Pick<Location, "protocol" | "hostname">,
  storage: Pick<Storage, "getItem">,
  requestLocalSessionToken: string,
): boolean {
  if (!shouldUseLocalSessionTransport(location)) return false;
  try {
    const currentToken =
      storage.getItem(LOCAL_SESSION_STORAGE_KEY)?.trim() ?? "";
    // A response belongs to an older authentication generation when the request
    // carried no LOCAL token (or an older token), but login has since installed
    // a different token. Such a response may report its own 401, but it must not
    // sign out the newer session that replaced it.
    return Boolean(currentToken && currentToken !== requestLocalSessionToken);
  } catch {
    return false;
  }
}

function syncLocalSessionTransport(
  response: Response,
  requestLocalSessionToken: string,
): void {
  if (typeof window === "undefined") return;
  syncLocalSessionTransportResponse(
    response,
    window.location,
    window.sessionStorage,
    requestLocalSessionToken,
  );
}

export function syncLocalSessionTransportResponse(
  response: Response,
  location: Pick<Location, "protocol" | "hostname">,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  requestLocalSessionToken = "",
): void {
  if (!shouldUseLocalSessionTransport(location)) return;

  const issuedToken = response.headers.get(LOCAL_SESSION_TOKEN_HEADER)?.trim();
  try {
    if (issuedToken) {
      storage.setItem(LOCAL_SESSION_STORAGE_KEY, issuedToken);
    } else if (response.status === 401) {
      const currentToken =
        storage.getItem(LOCAL_SESSION_STORAGE_KEY)?.trim() ?? "";
      // A passive request can start before login and finish after login. Never
      // let that older 401 erase the newer token just stored by the successful
      // login response. Likewise, an old-token request racing with a newer login
      // may clear only the exact token it actually sent.
      if (
        !currentToken ||
        (requestLocalSessionToken && currentToken === requestLocalSessionToken)
      ) {
        storage.removeItem(LOCAL_SESSION_STORAGE_KEY);
      }
    }
  } catch {
    // If sessionStorage is unavailable, the browser can still use the normal
    // HttpOnly cookie path. LOCAL LAN fallback simply remains unavailable.
  }
}

function isPrivateIPv4Host(hostname: string): boolean {
  const octets = hostname.split(".").map((value) => Number(value));
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}
