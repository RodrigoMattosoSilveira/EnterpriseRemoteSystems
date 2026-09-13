import { describe, expect, it } from "vitest";
import { normalizeAuthAccounts, normalizeAuthTenantOptions } from "./auth.api";
import type { AuthAccount } from "../types/auth";

const tenant = {
  id: "tenant-default",
  code: "DEFAULT",
  name: "Default Tenant",
  roleCodes: ["EXPENSE_OPERATOR"],
  contextKind: "TENANT_IDENTITY" as const,
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

  it("preserves Account-owned Actor context advertised for tenant selection", () => {
    expect(
      normalizeAuthTenantOptions([
        {
          ...tenant,
          actorRecordId: "actor-tenant-default",
          actorKey: "person:global-person::tenant::tenant-default",
          actorScope: "TENANT",
          contextKind: "TENANT_IDENTITY",
          membershipId: "membership-tenant-default",
        },
      ]),
    ).toEqual([
      {
        ...tenant,
        actorRecordId: "actor-tenant-default",
        actorKey: "person:global-person::tenant::tenant-default",
        actorScope: "TENANT",
        membershipId: "membership-tenant-default",
      },
    ]);
  });


  it("preserves support-lease provenance for temporary Tenant contexts", () => {
    expect(
      normalizeAuthTenantOptions([
        {
          ...tenant,
          actorRecordId: "application-actor-record",
          actorKey: "e2e-application-admin",
          actorScope: "APPLICATION",
          contextKind: "SUPPORT_LEASE",
          supportLeaseId: "lease-support-123",
          supportLeaseExpiresAt: "2026-09-13T20:00:00Z",
        },
      ]),
    ).toEqual([
      {
        ...tenant,
        actorRecordId: "application-actor-record",
        actorKey: "e2e-application-admin",
        actorScope: "APPLICATION",
        contextKind: "SUPPORT_LEASE",
        supportLeaseId: "lease-support-123",
        supportLeaseExpiresAt: "2026-09-13T20:00:00Z",
      },
    ]);
  });


  it("rejects ordinary Tenant identities when Global administration is present", () => {
    expect(
      normalizeAuthTenantOptions([
        {
          id: "*",
          code: "GLOBAL",
          name: "Global administration",
          roleCodes: ["APPLICATION_ADMIN"],
          actorRecordId: "application-actor-record",
          actorKey: "e2e-application-admin",
          actorScope: "APPLICATION",
          contextKind: "GLOBAL",
        },
        {
          id: "e2e-support-lease-tenant",
          code: "E2ESUPPORT",
          name: "E2E Support Access Lease",
          roleCodes: ["TENANT_ADMIN"],
          actorRecordId: "ordinary-tenant-actor",
          actorKey: "ordinary-tenant-actor",
          actorScope: "TENANT",
          contextKind: "TENANT_IDENTITY",
          membershipId: "ordinary-membership",
        },
      ]),
    ).toEqual([
      {
        id: "*",
        code: "GLOBAL",
        name: "Global administration",
        roleCodes: ["APPLICATION_ADMIN"],
        actorRecordId: "application-actor-record",
        actorKey: "e2e-application-admin",
        actorScope: "APPLICATION",
        contextKind: "GLOBAL",
      },
    ]);
  });

  it("keeps only lease-provenanced Tenant contexts beside Global administration", () => {
    expect(
      normalizeAuthTenantOptions([
        {
          id: "*",
          code: "GLOBAL",
          name: "Global administration",
          roleCodes: ["APPLICATION_ADMIN"],
          actorRecordId: "application-actor-record",
          actorKey: "e2e-application-admin",
          actorScope: "APPLICATION",
          contextKind: "GLOBAL",
        },
        {
          id: "e2e-support-lease-tenant",
          code: "E2ESUPPORT",
          name: "E2E Support Access Lease",
          roleCodes: ["APPLICATION_ADMIN"],
          actorRecordId: "application-actor-record",
          actorKey: "e2e-application-admin",
          actorScope: "APPLICATION",
          contextKind: "SUPPORT_LEASE",
          supportLeaseId: "lease-support-123",
          supportLeaseExpiresAt: "2026-09-13T20:00:00Z",
        },
        {
          id: "tenant-without-provenance",
          code: "BAD",
          name: "Malformed Tenant Context",
          roleCodes: ["APPLICATION_ADMIN"],
          actorRecordId: "application-actor-record",
          actorKey: "e2e-application-admin",
          actorScope: "APPLICATION",
          contextKind: "SUPPORT_LEASE",
        },
      ]),
    ).toEqual([
      {
        id: "*",
        code: "GLOBAL",
        name: "Global administration",
        roleCodes: ["APPLICATION_ADMIN"],
        actorRecordId: "application-actor-record",
        actorKey: "e2e-application-admin",
        actorScope: "APPLICATION",
        contextKind: "GLOBAL",
      },
      {
        id: "e2e-support-lease-tenant",
        code: "E2ESUPPORT",
        name: "E2E Support Access Lease",
        roleCodes: ["APPLICATION_ADMIN"],
        actorRecordId: "application-actor-record",
        actorKey: "e2e-application-admin",
        actorScope: "APPLICATION",
        contextKind: "SUPPORT_LEASE",
        supportLeaseId: "lease-support-123",
        supportLeaseExpiresAt: "2026-09-13T20:00:00Z",
      },
    ]);
  });

  it("rejects a Tenant identity that spoofs lease provenance beside Global administration", () => {
    expect(
      normalizeAuthTenantOptions([
        {
          id: "*",
          code: "GLOBAL",
          name: "Global administration",
          roleCodes: ["APPLICATION_ADMIN"],
          actorRecordId: "application-actor-record",
          actorKey: "e2e-application-admin",
          actorScope: "APPLICATION",
          contextKind: "GLOBAL",
        },
        {
          id: "e2e-support-lease-tenant",
          code: "E2ESUPPORT",
          name: "E2E Support Access Lease",
          roleCodes: ["APPLICATION_ADMIN"],
          actorRecordId: "application-actor-record",
          actorKey: "e2e-application-admin",
          actorScope: "APPLICATION",
          contextKind: "TENANT_IDENTITY",
          supportLeaseId: "lease-spoofed",
          supportLeaseExpiresAt: "2026-09-13T20:00:00Z",
        },
      ]),
    ).toEqual([
      {
        id: "*",
        code: "GLOBAL",
        name: "Global administration",
        roleCodes: ["APPLICATION_ADMIN"],
        actorRecordId: "application-actor-record",
        actorKey: "e2e-application-admin",
        actorScope: "APPLICATION",
        contextKind: "GLOBAL",
      },
    ]);
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
        },
      ],
    };

    expect(
      normalizeAuthAccounts([globalAccount])[0]?.globalPersonName,
    ).toBeUndefined();
  });
});
