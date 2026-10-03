# Bite 32.5 — E2E, Migration/Authorization Coverage, and Release Hardening

Bite 32.5 is the release-hardening delivery for the Bite 32 feature set. It does not add another database migration after `000071_cross_tenant_delegated_role_isolation.up.sql`; instead it makes the already-delivered Journey history, Work/Credit evidence, and cross-Tenant Role isolation behavior part of deterministic non-Production E2E and release evidence.

## Deterministic E2E fixtures

`provision-e2e-admin` now provisions two Bite 32-specific fixtures in non-Production environments:

- a Person in the default Tenant with a current Journey plus a closed Journey containing canonical recognized work, posted accrual evidence, earning credit, and payout history;
- a global Person with baseline Membership/Collaborator participation in two Tenants and no initial non-baseline Tenant Role, so Role-isolation tests can add and remove authority deterministically.

The fixture provisioning remains idempotent and Production continues to exclude deterministic Tenant fixtures.

## Browser coverage

`frontend/tests/e2e/bite32-release-hardening.spec.ts` proves the integrated browser workflows:

1. a Tenant Administrator can see current and closed Journey history for a Person in the selected Tenant;
2. that Person can open the closed Journey through self-service and see durable Work and Credit Evidence;
3. a second Tenant cannot provision a non-baseline Tenant Role while any such Role remains in the first Tenant, partial removal remains blocked, complete explicit removal releases eligibility, and neither the UI nor API response discloses the other Tenant or Role.

## Migration and authorization coverage

Migration `000071` remains the final migration for Bite 32. Its migration tests and `verify-migrated-db.sh` checks remain authoritative for direct-database INSERT/reactivation/unsuspension protection, fail-closed quarantine of pre-existing conflicts, trigger presence, and zero Person-level effective cross-Tenant `TENANT`-Role conflicts.

Authorization unit coverage remains the lower-level proof that the invariant is scope-based and applies automatically to future `TENANT`-scoped Roles.

## Release coverage contract

`docs/bite-32-5-release-coverage-manifest.json` enumerates the eight promotion-critical coverage requirements. `scripts/verify-bite32-release-coverage.py` verifies that every requirement is covered by a real file/test/contract marker and that release migration verification still requires migration `000071`.

The deployed Playwright job invokes that Python verifier directly after checking out the exact deployed revision. This avoids depending on `make` inside the Playwright container while preserving the Make target for LOCAL, feature CI, and the normal Ubuntu quality gate.

The verifier runs through:

- `make local-check`;
- feature-branch migration-rehearsal CI;
- deployed Playwright verification on the exact deployed revision.

The deployed and Production release-evidence regression checks also require the Bite 32 coverage gate, so removing the gate or its evidence causes release verification to fail.
