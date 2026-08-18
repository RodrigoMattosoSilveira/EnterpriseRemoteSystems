import { describe, expect, it } from "vitest";
import { defaultAuthorizedRoute, visibleNavigationLinks } from "./navigation";

describe("permission-aware navigation", () => {
  it("routes application and tenant administrators to People", () => {
    expect(defaultAuthorizedRoute(["*"], "APPLICATION")).toBe("/people");
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
      expect.arrayContaining(["/people/person-1", "/collaborators/collaborator-1", "/password/change"]),
    );
    expect(visibleNavigationLinks(permissions, "SELF", identity).map((link) => link.to)).not.toContain(
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
