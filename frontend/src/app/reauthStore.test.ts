import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRecentReauthentication,
  confirmRecentReauthentication,
  loadRecentReauthentication,
  REAUTH_FRESHNESS_WINDOW_MS,
  REAUTH_STORAGE_KEY,
  saveRecentReauthentication,
} from "./reauthStore";

beforeEach(() => {
  window.localStorage.clear();
});

describe("reauthStore", () => {
  it("stores and loads a fresh reauthentication", () => {
    const now = new Date("2026-06-19T12:00:00.000Z");

    const confirmed = confirmRecentReauthentication(now);

    expect(confirmed).toEqual({
      reauthenticatedAt: "2026-06-19T12:00:00.000Z",
      method: "password",
    });
    expect(loadRecentReauthentication(new Date("2026-06-19T12:05:00.000Z"))).toEqual(confirmed);
  });

  it("rejects stale reauthentication", () => {
    saveRecentReauthentication({
      reauthenticatedAt: "2026-06-19T12:00:00.000Z",
      method: "password",
    });

    expect(
      loadRecentReauthentication(new Date(new Date("2026-06-19T12:00:00.000Z").getTime() + REAUTH_FRESHNESS_WINDOW_MS + 1)),
    ).toBeNull();
  });

  it("rejects future reauthentication", () => {
    saveRecentReauthentication({
      reauthenticatedAt: "2026-06-19T12:10:00.000Z",
      method: "password",
    });

    expect(loadRecentReauthentication(new Date("2026-06-19T12:00:00.000Z"))).toBeNull();
  });

  it("clears stored reauthentication", () => {
    confirmRecentReauthentication(new Date("2026-06-19T12:00:00.000Z"));
    clearRecentReauthentication();

    expect(window.localStorage.getItem(REAUTH_STORAGE_KEY)).toBeNull();
    expect(loadRecentReauthentication(new Date("2026-06-19T12:01:00.000Z"))).toBeNull();
  });
});
