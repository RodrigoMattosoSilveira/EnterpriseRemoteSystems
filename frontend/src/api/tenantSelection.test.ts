import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SELECTED_TENANT_ID,
  SELECTED_TENANT_ACCOUNT_STORAGE_KEY,
  SELECTED_TENANT_STORAGE_KEY,
  authorizationRequestContext,
  ensureSelectedTenantStored,
  readSelectedTenantId,
  reconcileSelectedTenantForAccount,
  setSelectedTenantForAccount,
  setSelectedTenantId,
} from "./tenantSelection";

const LEGACY_REQUEST_ACTOR_STORAGE_KEY = "ers.authzAdmin.requestActor";

afterEach(() => {
  window.localStorage.clear();
});

describe("tenant selection", () => {
  it("defaults to the default tenant and persists it", () => {
    ensureSelectedTenantStored(window.localStorage);

    expect(readSelectedTenantId(window.localStorage)).toBe(
      DEFAULT_SELECTED_TENANT_ID,
    );
    expect(window.localStorage.getItem(SELECTED_TENANT_STORAGE_KEY)).toBe(
      DEFAULT_SELECTED_TENANT_ID,
    );
  });

  it("normalizes an explicitly selected tenant", () => {
    expect(setSelectedTenantId(window.localStorage, "  tenant-a  ")).toBe(
      "tenant-a",
    );
    expect(readSelectedTenantId(window.localStorage)).toBe("tenant-a");
  });

  it("migrates only the tenant from legacy request-actor storage", () => {
    window.localStorage.setItem(
      LEGACY_REQUEST_ACTOR_STORAGE_KEY,
      JSON.stringify({
        actorId: "legacy-impersonated-admin",
        tenantId: "tenant-b",
      }),
    );

    ensureSelectedTenantStored(window.localStorage);

    expect(window.localStorage.getItem(SELECTED_TENANT_STORAGE_KEY)).toBe(
      "tenant-b",
    );
    expect(
      window.localStorage.getItem(LEGACY_REQUEST_ACTOR_STORAGE_KEY),
    ).toBeNull();
  });

  it("ignores malformed legacy actor state", () => {
    window.localStorage.setItem(
      LEGACY_REQUEST_ACTOR_STORAGE_KEY,
      "not-json",
    );

    expect(readSelectedTenantId(window.localStorage)).toBe(
      DEFAULT_SELECTED_TENANT_ID,
    );
  });

  it("drops a persisted tenant when a different Authentication Account signs in", () => {
    setSelectedTenantForAccount(window.localStorage, "tenant-a", "account-a");

    reconcileSelectedTenantForAccount(window.localStorage, "account-b");

    expect(window.localStorage.getItem(SELECTED_TENANT_STORAGE_KEY)).toBeNull();
    expect(
      window.localStorage.getItem(SELECTED_TENANT_ACCOUNT_STORAGE_KEY),
    ).toBe("account-b");
  });

  it("preserves a persisted tenant when the same Authentication Account signs in again", () => {
    setSelectedTenantForAccount(window.localStorage, "tenant-a", "account-a");

    reconcileSelectedTenantForAccount(window.localStorage, "account-a");

    expect(readSelectedTenantId(window.localStorage)).toBe("tenant-a");
    expect(
      window.localStorage.getItem(SELECTED_TENANT_ACCOUNT_STORAGE_KEY),
    ).toBe("account-a");
  });

  it("discards an unowned legacy tenant selection at the first authenticated Account boundary", () => {
    window.localStorage.setItem(
      SELECTED_TENANT_STORAGE_KEY,
      "manual30g-tenant-a",
    );

    reconcileSelectedTenantForAccount(window.localStorage, "account-b");

    expect(window.localStorage.getItem(SELECTED_TENANT_STORAGE_KEY)).toBeNull();
    expect(
      window.localStorage.getItem(SELECTED_TENANT_ACCOUNT_STORAGE_KEY),
    ).toBe("account-b");
  });

  it("builds a tenant-only authorization request context", () => {
    expect(authorizationRequestContext(" tenant-c ")).toEqual({
      actorId: "authenticated-session",
      tenantId: "tenant-c",
    });
  });
});
