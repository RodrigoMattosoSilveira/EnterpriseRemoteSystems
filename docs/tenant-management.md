# Bite 28A — Tenant Management

Bite 28A introduces an application-admin tenant lifecycle and tenant-administrator assignment workflow while preserving the temporary request-actor headers used before authenticated sessions are introduced.

## Administration pages

- `/admin/tenants` lists the tenant catalog and creates tenants.
- `/admin/tenants/:id` edits tenant identity, activates or deactivates a tenant, and manages tenant administrators.

## Tenant lifecycle rules

- Only an application-scoped actor with the required tenant permission may list the full tenant catalog, create tenants, edit tenant identity, change tenant status, or manage tenant administrators.
- Tenant-scoped administrators may read their own tenant record but cannot list, create, edit, deactivate, or assign administrators for tenants.
- Tenant codes are normalized to uppercase and must be unique.
- Tenant records cannot be hard-deleted. API deletion returns `tenant_deletion_not_allowed`, and migration `000040_protect_tenant_history` installs a database trigger that rejects direct SQL deletion.
- Deactivation preserves all historical records.

## Operational status

The API derives one of three status values:

- `ACTIVE_READY`: the tenant is active and has at least one active actor with an active `TENANT_ADMIN` grant for that tenant.
- `ACTIVE_NO_TENANT_ADMIN`: the tenant is active but has no active tenant administrator.
- `INACTIVE`: the tenant is inactive.

## Inactive tenant enforcement

For an inactive selected tenant:

- `GET`, `HEAD`, and `OPTIONS` requests remain available so historical records can be read for audit.
- Normal tenant-scoped `POST`, `PUT`, `PATCH`, and `DELETE` requests return HTTP `423` with code `tenant_inactive`.
- Tenant and authorization administration routes remain available to application administrators so the tenant can be repaired, assigned, or reactivated.

## Tenant administrator assignment

The tenant detail page lists persisted authorization actors. Assigning an actor creates or reactivates a tenant-scoped `TENANT_ADMIN` role grant. Inactive actors cannot be assigned. Revocation deactivates only that tenant role grant; it does not delete or deactivate the actor.

## Scope boundary

Bite 28A manages tenant lifecycle and access grants. The browser still transports `X-Actor-ID` and `X-Tenant-ID`. Bite 28B and Bite 28C will replace that transport with login-backed sessions and derive actor identity from authentication.

## Tenant and actor identifiers

Tenant access requests must use two persisted identifiers rather than values reconstructed from labels:

- `X-Actor-ID` uses the actor's exact `actorKey`. The actor key is not the authorization actor record ID and must not receive an additional `collaborator-` prefix.
- `X-Tenant-ID` and `/tenants/:id` use the tenant's immutable `id`. The human-readable tenant `code` is not an API scope identifier.

After a tenant administrator is assigned, `/admin/tenants/:id` displays both identifiers and generates the complete tenant-access verification command. This command is the authoritative manual-test source for the temporary header transport used before Bite 28C.
