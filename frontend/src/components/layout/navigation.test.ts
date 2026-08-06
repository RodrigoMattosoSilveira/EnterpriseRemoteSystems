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

  it("uses Change password when the actor has no operational navigation permission", () => {
    expect(defaultAuthorizedRoute([], "TENANT")).toBe("/password/change");
  });

  it("does not expose application-only links to tenant-scoped actors", () => {
    const paths = visibleNavigationLinks(["*"], "TENANT").map((link) => link.to);
    expect(paths).not.toContain("/admin/tenants");
    expect(paths).not.toContain("/admin/authentication");
  });
});
