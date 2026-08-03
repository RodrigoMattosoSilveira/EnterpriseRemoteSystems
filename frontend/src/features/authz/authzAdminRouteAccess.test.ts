import { describe, expect, it } from "vitest";
import { canAccessAuthzAdministration } from "./authzAdminRouteAccess";

describe("canAccessAuthzAdministration", () => {
  it.each(["authz.read", "authz.manage", "*"])(
    "allows application-scoped %s access",
    (permission) => {
      expect(
        canAccessAuthzAdministration({
          scope: "APPLICATION",
          permissions: [permission],
        }),
      ).toBe(true);
    },
  );

  it.each(["authz.read", "authz.manage", "*"])(
    "denies tenant-scoped %s access",
    (permission) => {
      expect(
        canAccessAuthzAdministration({
          scope: "TENANT",
          permissions: [permission],
        }),
      ).toBe(false);
    },
  );

  it("denies unrelated application permissions", () => {
    expect(
      canAccessAuthzAdministration({
        scope: "APPLICATION",
        permissions: ["expenses.create"],
      }),
    ).toBe(false);
  });

  it("denies unresolved authorization context", () => {
    expect(canAccessAuthzAdministration(undefined)).toBe(false);
    expect(canAccessAuthzAdministration({ scope: "APPLICATION" })).toBe(false);
  });
});
