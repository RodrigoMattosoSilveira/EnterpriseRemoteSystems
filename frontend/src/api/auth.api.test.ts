import { describe, expect, it } from "vitest";
import { normalizeAuthAccounts, normalizeAuthTenantOptions } from "./auth.api";
import type { AuthAccount } from "../types/auth";

const tenant = {
  id: "tenant-default",
  code: "DEFAULT",
  name: "Default Tenant",
  roleCodes: ["EXPENSE_OPERATOR"],
};

describe("normalizeAuthTenantOptions", () => {
  it("preserves the array response used by the current API", () => {
    expect(normalizeAuthTenantOptions([tenant])).toEqual([tenant]);
  });

  it("accepts a paged items response without crashing the workspace", () => {
    expect(normalizeAuthTenantOptions({ items: [tenant], total: 1 })).toEqual([
      tenant,
    ]);
  });

  it("returns an empty collection for a malformed response", () => {
    expect(normalizeAuthTenantOptions({ unexpected: tenant })).toEqual([]);
    expect(normalizeAuthTenantOptions(null)).toEqual([]);
  });

  it("normalizes missing or malformed role codes", () => {
    expect(
      normalizeAuthTenantOptions([
        { id: "tenant-a", code: "A", name: "Alpha" },
        {
          id: "tenant-b",
          code: "B",
          name: "Beta",
          roleCodes: ["TENANT_ADMIN", 42, null],
        },
      ]),
    ).toEqual([
      { id: "tenant-a", code: "A", name: "Alpha", roleCodes: [] },
      {
        id: "tenant-b",
        code: "B",
        name: "Beta",
        roleCodes: ["TENANT_ADMIN"],
      },
    ]);
  });
});

describe("normalizeAuthAccounts", () => {
  const account: AuthAccount = {
    id: "account-person",
    actorId: "actor-a",
    actorKey: "person-a",
    displayName: "Marina Oliveira",
    globalPersonId: "global-person-1",
    globalPersonEmail: "marina@example.test",
    login: "marina.login@example.test",
    active: true,
    actorActive: true,
    mustChangePassword: false,
    createdAt: "2026-08-14T00:00:00Z",
    updatedAt: "2026-08-14T00:00:00Z",
    actors: [
      {
        actorId: "actor-a",
        actorKey: "person-a",
        displayName: "Tenant A identity",
        scope: "TENANT",
        tenantId: "tenant-a",
        personId: "legacy-person-a",
        personName: "Marina Oliveira",
        active: true,
        primary: true,
      },
    ],
  };

  it("fills a missing Account-level Person name from the linked Person Actor projection", () => {
    expect(normalizeAuthAccounts([account])[0]?.globalPersonName).toBe(
      "Marina Oliveira",
    );
  });

  it("preserves the authoritative Account-level Person name when it is already present", () => {
    const normalized = normalizeAuthAccounts([
      { ...account, globalPersonName: "Maria Oliveira" },
    ]);

    expect(normalized[0]?.globalPersonName).toBe("Maria Oliveira");
  });

  it("does not hide an inconsistent multi-Actor Person projection", () => {
    const normalized = normalizeAuthAccounts([
      {
        ...account,
        actors: [
          ...(account.actors ?? []),
          {
            actorId: "actor-b",
            actorKey: "person-b",
            displayName: "Tenant B identity",
            scope: "TENANT",
            tenantId: "tenant-b",
            personId: "legacy-person-b",
            personName: "Different Person",
            active: true,
            primary: false,
          },
        ],
      },
    ]);

    expect(normalized[0]?.globalPersonName).toBeUndefined();
  });

  it("does not invent a Person identity for a GLOBAL/Application account", () => {
    const globalAccount: AuthAccount = {
      ...account,
      id: "global-account",
      globalPersonId: undefined,
      globalPersonName: undefined,
      globalPersonEmail: undefined,
      actors: [
        {
          actorId: "global-actor",
          actorKey: "bootstrap-admin",
          displayName: "Application Administrator",
          scope: "GLOBAL",
          personName: undefined,
          active: true,
          primary: true,
        },
      ],
    };

    expect(
      normalizeAuthAccounts([globalAccount])[0]?.globalPersonName,
    ).toBeUndefined();
  });
});
