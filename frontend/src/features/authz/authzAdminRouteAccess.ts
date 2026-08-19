const APPLICATION_SCOPE = "APPLICATION";
const AUTHZ_ADMIN_PERMISSIONS = new Set(["*", "authz.read", "authz.manage"]);

export type AuthzAdminAccessContext = {
  scope?: string;
  permissions?: readonly string[];
};

export function canAccessAuthzAdministration(
  context: AuthzAdminAccessContext | undefined,
): boolean {
  if (context?.scope !== APPLICATION_SCOPE) {
    return false;
  }

  return (context.permissions ?? []).some((permission) =>
    AUTHZ_ADMIN_PERMISSIONS.has(permission),
  );
}

const TENANT_SCOPE = "TENANT";
const TENANT_ROLE_GRANTS_PERMISSION = "authz.tenant_role_grants.manage";

export function canManageTenantRoleDelegation(
  context: AuthzAdminAccessContext | undefined,
): boolean {
  return (
    context?.scope === TENANT_SCOPE &&
    (context.permissions ?? []).includes(TENANT_ROLE_GRANTS_PERMISSION)
  );
}
