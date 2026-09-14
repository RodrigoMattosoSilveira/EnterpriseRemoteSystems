# Bite 30L — Authorization Boundary and Identity E2E Verification

Bite 30L is the final Bite 30 verification work and absorbs the intent of deferred Bite 28E. The architecture requires a broad set of end-state authorization, identity, lifecycle, audit, and deployment proofs. Implementing all of them as one patch would create an unnecessarily large failure domain, so 30L is delivered as four ordered sub-bites.

## Delivery split

### 30L.1 — Multi-Tenant Identity and Confidentiality E2E

- deterministic one-Account/two-Tenant fixture;
- one Global Person with Membership A + Actor A and Membership B + Actor B;
- real-session Tenant A ↔ Tenant B actor selection;
- exact Membership projection in each Tenant;
- denial for unrelated Tenant selection;
- Tenant Administrator current-Tenant Person projection without other-Tenant Membership/Actor disclosure, while the onboarding-only global directory excludes an existing Membership.

### 30L.2 — Identity Lifecycle and Delegated Authorization E2E

- Tenant Actor deactivate/reactivate while another Tenant remains usable;
- Authentication Account deactivate/reactivate and session invalidation;
- password/change/reset lifecycle;
- Collaborator Journey lifecycle against canonical Membership identity;
- delegated Tenant role grant/revoke while intrinsic self-service survives.

### 30L.3 — Control Plane, Support Lease & Audit Attribution E2E

- Application Administrator GLOBAL-only control-plane isolation;
- Support Access Lease request/approve, approved-lease expiry, immediate termination, and exact-Tenant isolation;
- exact Authentication Account / Actor key / Actor record / Tenant / Lease / session / correlation audit attribution.

### 30L.4 — Final Verification and Promotion Gate

30L.4 is split into three ordered promotion-gate deliveries so source-level coverage, deployed verification, and Production evidence can fail independently:

#### 30L.4A — Coverage Closure & Local Promotion Gate

- remaining same-Global-Person cross-Tenant financial-isolation proof;
- machine-checked coverage manifest mapping all thirteen architecture requirements to repository evidence;
- coverage-manifest verification incorporated into `make local-check`.

#### 30L.4B — Deployed Development/Test Verification Evidence

- deployed Playwright verification in Development and Test;
- immutable deployed revision/tree evidence and machine-readable verification artifacts.

#### 30L.4C — Production Release-Gate Evidence

- exact-tree Test rehearsal/evidence requirement for Production;
- Production deployment/smoke evidence;
- final manifest completion with no pending requirements.

## 30L.1 implementation

30L.1 provisions a deterministic non-Production account:

- login: `e2e-multi-tenant-person@example.com`;
- one Global Person: `e2e-multi-tenant-person`;
- one Authentication Account: `e2e-multi-tenant-account`;
- Tenant A: `e2e-multi-tenant-a`;
- Tenant B: `e2e-multi-tenant-b`;
- one active Membership and one active TENANT AccountActor per Tenant;
- no delegated Role Grant is required for Person self-service.

The Playwright coverage proves that the same authenticated Account resolves to the exact Tenant Actor selected by `X-Tenant-ID`, that each Person projection exposes only the selected Tenant Membership, that an unrelated Tenant cannot be selected, that the browser Tenant selector changes Actor context without another login, and that each Tenant Administrator sees only that Tenant's Membership projection while the onboarding-only global directory excludes the already-associated Person. The Tenant selector now makes the identity boundary explicit: every Tenant option is rendered with its own Actor Key and Membership ID, so a multi-Tenant Account is not presented as though one Actor belongs to multiple Tenants.

## 30L.2 implementation

30L.2 closes the remaining identity-lifecycle verification gaps without duplicating lifecycle scenarios that were already present in the promotion suite.

The multi-Tenant fixture from 30L.1 now proves that deactivating Tenant Actor A removes only Tenant A from the Account's usable Tenant options, leaves Tenant B fully usable in the same authenticated Account session, and restores Tenant A without another login when Actor A is reactivated.

The delegated-authorization coverage now verifies both halves of the self-service contract after an operator Role Grant is revoked: delegated permissions such as `expenses.create` disappear, while intrinsic `people.self.read` remains and `GET /api/v1/auth/self-service` continues to succeed for the same Authentication Account.

The Collaborator E2E suite now exercises a full zero-balance Journey lifecycle: create from canonical `membershipId`, close the Journey through the real settlement UI, confirm the closed Journey remains bound to the same Membership, then create a new Journey for that same Membership and prove its Journey balances start at zero rather than inheriting the prior Journey's financial state.

The following existing end-to-end scenarios are explicitly part of the 30L.2 gate and remain authoritative rather than being duplicated in a second spec:

- `authentication-tenant-ux.spec.ts` — `active Account with no active tenant Actor retains Person self-service and recovers without re-login`;
- `authentication-tenant-ux.spec.ts` — `a temporary-password account can sign in after completing the required password change`;
- `authentication-tenant-ux.spec.ts` — `administrator-issued password reset replaces the password and clears the active browser session`;
- `authentication-tenant-ux.spec.ts` — `security-suspended authentication account loses its session and cannot sign in until Application Administrator review`;
- `authorization-boundaries.spec.ts` — `tenant administrators can grant and remove operator roles without removing target self-service`.

