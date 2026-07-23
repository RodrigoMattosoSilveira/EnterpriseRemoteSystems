import { ApiError } from "../api/client";
import {
  loadAuthSession,
  login as loginRequest,
  logout as logoutRequest,
} from "../api/auth.api";
import type { AuthSession, LoginRequest } from "../types/auth";

export type AuthState =
  | { status: "unknown"; session: null; error: null }
  | { status: "loading"; session: AuthSession | null; error: null }
  | { status: "authenticated"; session: AuthSession; error: null }
  | { status: "anonymous"; session: null; error: null }
  | { status: "error"; session: null; error: Error };

type Listener = () => void;

let state: AuthState = { status: "unknown", session: null, error: null };
const listeners = new Set<Listener>();

export function getAuthState(): AuthState {
  return state;
}

export function subscribeAuthState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function initializeAuthSession(): Promise<AuthState> {
  setState({ status: "loading", session: state.session, error: null });
  try {
    const session = await loadAuthSession();
    setState({ status: "authenticated", session, error: null });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setState({ status: "anonymous", session: null, error: null });
    } else {
      setState({
        status: "error",
        session: null,
        error: error instanceof Error ? error : new Error("Unable to load session"),
      });
    }
  }
  return state;
}

export async function authenticate(request: LoginRequest): Promise<AuthSession> {
  setState({ status: "loading", session: null, error: null });
  try {
    const session = await loginRequest(request);
    setState({ status: "authenticated", session, error: null });
    return session;
  } catch (error) {
    setState({
      status: "error",
      session: null,
      error: error instanceof Error ? error : new Error("Unable to sign in"),
    });
    throw error;
  }
}

export async function endAuthSession(): Promise<void> {
  try {
    await logoutRequest();
  } finally {
    setState({ status: "anonymous", session: null, error: null });
  }
}

export function resetAuthStateForTests(): void {
  state = { status: "unknown", session: null, error: null };
  listeners.clear();
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
