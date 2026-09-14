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
- a Tenant Administrator creating a Person is routed directly to that Person's Authentication section, can define and confirm the initial temporary password, and the newly provisioned Account must change that password on first sign-in;
- administrator-issued password reset replaces the credential and invalidates the pre-reset browser session;
- closing a zero-balance Collaborator Journey preserves canonical Membership identity and a subsequent Journey for that Membership starts with zero Journey balances;
- revoking a delegated operator Role Grant removes delegated authority while `people.self.read` and `/api/v1/auth/self-service` remain available;
- the Tenant Administrator authorization route renders a filterable Role selector on each eligible Tenant Actor card and keeps existing operator Role Grants in a separate current-grants section.

The lifecycle proof is intentionally distributed across the established specifications that own each domain:

```text
frontend/tests/e2e/multi-tenant-identity-confidentiality.spec.ts
frontend/tests/e2e/authentication-tenant-ux.spec.ts
frontend/tests/e2e/authorization-boundaries.spec.ts
frontend/tests/e2e/collaborators.spec.ts
frontend/tests/e2e/tenant-role-delegation-ui.spec.ts
```

## Bite 30L.3 — Control Plane, Support Lease & Audit Attribution

30L.3 makes the Application Administrator / Tenant Support Access Lease boundary a named promotion contract in:

```text
frontend/tests/e2e/support-access-leases-authorization.spec.ts
```

The automated coverage verifies:

- the Application Administrator resolves as an identity-neutral `APPLICATION` Actor in GLOBAL (`*`) context and cannot resolve or read a Tenant before an exact-Tenant Support Access Lease is approved;
- the browser Administration context selector is session-fresh: it shows only `Global administration` before a lease and while a request is `PENDING`, shows the exact Tenant only as `Temporary support access` after approval, and removes it immediately after termination;
- the GLOBAL `/admin/tenants` control-plane catalog is explicitly distinguished from the authenticated account context catalog: a Tenant may be visible in the administrative inventory while remaining absent from the Administration context selector; catalog visibility is not evidence of an ordinary Tenant Actor/Membership identity, and the inventory provides a direct **Open actual Administration context selector** action for manual verification;
- GLOBAL control-plane authorization remains available only in GLOBAL context;
- Support Access Lease permissions are allowlisted and cannot contain control-plane permissions;
- the Application Administrator cannot approve its own request, and a Tenant Administrator from another Tenant cannot approve it;
- the exact-Tenant Administrator can approve the request;
- the approved lease supplies only the requested Tenant permission and does not create a Person, Membership, Collaborator, or Tenant Actor identity for the Application Administrator;
- the same lease does not work in any other Tenant and does not permit GLOBAL control-plane operations while operating in the leased Tenant context;
- an approved short-lived lease becomes effectively `EXPIRED` at `expiresAt`, immediately loses Tenant authority, remains persisted as `APPROVED`, and cannot be terminated after it is already expired;
- an explicitly terminated lease immediately loses Tenant authority while preserving the same GLOBAL Application Administrator identity;
- request, approval, authorized support use, denied non-leased use, denied control-plane use, and termination audit rows carry the exact Authentication Account ID, Actor key, Actor record ID, Tenant ID, Support Lease ID, session ID, correlation ID, and authorization source;
- combined Account/Actor/Tenant/Lease audit filters retrieve the corresponding Application Administrator and Tenant Administrator evidence independently.

Expiration is intentionally derived from `expiresAt`; because no human or system Actor performs an expiration transition, the suite requires the immutable request/approval provenance to remain and requires no fabricated actor-attributed expiration event.

## Bite 30L.4A — Coverage Closure & Local Promotion Gate

30L.4A closes the remaining same-Global-Person financial-isolation gap in `frontend/tests/e2e/multi-tenant-identity-confidentiality.spec.ts`. One authenticated Account owns Tenant A and Tenant B Actors/Memberships for the same Global Person. The test establishes a Collaborator Journey and a uniquely marked financial posting in each Tenant, switches the same browser session A → B → A, verifies that each Current Account contains only its selected-Tenant posting, and proves that Tenant B cannot directly address Tenant A's Current Account. This exercises both server authorization and browser-cache/state isolation.

The machine-readable final-coverage map is `docs/bite-30l4-coverage-manifest.json`. `make bite30l4-coverage-manifest-check` validates every architecture requirement and its named repository evidence, and `make local-check` invokes that manifest verifier before the canonical local test/build gate. The manifest deliberately leaves deployment requirement 13 pending until 30L.4B/30L.4C produce immutable deployed Development/Test and Production release evidence.
