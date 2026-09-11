# Authorization E2E Coverage

Bite 27D adds Playwright API-level E2E coverage for the persisted actor and role operating model.

The coverage intentionally exercises the system through HTTP rather than unit-level helpers so that route middleware, handler-owned authorization, persisted actor lookup, and role-grant scope validation are tested together.

## Covered boundaries

The E2E suite verifies that:

- unknown actors cannot gain administrator access by sending `X-Actor-Permissions: *`;
- active persisted actors resolve through `GET /api/v1/authz/current-actor`;
- inactive persisted actors are rejected with `401`;
- Expense Operators can reach expense creation validation but cannot administer authorization or update sensitive current-account settings;
- Earnings Operators can reach planning/work-period creation validation but cannot create expenses or price-list records;
- application-scoped roles require tenant scope `*`;
- tenant-scoped roles reject global scope `*`.

## Test file

```text
frontend/tests/e2e/authorization-boundaries.spec.ts
```

## Operational expectation

The E2E tests use only persisted actors and persisted role grants. They must not rely on header-supplied permission lists. This keeps the browser/API promotion suite aligned with the Bite 27B operating model.


## Bite 30L.1 — Multi-Tenant Identity and Confidentiality

The final Bite 30 verification work extends this coverage with a deterministic one-Account/two-Tenant identity fixture.

```text
frontend/tests/e2e/multi-tenant-identity-confidentiality.spec.ts
```

The 30L.1 coverage verifies that one Authentication Account can own two exact Tenant AccountActors for one Global Person, switch between those Tenant contexts through a real authenticated session, expose only the selected Membership projection, reject an unrelated Tenant context, keep other-Tenant Membership/Actor identifiers out of Tenant Administrator current-Tenant Person results, and exclude an already-associated Person from the onboarding-only global directory.

The remaining 30L lifecycle, financial, control-plane, support-lease, audit, and deployment gates are intentionally delivered in later 30L sub-bites as documented in `docs/bite-30l-authorization-boundary-identity-e2e-verification.md`.

## Bite 30L.2 — Identity Lifecycle and Delegated Authorization

30L.2 treats identity lifecycle as one end-state authorization contract rather than as independent CRUD operations. The automated promotion suite now verifies:

- one multi-Tenant Account keeps Tenant B usable while Tenant Actor A is inactive, and the same Account session regains Tenant A after Actor A reactivation;
- the Tenant selector labels each available Tenant with the distinct Actor Key and Membership ID backing that Account-owned identity, preventing the UI from implying that one Actor owns multiple Tenant memberships;
- an active Authentication Account can retain intrinsic Person self-service with no active Tenant Actor and recover Tenant access without a new login;
- security suspension invalidates an existing Account session, rejects login, supports an explicit reactivation request/review, and permits login only after Application Administrator approval;
- temporary-password first login forces password change;
- administrator-issued password reset replaces the credential and invalidates the pre-reset browser session;
- closing a zero-balance Collaborator Journey preserves canonical Membership identity and a subsequent Journey for that Membership starts with zero Journey balances;
- revoking a delegated operator Role Grant removes delegated authority while `people.self.read` and `/api/v1/auth/self-service` remain available.

The lifecycle proof is intentionally distributed across the established specifications that own each domain:

```text
frontend/tests/e2e/multi-tenant-identity-confidentiality.spec.ts
frontend/tests/e2e/authentication-tenant-ux.spec.ts
frontend/tests/e2e/authorization-boundaries.spec.ts
frontend/tests/e2e/collaborators.spec.ts
```

30L.3 retains the remaining control-plane, Support Access Lease, audit-attribution, and cross-Tenant financial-isolation verification. 30L.4 remains the final `make local-check` and deployed promotion gate.
