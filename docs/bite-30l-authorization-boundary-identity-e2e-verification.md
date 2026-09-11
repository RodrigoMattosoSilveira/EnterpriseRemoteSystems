# Bite 30L — Authorization Boundary and Identity E2E Verification

Bite 30L is the final Bite 30 verification work and absorbs the intent of deferred Bite 28E. The architecture requires a broad set of end-state authorization, identity, lifecycle, audit, and deployment proofs. Implementing all of them as one patch would create an unnecessarily large failure domain, so 30L is delivered as four ordered sub-bites.

## Delivery split

### 30L.1 — Multi-Tenant Identity and Confidentiality E2E

- deterministic one-Account/two-Tenant fixture;
- one Global Person with Membership A + Actor A and Membership B + Actor B;
- real-session Tenant A ↔ Tenant B actor selection;
- exact Membership projection in each Tenant;
- denial for unrelated Tenant selection;
- Tenant Administrator global-directory lookup without other-Tenant Membership/Actor disclosure.

### 30L.2 — Identity Lifecycle and Delegated Authorization E2E

- Tenant Actor deactivate/reactivate while another Tenant remains usable;
- Collaborator Journey lifecycle against canonical Membership identity;
- delegated Tenant role grant/revoke while intrinsic self-service survives;
- cross-Tenant financial isolation for the same Global Person.

### 30L.3 — Account/Session, Control Plane, Support Lease, and Audit E2E

- Authentication Account deactivate/reactivate and session invalidation;
- password/change/reset lifecycle;
- Application Administrator GLOBAL-only control-plane isolation;
- Support Access Lease approval, expiry, immediate termination, and exact-Tenant isolation;
- Account/Actor/Tenant/Lease audit attribution.

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

The Playwright coverage proves that the same authenticated Account resolves to the exact Tenant Actor selected by `X-Tenant-ID`, that each Person projection exposes only the selected Tenant Membership, that an unrelated Tenant cannot be selected, that the browser Tenant selector changes Actor context without another login, and that Tenant Administrators can search the shared Global Person directory without learning the other Tenant's Membership or Actor identifiers.

## Remaining 30L work

30L.1 intentionally does not claim completion of the full 30L architecture checklist. 30L.2 through 30L.4 remain required before Bite 30L is complete and before the final Bite 30 promotion gate can be declared satisfied.
