import { describe, expect, it } from "vitest";
import { canManageTenantRoleDelegation, canReadTenantRoleDelegation } from "./authzAdminRouteAccess";

describe("TENANT_VIEWER authorization administration access", () => {
  it("can read tenant role delegation without mutation authority", () => {
    const actor = { scope: "TENANT", permissions: ["authz.tenant_role_grants.read"] };
    expect(canReadTenantRoleDelegation(actor)).toBe(true);
    expect(canManageTenantRoleDelegation(actor)).toBe(false);
  });

  it("keeps Tenant Administrator role delegation readable and manageable", () => {
    const actor = { scope: "TENANT", permissions: ["authz.tenant_role_grants.manage"] };
    expect(canReadTenantRoleDelegation(actor)).toBe(true);
    expect(canManageTenantRoleDelegation(actor)).toBe(true);
  });
});
