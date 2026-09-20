import type { TranslationKey } from "../../i18n";

export type NavigationLink = {
  labelKey: TranslationKey;
  to: string;
  anyPermission?: string[];
  applicationOnly?: boolean;
};

export type NavigationIdentity = {
  personId?: string;
  collaboratorId?: string;
  supportLeaseId?: string;
};

export const navigationLinks: NavigationLink[] = [
  { labelKey: "nav.people", to: "/people", anyPermission: ["people.read", "people.self.read"] },
  { labelKey: "nav.collaborators", to: "/collaborators", anyPermission: ["collaborators.read", "collaborators.self.read"] },
  { labelKey: "nav.expenses", to: "/expenses", anyPermission: ["expenses.read"] },
  { labelKey: "nav.workPeriods", to: "/work-periods", anyPermission: ["planning.read"] },
  { labelKey: "nav.goldProduction", to: "/gold-production", anyPermission: ["gold_production.manage"] },
  { labelKey: "nav.outstandingReceipts", to: "/receipts/outstanding", anyPermission: ["ledger.receipts.read", "ledger.receipts.self.read"] },
  { labelKey: "nav.tenants", to: "/admin/tenants", anyPermission: ["tenants.create", "tenants.update"], applicationOnly: true },
  { labelKey: "nav.authentication", to: "/admin/authentication", anyPermission: ["authz.manage"], applicationOnly: true },
  { labelKey: "nav.authorization", to: "/admin/authorization", anyPermission: ["authz.read", "authz.tenant_role_grants.manage"] },
  { labelKey: "nav.supportAccess", to: "/admin/support-access-leases", anyPermission: ["support_access_leases.read"] },
  { labelKey: "nav.auditLogs", to: "/admin/audit-logs", anyPermission: ["authz.read"] },
  { labelKey: "nav.referenceData", to: "/admin/reference-data", anyPermission: ["reference_data.manage"] },
  { labelKey: "nav.goldPrices", to: "/admin/gold-prices", anyPermission: ["gold_prices.manage"] },
  { labelKey: "nav.priceList", to: "/admin/price-list-items", anyPermission: ["price_lists.read"] },
  { labelKey: "nav.accountSettings", to: "/admin/current-account-settings", anyPermission: ["current_accounts.settings.read"] },
  { labelKey: "nav.changePassword", to: "/password/change" },
];

export function visibleNavigationLinks(
  permissions: string[],
  scope: string,
  identity: NavigationIdentity = {},
): NavigationLink[] {
  const wildcard = permissions.includes("*");
  return navigationLinks.flatMap((link) => {
    if (link.applicationOnly && scope !== "APPLICATION") return [];
    if (link.to === "/admin/support-access-leases" && identity.supportLeaseId) return [];
    const visible =
      wildcard ||
      !link.anyPermission ||
      link.anyPermission.some((permission) => permissions.includes(permission));
    if (!visible) return [];

    if (link.to === "/people" && !wildcard && !permissions.includes("people.read")) {
      return permissions.includes("people.self.read") && identity.personId
        ? [{ ...link, to: `/people/${encodeURIComponent(identity.personId)}` }]
        : [];
    }
    if (link.to === "/collaborators" && !wildcard && !permissions.includes("collaborators.read")) {
      return permissions.includes("collaborators.self.read") && identity.personId
        ? [{ ...link, to: "/collaborators" }]
        : [];
    }
    return [link];
  });
}

export function defaultAuthorizedRoute(
  permissions: string[],
  scope: string,
  identity: NavigationIdentity = {},
): string {
  const wildcard = permissions.includes("*");

  // A human Actor linked to a Person always enters ERS through People.
  // Operational roles may add Collaborator/Expense/Planning access, but they
  // must not replace the Person's self-service home.
  if (
    !wildcard &&
    !permissions.includes("people.read") &&
    identity.personId &&
    permissions.includes("people.self.read")
  ) {
    return `/people/${encodeURIComponent(identity.personId)}`;
  }

  const visibleLinks = visibleNavigationLinks(permissions, scope, identity);
  return (
    visibleLinks.find((link) => link.to !== "/password/change")?.to ??
    "/password/change"
  );
}
