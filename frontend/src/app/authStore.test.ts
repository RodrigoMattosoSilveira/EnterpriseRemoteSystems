import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { notifyAuthenticationRequired } from "./authEvents";
import * as authApi from "../api/auth.api";
import {
  authenticate,
  endAuthSession,
  getAuthState,
  initializeAuthSession,
  revalidateAuthSession,
  resetAuthStateForTests,
  subscribeAuthState,
} from "./authStore";
import type { AuthSession } from "../types/auth";

const session: AuthSession = {
  accountId: "account-1",
  actorId: "actor-record-1",
  actorKey: "admin@example.com",
  displayName: "Admin",
  login: "admin@example.com",
  mustChangePassword: false,
  expiresAt: "2026-07-22T00:00:00Z",
};

afterEach(() => {
  vi.restoreAllMocks();
  resetAuthStateForTests();
});

describe("authStore", () => {
  it("loads an existing authenticated session", async () => {
    vi.spyOn(authApi, "loadAuthSession").mockResolvedValue(session);

    await initializeAuthSession();

    expect(getAuthState()).toEqual({
      status: "authenticated",
      session,
      error: null,
      reason: null,
    });
  });

  it("treats an HTTP 401 session response as anonymous", async () => {
    vi.spyOn(authApi, "loadAuthSession").mockRejectedValue(
      new ApiError({ message: "Authentication required", status: 401 }),
    );

    await initializeAuthSession();

    expect(getAuthState()).toEqual({
      status: "anonymous",
      session: null,
      error: null,
      reason: null,
    });
  });

  it("preserves an inactive-account reason during initial session loading", async () => {
    vi.spyOn(authApi, "loadAuthSession").mockRejectedValue(
      new ApiError({
        message: "The authentication account is inactive",
        status: 401,
        code: "account_inactive",
      }),
    );

    await initializeAuthSession();

    expect(getAuthState()).toEqual({
      status: "anonymous",
      session: null,
      error: null,
      reason: "inactive",
    });
  });

  it("preserves an expired-session reason during initial session loading", async () => {
    vi.spyOn(authApi, "loadAuthSession").mockRejectedValue(
      new ApiError({
        message: "The authenticated session has expired",
        status: 401,
        code: "session_expired",
      }),
    );

    await initializeAuthSession();

    expect(getAuthState()).toEqual({
      status: "anonymous",
      session: null,
      error: null,
      reason: "expired",
    });
  });

  it("moves an authenticated session to expired when a protected request returns 401", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue(session);
    await authenticate({ login: "admin@example.com", password: "password" });

    notifyAuthenticationRequired();

    expect(getAuthState()).toEqual({
      status: "anonymous",
      session: null,
      error: null,
      reason: "expired",
    });
  });


  it("invalidates an authenticated browser state when account revalidation reports inactive", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue(session);
    vi.spyOn(authApi, "loadAuthSession").mockRejectedValue(
      new ApiError({
        message: "The authentication account is inactive",
        status: 401,
        code: "account_inactive",
      }),
    );
    await authenticate({ login: "admin@example.com", password: "password" });

    await revalidateAuthSession();

    expect(getAuthState()).toEqual({
      status: "anonymous",
      session: null,
      error: null,
      reason: "inactive",
    });
  });

  it("deduplicates concurrent authenticated-session revalidation", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue(session);
    const loadSession = vi.spyOn(authApi, "loadAuthSession").mockResolvedValue(session);
    await authenticate({ login: "admin@example.com", password: "password" });

    await Promise.all([revalidateAuthSession(), revalidateAuthSession()]);

    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(getAuthState().status).toBe("authenticated");
  });

  it("publishes login and logout state changes", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue(session);
    vi.spyOn(authApi, "logout").mockResolvedValue(undefined);
    const listener = vi.fn();
    const unsubscribe = subscribeAuthState(listener);

    await authenticate({ login: "admin@example.com", password: "password" });
    expect(getAuthState().status).toBe("authenticated");

    await endAuthSession();
    expect(getAuthState().status).toBe("anonymous");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
