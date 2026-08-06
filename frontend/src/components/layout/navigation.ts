export type NavigationLink = {
  label: string;
  to: string;
  anyPermission?: string[];
  applicationOnly?: boolean;
};

export const navigationLinks: NavigationLink[] = [
  { label: "People", to: "/people", anyPermission: ["people.read", "people.self.read"] },
  { label: "Collaborators", to: "/collaborators", anyPermission: ["collaborators.read", "collaborators.self.read"] },
  { label: "Expenses", to: "/expenses", anyPermission: ["expenses.read"] },
  { label: "Work periods", to: "/work-periods", anyPermission: ["planning.read"] },
  { label: "Gold production", to: "/gold-production", anyPermission: ["earnings.read", "earnings.create"] },
  { label: "Outstanding receipts", to: "/receipts/outstanding", anyPermission: ["ledger.receipts.read", "ledger.receipts.self.read"] },
  { label: "Tenants", to: "/admin/tenants", anyPermission: ["tenants.create", "tenants.update"], applicationOnly: true },
  { label: "Authentication", to: "/admin/authentication", anyPermission: ["authz.manage"], applicationOnly: true },
  { label: "Authorization", to: "/admin/authorization", anyPermission: ["authz.read"] },
  { label: "Audit logs", to: "/admin/audit-logs", anyPermission: ["authz.read"] },
  { label: "Reference data", to: "/admin/reference-data", anyPermission: ["reference_data.manage"] },
  { label: "Gold prices", to: "/admin/gold-prices", anyPermission: ["expenses.create", "expenses.update"] },
  { label: "Price list", to: "/admin/price-list-items", anyPermission: ["price_lists.read"] },
  { label: "Account settings", to: "/admin/current-account-settings", anyPermission: ["current_accounts.settings.read"] },
  { label: "Change password", to: "/password/change" },
];

export function visibleNavigationLinks(
  permissions: string[],
  scope: string,
): NavigationLink[] {
  const wildcard = permissions.includes("*");
  return navigationLinks.filter((link) => {
    if (link.applicationOnly && scope !== "APPLICATION") return false;
    return (
      wildcard ||
      !link.anyPermission ||
      link.anyPermission.some((permission) => permissions.includes(permission))
    );
  });
}

export function defaultAuthorizedRoute(
  permissions: string[],
  scope: string,
): string {
  const visibleLinks = visibleNavigationLinks(permissions, scope);
  return (
    visibleLinks.find((link) => link.to !== "/password/change")?.to ??
    "/password/change"
  );
}
