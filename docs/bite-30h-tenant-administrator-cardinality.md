# Bite 30H — Tenant Administrator Cardinality

## Purpose

Bite 30H bounds Tenant Administrator authority in two directions:

1. a Tenant may have enough administrators for operational redundancy, but never an unbounded privileged set; and
2. one global Person may not simultaneously administer multiple Tenants.

The resulting cardinality is:

- **Tenant -> active `TENANT_ADMIN` Role Grants: 0..2**
- **Person -> Tenant administered: 0..1 across all Tenants**

If two Tenant Administrator slots are occupied, they must belong to two distinct global Persons.

## Why two Tenant Administrators

A strict one-administrator model creates an avoidable operational bottleneck when the administrator is unavailable, changing responsibilities, or transferring authority. Two slots permit a primary/backup arrangement and a safe replacement overlap:

1. Tenant has one Tenant Administrator.
2. Assign a second distinct Person.
3. Verify the new administrator can operate.
4. Revoke the departing administrator if the second assignment was a replacement.

A third active assignment is prohibited.

## Cross-Tenant Person isolation

Tenant Actors are Tenant-scoped, but Person identity is global. Creating a second Tenant Actor must therefore never allow the same Person to bypass the cardinality rule.

If Person P already has an active `TENANT_ADMIN` grant in Tenant A, any active `TENANT_ADMIN` grant for Person P in Tenant B is rejected, even when Tenant B uses a different Actor record.

Ordinary memberships, Collaborator Journeys, self-service access, and non-administrator delegated Roles in other Tenants remain unaffected.

The canonical global Person for this rule is `person_tenant_memberships.person_id`, reached through the Tenant Actor's `auth_account_actors.membership_id`. The legacy `authz_actors.person_id` is Tenant-local and must not be used to compare Person identity across Tenants.

## Role Grant versus Actor availability

Cardinality belongs to the active `TENANT_ADMIN` **Role Grant**. Deactivating its Actor does not silently revoke authority or release the slot. The grant must be explicitly revoked before the slot becomes available.

Tenant operational readiness remains based on whether at least one assigned administrator Actor is currently active. The API therefore distinguishes active administrator Actors from active administrator assignment slots.

## Enforcement layers

Bite 30H enforces the invariant at three layers:

- authorization grant validation, covering Application Authorization and Tenant Management workflows;
- user-interface eligibility/capacity guidance to prevent invalid requests before submission;
- SQLite migration guards/triggers so concurrent requests or direct SQL cannot bypass the rule.

Upgrade migration does not choose a winner when legacy data already violates a cardinality rule. It fails explicitly so administrators can reconcile the conflicting grants deliberately.

## Offline upgrade reconciliation

The `000062_tenant_administrator_cardinality` migration deliberately stops when an existing environment violates the new cardinality rules. Because the API cannot start while that migration is blocked, ERS provides an explicit offline reconciliation path for server environments.

1. Stop the application stack without deleting volumes: `make server-down ENV=<environment>`.
2. Run `make server-bite30h-admin-report ENV=<environment>` to list every active `TENANT_ADMIN` Role Grant and the exact preflight violations.
3. Select the Role Grant IDs whose Tenant Administrator authority must be removed. ERS never chooses these grants automatically.
4. Run `make server-bite30h-admin-revoke ENV=<environment> GRANT_IDS='grant-id-1 grant-id-2'`. The command creates a timestamped SQLite backup before mutation, deactivates only the explicitly named active `TENANT_ADMIN` Role Grants, appends an immutable authorization audit event for each revocation, and prints the cardinality report again.
5. Redeploy. Migration `000062` remains the final authority and will continue to fail if any violation remains.

Actor deactivation is not an offline reconciliation mechanism and does not release a Tenant Administrator assignment slot. The Role Grant itself must be explicitly revoked.

## Out of scope

The previously planned removal of Application Administrator standing Tenant-data compatibility and Tenant Support Access Lease is **not** implemented by this Bite 30H. That control-plane cutover remains deferred to a dedicated later bite.
