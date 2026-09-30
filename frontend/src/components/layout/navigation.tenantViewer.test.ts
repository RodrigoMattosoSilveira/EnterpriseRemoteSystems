import { describe, expect, it } from "vitest";
import { visibleNavigationLinks } from "./navigation";

const viewerPermissions = [
  "people.read", "collaborators.read", "expenses.read", "planning.read", "earnings.read",
  "ledger.receipts.read", "authz.tenant_role_grants.read", "authz.tenant_audit.read",
  "reference_data.read", "price_lists.read", "gold_prices.read", "current_accounts.settings.read",
];

describe("TENANT_VIEWER navigation", () => {
  it("exposes read surfaces without application-control-plane administration", () => {
    const links = visibleNavigationLinks(viewerPermissions, "TENANT").map((link) => link.to);
    expect(links).toContain("/people");
    expect(links).toContain("/collaborators");
    expect(links).toContain("/expenses");
    expect(links).toContain("/work-periods");
    expect(links).toContain("/admin/authorization");
    expect(links).toContain("/admin/audit-logs");
    expect(links).toContain("/admin/reference-data");
    expect(links).toContain("/admin/gold-prices");
    expect(links).not.toContain("/admin/tenants");
    expect(links).not.toContain("/admin/authentication");
  });
});
