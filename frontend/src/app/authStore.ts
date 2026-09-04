import { ApiError } from "../api/client";
import {
  loadAuthSession,
  login as loginRequest,
  logout as logoutRequest,
} from "../api/auth.api";
import type { AuthSession, LoginRequest } from "../types/auth";
import { reconcileSelectedTenantForAccount } from "../api/tenantSelection";
import { subscribeAuthenticationRequired } from "./authEvents";

export type AuthState =
  | { status: "unknown"; session: null; error: null; reason: null }
  | { status: "loading"; session: AuthSession | null; error: null; reason: null }
  | { status: "authenticated"; session: AuthSession; error: null; reason: null }
  | { status: "anonymous"; session: null; error: null; reason: "signed-out" | "expired" | "inactive" | null }
  | { status: "error"; session: null; error: Error; reason: null };

type Listener = () => void;

let state: AuthState = { status: "unknown", session: null, error: null, reason: null };
let revalidationPromise: Promise<AuthState> | null = null;
let authTransitionRevision = 0;
const listeners = new Set<Listener>();

export function getAuthState(): AuthState {
  return state;
}

export function subscribeAuthState(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function initializeAuthSession(): Promise<AuthState> {
  const revision = ++authTransitionRevision;
  setState({ status: "loading", session: state.session, error: null, reason: null });
  try {
    const session = await loadAuthSession();
    if (revision === authTransitionRevision) {
      if (session) reconcileBrowserTenantSelection(session.accountId);
      setState(
        session
          ? { status: "authenticated", session, error: null, reason: null }
          : { status: "anonymous", session: null, error: null, reason: null },
      );
    }
  } catch (error) {
    if (revision !== authTransitionRevision) return state;

    if (error instanceof ApiError && error.status === 401) {
      setState({
        status: "anonymous",
        session: null,
        error: null,
        reason: authenticationReason(error),
      });
    } else {
      setState({
        status: "error",
        session: null,
        error: error instanceof Error ? error : new Error("Unable to load session"),
        reason: null,
      });
    }
  }
  return state;
}

export async function revalidateAuthSession(): Promise<AuthState> {
  if (state.status !== "authenticated") return state;
  if (revalidationPromise) return revalidationPromise;

  const accountId = state.session.accountId;
  revalidationPromise = (async () => {
    try {
      const session = await loadAuthSession();
      if (state.status === "authenticated" && state.session.accountId === accountId) {
        if (session) reconcileBrowserTenantSelection(session.accountId);
        setState(
          session
            ? { status: "authenticated", session, error: null, reason: null }
            : { status: "anonymous", session: null, error: null, reason: null },
        );
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState({
          status: "anonymous",
          session: null,
          error: null,
          reason: authenticationReason(error),
        });
      } else if (state.status === "authenticated" && state.session.accountId === accountId) {
        setState({
          status: "error",
          session: null,
          error: error instanceof Error ? error : new Error("Unable to verify session"),
          reason: null,
        });
      }
    } finally {
      revalidationPromise = null;
    }
    return state;
  })();

  return revalidationPromise;
}

export async function authenticate(request: LoginRequest): Promise<AuthSession> {
  const revision = ++authTransitionRevision;
  setState({ status: "loading", session: null, error: null, reason: null });
  try {
    const session = await loginRequest(request);
    if (revision === authTransitionRevision) {
      reconcileBrowserTenantSelection(session.accountId);
      setState({ status: "authenticated", session, error: null, reason: null });
    }
    return session;
  } catch (error) {
    if (revision === authTransitionRevision) {
      setState({
        status: "error",
        session: null,
        error: error instanceof Error ? error : new Error("Unable to sign in"),
        reason: null,
      });
    }
    throw error;
  }
}

export async function endAuthSession(): Promise<void> {
  const revision = ++authTransitionRevision;
  try {
    await logoutRequest();
  } finally {
    if (revision === authTransitionRevision) {
      setState({ status: "anonymous", session: null, error: null, reason: "signed-out" });
    }
  }
}

export function resetAuthStateForTests(): void {
  state = { status: "unknown", session: null, error: null, reason: null };
  listeners.clear();
  revalidationPromise = null;
  authTransitionRevision = 0;
}

function authenticationReason(
  error: ApiError,
): "expired" | "inactive" | null {
  if (error.code === "session_expired") return "expired";
  if (
    error.code === "account_inactive" ||
    error.code === "account_security_suspended" ||
    error.code === "account_operationally_inactive" ||
    error.code === "actor_inactive"
  ) {
    return "inactive";
  }
  return null;
}

function reconcileBrowserTenantSelection(accountId: string): void {
  if (typeof window === "undefined") return;
  reconcileSelectedTenantForAccount(window.localStorage, accountId);
}

function setState(next: AuthState): void {
  state = next;
  emitChange();
}

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

subscribeAuthenticationRequired((reason) => {
  if (state.status === "authenticated" || state.status === "loading") {
    authTransitionRevision += 1;
    setState({ status: "anonymous", session: null, error: null, reason });
  }
});
