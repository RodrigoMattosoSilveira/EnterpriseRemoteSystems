# Bite 33.6.7 — Implementation and Architecture

**Issue:** #945 — Two Human Application Administrators
**Branch:** `994-bite-3367-two-human-administrators`
**Document review baseline:** `072a5628eab19bf8d496bc653d7c4a38e25dfc3a` (the ZIP supplied for this documentation-only refactor)
**Purpose:** Explain the agreed launch model, the implemented components, their security boundaries, and the relationship to postponed emergency recovery. This document is **not** an executable enrollment runbook or manual test procedure.
**Scope:** Documentation only; no behavior, database migrations, or source-code changes.

**Companion documents (same directory):**

- [Manual Acceptance Test Suite](manual-acceptance-tests.md) — executable LOCAL and Test MT-00–MT-11 procedures, including variable initialization, per-case execution records, and teardown.
- [Production Operational Runbook](production-operational-runbook.md) — approved change process, Production backup/restore evidence, stopped-writer enrollment, and Production acceptance.

**Source of truth:** Application code and migrations in the promoted release determine actual runtime behavior. This document describes that contract; do not use its architectural examples to bypass the guarded executable.

## 1. Authorization and operating decision

The launch model uses **two independent human GLOBAL `APPLICATION_ADMIN` identities**, each with its own Authentication Account and canonical GLOBAL AccountActor, plus 1Password access appropriate to their responsibilities. Either human can manage ERS independently, including issuing the other human a single-use reset token through the existing authenticated Administration interface. The existing automation administrator, if present, is **not revoked or modified**.

The organization accepts the documented risk that simultaneous unavailability of both human administrators may delay or prevent recovery. Preserve, but **do not merge**, branches `990-bite-3366a-production-application-administrator-emergency-access-recovery` and `991-bite-3366a-gate-b-standardized-containerized-recovery-environment` as deferred post-launch work.

**Other safeguards do not disappear:** Production verified local backups, Hetzner S3 replication, off-host restore, migration integrity checks, RPO ≤ 24 h, RTO ≤ 4 h, and accepted recovery rehearsals remain necessary. An offline administrator enrollment is not a substitute for an application recovery rehearsal.

**Known documentation discrepancy:** Parts of the existing Bite 33.6 owner-unavailable recovery runbook and `ops/recovery-access.production.env` still refer to LastPass, while the accepted launch operating model uses 1Password. Do **not** treat an older LastPass-oriented preflight as evidence that 1Password custody is accepted. Record and resolve the discrepancy with documented 1Password access validation before Production acceptance. Never bypass existing promotion guards to conceal a discrepancy.

## 2. Implementation and contract

The new offline command `backend/cmd/enroll-human-admins` is separately compiled into the backend Docker image at `/app/enroll-human-admins`. **It is not an API endpoint, not `provision-e2e-admin`, and not an authentication bootstrap.** It requires an existing migrated SQLite file, `APP_ENV` equal to the explicit environment, confirmation that all database writers are stopped, an approval reference, an operator reference, and a verified backup reference. Production additionally requires the exact confirmation literal `ENROLL_TWO_HUMAN_ADMINS`.

The command consumes **one JSON object on stdin** with exactly two `administrators`, each with `actorKey`, `displayName`, `login`, and `password`. Use `scripts/ers-two-human-admin-input.py` to input them via private terminal prompts. It writes no password or hash to success output or audit. Avoid using password arguments, environment variables, shell variables, redirected JSON, `tee`, shell tracing, saved terminals or CI logs.

The enrollment rejects an existing login or actor key (case insensitive), reused initial passwords, incomplete authorization catalog, missing immutable audit triggers, or malformed input. Its **single database transaction** creates both Account rows, both active authorization Actors, both canonical `scope_type='GLOBAL'` bindings without Tenant/Person, two active `APPLICATION_ADMIN` grants with `tenant_id='*'`, and two append-only enrollment audit rows attributed to the provided operator/change/backup references. The existing password-reset flow additionally writes `authentication.password_reset_tokens.consume` with target Account attribution in the same transaction as the password update and session revocation; since token consumption is public it is attributed as `password-reset-token-holder` rather than impersonating the issuer. Both accounts start with `must_change_password=1`; the login flow forces a change. **If either row or its audit record fails, nothing is committed.** Re-running the command after success fails create-only. It never alters previously existing accounts, automation actors, or existing grants.

**Operational attestation limitations:** `--offline-confirmed`, `--approval-reference`, and `--backup-evidence-reference` represent operator-confirmed evidence, not independently verified downtime, approval-system state, or off-host backup integrity. Gate operators **must** perform and record the separate checks below. A fresh copy of a Production database must never be connected to an untrusted LOCAL frontend, and no unredacted Production database or secrets may be added to Git or logs.

## 3. Architecture, components, and trust boundaries

