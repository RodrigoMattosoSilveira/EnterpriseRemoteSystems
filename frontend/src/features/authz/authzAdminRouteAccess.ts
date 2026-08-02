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
