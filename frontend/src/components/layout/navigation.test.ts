import { describe, expect, it } from "vitest";
import { defaultAuthorizedRoute, visibleNavigationLinks } from "./navigation";

describe("permission-aware navigation", () => {
  it("routes the GLOBAL Application Administrator to the control plane and Tenant administrators to People", () => {
    expect(
      defaultAuthorizedRoute(
        ["authz.read", "authz.manage", "tenants.read", "tenants.create", "tenants.update"],
        "APPLICATION",
      ),
    ).toBe("/admin/tenants");
    expect(defaultAuthorizedRoute(["*"], "TENANT")).toBe("/people");
  });

  it("routes earnings and expense operators to Collaborators", () => {
    expect(
      defaultAuthorizedRoute(
        ["collaborators.read", "planning.read", "earnings.read"],
        "TENANT",
      ),
    ).toBe("/collaborators");
    expect(
      defaultAuthorizedRoute(
        ["collaborators.read", "expenses.read", "price_lists.read"],
        "TENANT",
      ),
    ).toBe("/collaborators");
  });

  it("restricts Gold Prices administration to actors with gold_prices.manage", () => {
    const expenseOperatorPaths = visibleNavigationLinks(
      [
        "collaborators.read",
        "expenses.read",
        "expenses.create",
        "price_lists.read",
        "price_lists.create",
        "price_lists.update",
      ],
      "TENANT",
    ).map((link) => link.to);
    expect(expenseOperatorPaths).not.toContain("/admin/gold-prices");

    const tenantAdminPaths = visibleNavigationLinks(
      ["people.read", "gold_prices.manage"],
      "TENANT",
    ).map((link) => link.to);
    expect(tenantAdminPaths).toContain("/admin/gold-prices");
  });

  it("restricts Gold Production administration to administrators", () => {
    const earningsOperatorPaths = visibleNavigationLinks(
      ["collaborators.read", "planning.read", "earnings.read", "earnings.create"],
      "TENANT",
    ).map((link) => link.to);
    expect(earningsOperatorPaths).not.toContain("/gold-production");

    const tenantAdminPaths = visibleNavigationLinks(
      ["people.read", "gold_production.manage"],
      "TENANT",
    ).map((link) => link.to);
    expect(tenantAdminPaths).toContain("/gold-production");

    const applicationAdminPaths = visibleNavigationLinks(
      ["authz.read", "authz.manage", "tenants.read", "tenants.create", "tenants.update"],
      "APPLICATION",
    ).map((link) => link.to);
    expect(applicationAdminPaths).not.toContain("/gold-production");
    expect(applicationAdminPaths).not.toContain("/people");
    expect(applicationAdminPaths).not.toContain("/expenses");
    expect(applicationAdminPaths).toContain("/admin/tenants");
    expect(applicationAdminPaths).toContain("/admin/authentication");
  });

  it("shows tenant Authorization navigation for tenant role delegation managers", () => {
    const tenantAdminPaths = visibleNavigationLinks(
      ["people.read", "authz.tenant_role_grants.manage"],
      "TENANT",
    ).map((link) => link.to);
    expect(tenantAdminPaths).toContain("/admin/authorization");

    const expenseOperatorPaths = visibleNavigationLinks(
      ["collaborators.read", "expenses.read"],
      "TENANT",
    ).map((link) => link.to);
    expect(expenseOperatorPaths).not.toContain("/admin/authorization");
  });

  it("uses Change password when the actor has no operational navigation permission", () => {
    expect(defaultAuthorizedRoute([], "TENANT")).toBe("/password/change");
  });


  it("routes self-service actors to their own records instead of tenant-wide lists", () => {
    const permissions = [
      "people.self.read",
      "collaborators.self.read",
      "current_accounts.self.summary.read",
      "ledger.receipts.self.read",
    ];
    const identity = { personId: "person-1", collaboratorId: "collaborator-1" };

    expect(defaultAuthorizedRoute(permissions, "SELF", identity)).toBe(
      "/people/person-1",
    );
    expect(visibleNavigationLinks(permissions, "SELF", identity).map((link) => link.to)).toEqual(
      expect.arrayContaining(["/people/person-1", "/collaborators", "/password/change"]),
    );
    expect(visibleNavigationLinks(permissions, "SELF", identity).map((link) => link.to)).toContain(
      "/receipts/outstanding",
    );
  });

  it("prioritizes the Person self-service home over Collaborator operator access", () => {
    expect(
      defaultAuthorizedRoute(
        [
          "people.self.read",
          "collaborators.self.read",
          "collaborators.read",
          "expenses.read",
        ],
        "TENANT",
        { personId: "person-operator", collaboratorId: "collaborator-operator" },
      ),
    ).toBe("/people/person-operator");
  });

  it("does not expose a self-service collection link without the linked identity", () => {
    expect(visibleNavigationLinks(["people.self.read"], "SELF").map((link) => link.to)).toEqual([
      "/password/change",
    ]);
  });

  it("does not expose application-only links to tenant-scoped actors", () => {
    const paths = visibleNavigationLinks(["*"], "TENANT").map((link) => link.to);
    expect(paths).not.toContain("/admin/tenants");
    expect(paths).not.toContain("/admin/authentication");
  });
});