30L.2 does not claim the control-plane, Support Access Lease, audit-attribution, cross-Tenant financial-isolation, or final deployment gates. Those remain in 30L.3 and 30L.4.

## 30L.3 implementation

30L.3 promotes the existing Tenant Support Access Lease runtime from domain coverage to an explicit end-state control-plane boundary proof.

`frontend/tests/e2e/support-access-leases-authorization.spec.ts` now proves three separate contracts:

- an authenticated Application Administrator remains a GLOBAL, identity-neutral control-plane Actor before any support lease is approved; it can use the GLOBAL authorization control plane but cannot resolve or read an arbitrary Tenant merely by supplying that Tenant ID;
- an exact-Tenant Administrator can approve a short-lived support lease, the same Application Administrator can temporarily resolve only that Tenant with only the allowlisted lease permissions, and an approved lease becomes effectively `EXPIRED` at `expiresAt` and immediately stops resolving Tenant authority without fabricating a synthetic actor-attributed expiration event;
- the authenticated Tenant/context catalog remains GLOBAL-only before approval and while the request is `PENDING`; when a lease becomes effective, the Tenant option retains `supportLeaseId` and `supportLeaseExpiresAt` provenance and is presented as temporary support access rather than an ordinary Tenant Actor/Membership identity;
- the real browser Administration context selector is tested across that same lifecycle so a cached option from an earlier authenticated session cannot leak into a new Application Administrator session;
- the GLOBAL Tenant control-plane catalog and the authenticated account context selector are tested as separate concepts: `E2E Support Access Lease` may appear in `/admin/tenants` as an administrable Tenant record while remaining absent from the Administration context selector until a Support Access Lease is approved; the catalog labels its rows as Tenant records and provides an **Open actual Administration context selector** action so manual verification can jump directly from the inventory to the authoritative account-context control;
- request, approval, authorized lease use, denied non-leased use, denied control-plane use from leased Tenant context, and termination are tied to the exact Authentication Account ID, Actor key, Actor record ID, Tenant ID, Support Lease ID, session ID, request correlation ID, and authorization source. The audit query is also exercised with the combined Account/Actor/Tenant/Lease filters to prove the stored attribution is independently retrievable.

The approval path explicitly rejects Application Administrator self-approval and approval by an Administrator from another Tenant. The termination path proves that exact-Tenant termination removes support authority immediately while leaving the Application Administrator's GLOBAL identity unchanged.

Expiration remains a derived effective state rather than a state-transition actor event: the persisted lease remains `APPROVED`, its `effectiveStatus` becomes `EXPIRED`, and its immutable request/approval audit provenance remains intact. This avoids inventing an Actor for the passage of time.

## 30L.4A implementation

30L.4A closes the last source-level E2E gap with a same-Global-Person financial-isolation scenario in `multi-tenant-identity-confidentiality.spec.ts`. The deterministic multi-Tenant Person is given an active Collaborator Journey in each Tenant when needed; each Tenant Administrator creates a uniquely marked expense in that Tenant; then one authenticated Person browser session switches Tenant A → Tenant B → Tenant A and proves that each Current Account contains only the selected Tenant's ledger marker. A direct attempt to open Tenant A's Collaborator Current Account while Tenant B is selected is denied, which also proves stale browser cache/state cannot expose the other Tenant's financial data.

`docs/bite-30l4-coverage-manifest.json` is the machine-readable architecture-to-test manifest. `make bite30l4-coverage-manifest-check` verifies all thirteen required Bite 30L architecture rows, referenced files, named Playwright tests, and Make targets. `make local-check` runs that verifier before the rest of the canonical local gate.

## 30L.4B implementation

30L.4B makes deployed Playwright mandatory for every Development and Test deployment and binds each successful run to both the immutable deployed Git revision and Git tree SHA. The deployed Playwright checkout must match both identifiers before the suite runs. After the full deployed suite passes, `scripts/write-deployed-playwright-evidence.py` creates a machine-readable `deployed-playwright-verification.json` record containing the environment, deployed and checked-out source identity, workflow/run identity, deployed Playwright runtime contract, immutable artifact names, and verification timestamp. `scripts/verify-deployed-playwright-evidence.py` verifies that record against the exact expected environment/revision/tree before upload.

The evidence JSON, Playwright HTML report, and test-results artifacts are named with environment + revision + tree SHA + workflow run identity and are uploaded with overwrite disabled. The evidence SHA-256 is also recorded into a successful Test release-rehearsal marker, preparing an exact-tree/evidence binding for the Production gate. `make deployed-playwright-evidence-check` regression-tests the evidence writer/verifier contract and is part of `make local-check`. See `docs/bite-30l4b-deployed-verification-evidence.md` for the evidence schema and promotion contract.

Requirement 13 is closed by 30L.4C after Production requires the exact Test evidence for the same source tree and emits final Production deployment/public-smoke evidence.

## Remaining 30L work

30L.4C requires the exact successful Test deployed-Playwright evidence for the Production source tree, captures immutable Production deployment/public-smoke evidence, and makes the coverage manifest pass `--require-complete` with all 13/13 requirements covered.