| Component | Responsibility | Boundary / invariant |
|---|---|---|
| `backend/cmd/enroll-human-admins/main.go` | Separate, guarded offline enrollment CLI; reads one JSON document from stdin | Must never run as an online API, migration hook, Production bootstrap bypass, or E2E provisioner |
| `backend/internal/authentication/human_admin_enrollment.go` | Single-transaction creation of both Authentication Accounts, authorization Actors, GLOBAL AccountActor bindings, `APPLICATION_ADMIN` grants, and immutable audit records | Both identities commit together or neither does; no existing administrator is modified |
| `scripts/ers-two-human-admin-input.py` | Privately prompts for the two distinct new human identities and initial credentials | No passwords in argv, shell history, artifacts, or CI output; pipe directly to the CLI |
| `scripts/ers-two-human-admin-status.py` | Read-only verification of canonical bindings, usability, and initial password-change state | Inspect the correct isolated database (prefer an offline SQLite-consistent copy for deployed systems) |
| Existing authenticated Authentication Administration UI | Issues single-use reset token for the *other* administrator | Issuance is attributed to the authenticated issuer; recipient resets using public flow |
| Existing password-reset completion | Consumes single-use reset token, updates password and revokes sessions, with append-only audit evidence | Transactional, no forged authenticated actor identity; does not reinstate revoked grants |
| 1Password + existing backup/restore services | Independent human secret access and Production recovery safeguards | Individual human accounts, environment separation, off-host backup and rehearsal remain mandatory |

### 3.1 Identity and authorization model

```text
Human A --> Authentication Account A --> GLOBAL AccountActor A --> Actor A
                                                            --> APPLICATION_ADMIN grant (tenant_id = '*')
Human B --> Authentication Account B --> GLOBAL AccountActor B --> Actor B
                                                            --> APPLICATION_ADMIN grant (tenant_id = '*')
```

A and B are distinct human identities. No Person/Tenant Membership is required for their GLOBAL bindings. Existing automation administrator access is preserved rather than revoked.

### 3.2 Enrollment vs ordinary mutual recovery

- **Offline enrollment** is a create-only administrative *database maintenance operation*, with a documented approval, operator, verified backup evidence, and stopped writers. Its two new accounts start with `must_change_password=true`.
- **Normal recovery** is performed later through existing authenticated ERS Administration: A may issue B's single-use reset token and B may issue A's. This is not the deferred Gate C recovery authority. The owner must still be an authorized, usable identity; the mechanism must not silently re-enable a revoked administrator.
- **Failure and rollback:** An input, catalog, collision, audit or database failure must not partially create one of the two humans. A reset/audit failure must not partially change passwords or consume the token.

### 3.3 Explicitly excluded from Bite 33.6.7

The work does not implement the post-launch isolated emergency-authority cryptographic custody mechanism. Preserve branches `990-bite-3366a-production-application-administrator-emergency-access-recovery` and `991-bite-3366a-gate-b-standardized-containerized-recovery-environment` without merging them into this Production launch. The accepted residual risk of simultaneous human administrator unavailability must be recorded; it is not automatically mitigated by two human accounts.

## 4. Validation and deployment boundaries

- **Code and CI:** `make two-human-administrators-check`, `make promotion-readiness-check`, `make local-check`, and repository CI at the actual candidate SHA.
- **Manual acceptance:** Follow [Manual Acceptance Test Suite](manual-acceptance-tests.md). Its LOCAL database is a *disposable SQLite copy*, not the normal LOCAL database or a deployed Test or Production volume. Follow the test suite's Environment Initialization *before* referring to `$MT_DB`.
- **Production operation:** Follow [Production Operational Runbook](production-operational-runbook.md), which additionally requires approved change, 1Password access, verified backup and Hetzner S3 evidence, isolated recovery rehearsal, stopped writers, and authorized enrollment. Passing LOCAL/CI never authorizes a Production write.
- **Deployments:** Test and Production require HTTPS; LOCAL may run HTTP for development. Never copy a Production database into an untrusted LOCAL browser/test host.

## 5. Glossary definitions — ADD

- **Mutual Administrator Account Recovery:** An authenticated human Application Administrator uses the normal ERS password-reset mechanism to issue a single-use reset token for another human administrator, preserving request-actor audit attribution, token expiration and session revocation.
- **Two-Human Administrator Launch Model:** Initial Production operating model using two independently controlled human canonical GLOBAL Application Administrators, authorized 1Password access, and existing backup/restore capabilities. The organization accepts the residual risk that simultaneous unavailability of both humans may impede or delay recovery.
- **Offline Emergency Administrator Recovery:** A separately controlled cryptographic/custody emergency recovery mechanism deferred beyond launch; it is **not** Bite 33.6.7 enrollment, normal mutual password reset, or current Production acceptance criteria.
