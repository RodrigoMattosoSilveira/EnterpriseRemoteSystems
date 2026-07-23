import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import * as authApi from "../api/auth.api";
import {
  authenticate,
  endAuthSession,
  getAuthState,
  initializeAuthSession,
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
    });
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
