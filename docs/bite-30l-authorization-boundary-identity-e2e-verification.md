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

### 30L.3 — Control Plane, Support Lease, Audit, and Financial Isolation E2E

- Application Administrator GLOBAL-only control-plane isolation;
- Support Access Lease approval, expiry, immediate termination, and exact-Tenant isolation;
- Account/Actor/Tenant/Lease audit attribution;
- cross-Tenant financial isolation for the same Global Person.

### 30L.4 — Final Verification and Promotion Gate

- coverage manifest mapping architecture requirements to automated specs;
- complete `make local-check` gate;
- deployed Playwright verification in Development and Test;
- production promotion/rehearsal evidence and deployment verification.

## 30L.1 implementation

30L.1 provisions a deterministic non-Production account:

- login: `e2e-multi-tenant-person@example.com`;
- one Global Person: `e2e-multi-tenant-person`;
- one Authentication Account: `e2e-multi-tenant-account`;
- Tenant A: `e2e-multi-tenant-a`;
- Tenant B: `e2e-multi-tenant-b`;
- one active Membership and one active TENANT AccountActor per Tenant;
- no delegated Role Grant is required for Person self-service.

The Playwright coverage proves that the same authenticated Account resolves to the exact Tenant Actor selected by `X-Tenant-ID`, that each Person projection exposes only the selected Tenant Membership, that an unrelated Tenant cannot be selected, that the browser Tenant selector changes Actor context without another login, and that each Tenant Administrator sees only that Tenant's Membership projection while the onboarding-only global directory excludes the already-associated Person.

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

## Remaining 30L work

30L.1 and 30L.2 do not claim completion of the full 30L architecture checklist. 30L.3 and 30L.4 remain required before Bite 30L is complete and before the final Bite 30 promotion gate can be declared satisfied.
