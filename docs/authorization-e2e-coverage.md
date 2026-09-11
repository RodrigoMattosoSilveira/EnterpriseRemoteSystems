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

The 30L.1 coverage verifies that one Authentication Account can own two exact Tenant AccountActors for one Global Person, switch between those Tenant contexts through a real authenticated session, expose only the selected Membership projection, reject an unrelated Tenant context, and keep other-Tenant Membership/Actor identifiers out of Tenant Administrator global-directory results.

The remaining 30L lifecycle, financial, control-plane, support-lease, audit, and deployment gates are intentionally delivered in later 30L sub-bites as documented in `docs/bite-30l-authorization-boundary-identity-e2e-verification.md`.
