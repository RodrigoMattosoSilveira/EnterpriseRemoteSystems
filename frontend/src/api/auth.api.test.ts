import { describe, expect, it } from "vitest";
import { normalizeAuthTenantOptions } from "./auth.api";

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
