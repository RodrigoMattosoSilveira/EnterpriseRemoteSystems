# Bite 28A — Tenant Management

Bite 28A introduced the application-admin tenant lifecycle and tenant-administrator assignment workflow. Bite 28C now derives actor identity from the authenticated session while retaining the tenant ID only as a server-validated selection hint.

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

- `ACTIVE_READY`: the tenant is active and has at least one active Actor with an active `TENANT_ADMIN` grant for that tenant.
- `ACTIVE_NO_TENANT_ADMIN`: the tenant is active but has no currently active Tenant Administrator Actor. An inactive Actor can still retain an active `TENANT_ADMIN` assignment slot until that grant is explicitly revoked.
- `INACTIVE`: the tenant is inactive.

## Inactive tenant enforcement

For an inactive selected tenant:

- `GET`, `HEAD`, and `OPTIONS` requests remain available so historical records can be read for audit.
- Normal tenant-scoped `POST`, `PUT`, `PATCH`, and `DELETE` requests return HTTP `423` with code `tenant_inactive`.
- Tenant and authorization administration routes remain available to application administrators so the tenant can be repaired, assigned, or reactivated.

## Tenant administrator assignment

Bite 30H adds two cardinality invariants:

- each Tenant may have **zero, one, or two** active `TENANT_ADMIN` Role Grants;
- one Person may hold active `TENANT_ADMIN` authority in **only one Tenant at a time**.

When a Tenant uses both slots, the grants must belong to two distinct global Persons. This permits operational redundancy without allowing one privileged Person to bridge multiple Tenants. A third active assignment in the same Tenant is rejected. Assigning a second Tenant Actor for the same Person is also rejected, even inside the same Tenant.

The tenant detail page lists persisted authorization Actors and reports assignment capacity separately from currently active administrator Actors. Assigning an Actor creates or reactivates a tenant-scoped `TENANT_ADMIN` Role Grant. Inactive Actors cannot be newly assigned. Revocation deactivates only that Role Grant; it does not delete or deactivate the Actor. Deactivating an Actor does **not** release its administrator slot; the active grant must be explicitly revoked.

A Tenant with one administrator may assign a second distinct Person before revoking a departing administrator, allowing a safe overlap/handoff without an administrative coverage gap.

## Authenticated scope boundary

The browser no longer transports actor identity. The HTTP-only authentication session identifies the Authentication Account. `X-Tenant-ID` remains only as a selected-tenant hint, and the server resolves the Account-owned active Actor for that immutable tenant ID. For ordinary Accounts, the Actor must be backed by the same tenant's ACTIVE Person–Tenant Membership.

Tenant URLs and tenant-selection requests must use the tenant's immutable `id`; the human-readable tenant `code` is not an API scope identifier. `/admin/tenants/:id` continues to display the tenant identifier for administrative and diagnostic use.
