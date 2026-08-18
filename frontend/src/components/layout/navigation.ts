export type NavigationLink = {
  label: string;
  to: string;
  anyPermission?: string[];
  applicationOnly?: boolean;
};

export type NavigationIdentity = {
  personId?: string;
  collaboratorId?: string;
};

export const navigationLinks: NavigationLink[] = [
  { label: "People", to: "/people", anyPermission: ["people.read", "people.self.read"] },
  { label: "Collaborators", to: "/collaborators", anyPermission: ["collaborators.read", "collaborators.self.read"] },
  { label: "Expenses", to: "/expenses", anyPermission: ["expenses.read"] },
  { label: "Work periods", to: "/work-periods", anyPermission: ["planning.read"] },
  { label: "Gold production", to: "/gold-production", anyPermission: ["earnings.read", "earnings.create"] },
  { label: "Outstanding receipts", to: "/receipts/outstanding", anyPermission: ["ledger.receipts.read"] },
  { label: "Tenants", to: "/admin/tenants", anyPermission: ["tenants.create", "tenants.update"], applicationOnly: true },
  { label: "Authentication", to: "/admin/authentication", anyPermission: ["authz.manage"], applicationOnly: true },
  { label: "Authorization", to: "/admin/authorization", anyPermission: ["authz.read"] },
  { label: "Audit logs", to: "/admin/audit-logs", anyPermission: ["authz.read"] },
  { label: "Reference data", to: "/admin/reference-data", anyPermission: ["reference_data.manage"] },
  { label: "Gold prices", to: "/admin/gold-prices", anyPermission: ["gold_prices.manage"] },
  { label: "Price list", to: "/admin/price-list-items", anyPermission: ["price_lists.read"] },
  { label: "Account settings", to: "/admin/current-account-settings", anyPermission: ["current_accounts.settings.read"] },
  { label: "Change password", to: "/password/change" },
];

export function visibleNavigationLinks(
  permissions: string[],
  scope: string,
  identity: NavigationIdentity = {},
): NavigationLink[] {
  const wildcard = permissions.includes("*");
  return navigationLinks.flatMap((link) => {
    if (link.applicationOnly && scope !== "APPLICATION") return [];
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
      return permissions.includes("collaborators.self.read") && identity.collaboratorId
        ? [{ ...link, to: `/collaborators/${encodeURIComponent(identity.collaboratorId)}` }]
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
