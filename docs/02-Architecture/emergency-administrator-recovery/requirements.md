# Enterprise Remote Systems — Emergency Administrator Recovery
## Requirements, Architecture, and Design — Working Specification

**Version:** 0.1 (October 25, 2026)\
**Status:** Stage 1 — Problem definition; exploratory draft, not implementation authorization\
**Relationship to ERS:** Separate post-Production design workstream; does not alter Bite 33.6.7, its accepted launch model, or promotion requirements.

## 1. Decisions already agreed

**D-001 — Incremental threat coverage.** The first use case is accidental loss of both human Application Administrators' ERS credentials. Define and prove a controlled recovery process for that scenario before expanding to (a) attempted reentry by a malicious or removed administrator and (b) compromised infrastructure.

**D-002 — Design before implementation.** Collaborate on requirements, architecture alternatives, design decisions, and acceptance tests before authorizing implementation. Retain prior 990/991 branches as historical work, not as mandatory starting architecture.

**D-003 — Production launch independence.** The approved Bite 33.6.7 model remains in force: two independently controlled human GLOBAL Application Administrators, 1Password access, existing backup/disaster-recovery mechanisms, and explicitly accepted simultaneous-unavailability risk. This document creates no additional initial Production gate.

## 2. Phase 1 problem statement

Both legitimate human Application Administrators are active and authorized, but neither can authenticate to ERS because their ERS sign-in credentials are accidentally unavailable. They cannot issue authenticated password resets for one another. ERS data and infrastructure are otherwise intact. The organization needs a narrowly controlled way to restore administrative access without using an ordinary logged-in Application Administrator session.

### Working assumptions — NOT yet agreed requirements

- **A-001:** “Lost credentials” means inability to use ERS passwords/sign-in factors; it does **not** initially mean loss of access to 1Password, hosting/SSH, deployment authority, backups, or database administration.
- **A-002:** The administrator identities still exist and remain active and explicitly authorized. Recovery must not reinstate revoked, suspended, or otherwise ineligible identities.
- **A-003:** At least one authorized human can establish an independently authenticated and approved operational recovery session outside the unavailable ERS administrator login path.
- **A-004:** Production infrastructure, database, backups, audit records, and the software supply chain have not been compromised.
- **A-005:** Existing Bite 33.6.7 authenticated mutual recovery remains available *after one administrator has regained legitimate access*.

These assumptions must be confirmed or revised before architecture selection.

## 3. Candidate minimal recovery journey (concept, not design)

1. Detect and document that both authorized administrators cannot authenticate.
2. Verify that recovery is permitted under the incident procedure and identify an eligible existing GLOBAL administrator account.
3. Using authority independent of the locked ERS login, perform a controlled, auditable credential-recovery operation for **one existing** eligible administrator account.
4. Invalidate relevant prior sessions/recovery tokens as required, avoid printing secrets, and require the recovered administrator to establish a new password through the approved channel.
5. Administrator A signs in and verifies GLOBAL authorization, while audit evidence is reviewed.
6. Administrator A uses the **normal authenticated** mutual account recovery flow to help Administrator B.
7. Both administrators independently sign in; record recovery completion and review evidence.

**Central simplification to evaluate:** Emergency recovery of *one* legitimate administrator may be sufficient to break the two-account lockout. It may be safer and operationally simpler than building a separate procedure for both accounts.

## 4. Draft Phase 1 requirements (subject to agreement)

| ID | Requirement | Priority |
|---|---|---|
| P1-F01 | Provide an explicit, narrow recovery path usable when no Application Administrator can sign in to ERS. | Must |
| P1-F02 | Recover only an existing, presently eligible human GLOBAL Application Administrator account; do not create an additional administrator by default. | Must |
| P1-F03 | Reuse the existing authenticated account-recovery workflow for the second administrator once one is restored, where feasible. | Should |
| P1-S01 | Recovery must require separately verifiable operational authorization; knowing an ERS login/email must be insufficient. | Must |
| P1-S02 | Fail closed for inactive, revoked, or ineligible accounts and unexpected authorization state. Do not recreate revoked grants or change role scope. | Must |
| P1-S03 | Prevent disclosure of passwords, reset secrets, or recovery materials in Git, command arguments where visible, standard logs, and audit entries. | Must |
| P1-S04 | Use approved, time-limited or single-use credential material; ensure relevant session/token invalidation. | Must |
| P1-S05 | No publicly accessible perpetual break-glass sign-in endpoint, hard-coded recovery password, or development/E2E bootstrap bypass in Production. | Must |
| P1-O01 | Require a defined operational approval, backup/restore safety checkpoint, and execution record before a Production recovery action. | Must |
| P1-O02 | Generate tamper-evident or append-only attributable audit evidence sufficient to reconstruct who authorized, performed, and verified recovery. | Must; precise mechanism TBD |
| P1-O03 | Specify prerequisites, commands/UI actions, stop conditions, verification, and cleanup in a tested runbook. | Must |
| P1-T01 | Demonstrate the entire recovery journey in an isolated fully migrated Test environment, including repeated-use refusal and failure paths. | Must |
| P1-T02 | Establish objective recovery success criteria and measure recovery duration against existing ERS recovery objectives; do not invent a new RTO. | Must |

## 5. Explicitly deferred problem classes

**Phase 2: Malicious or removed administrator.** Address attempts to regain access after legitimate revocation, forged approvals, abusive recovery operators, insider collusion, and independent scrutiny of authority. *Compatibility safeguard now:* Phase 1 must already refuse recovery of an identity that is currently revoked, suspended, or ineligible. Stronger defenses against adversaries controlling the recovery infrastructure remain future work.

**Phase 3: Compromised infrastructure.** Address attacker control of hosting, database, deployment channel, credential store, recovery host, or backups; independent integrity and chain-of-trust validation. A recovery mechanism relying on compromised infrastructure cannot be asserted trustworthy without additional external roots of trust.

**Not the same problem:** Database disaster recovery, backups/off-host retention, and application redeployment are existing Bite 33 controls. Their intersection with identity recovery must be documented, but Phase 1 should not duplicate those subsystems.

## 6. Architecture questions (intentionally open)

1. **Credential-loss boundary:** Are only ERS sign-in credentials lost, while both administrators retain access to their individually authorized 1Password accounts and Production infrastructure?
2. **Recovery authority:** Who may authorize and execute the operation when both ERS admin sessions are unusable? Are authorization and execution separate duties?
3. **Recovery channel:** What independent trusted system/identity proves the operator's authority (e.g., existing hosting controls and 1Password access)?
4. **Technical pattern:** Should an emergency operation issue a short-lived reset token through existing authentication services, or use a restricted offline account credential update? Compare both, including audit, rollback, and operational complexity.
5. **Operational isolation:** Must the backend be stopped, can the operation safely use a maintenance path, or is an isolated restore preferable?
6. **Evidence:** What evidence must be retained, by whom, and where, to prevent an audit record being lost during rollback or a database restore?
7. **Failure handling:** What should happen if only one account is recoverable or the expected grants/identity bindings are not intact?

No architecture is selected in version 0.1.

## 7. Candidate acceptance scenario — first draft

**Given** two distinct active human Application Administrators with valid GLOBAL `APPLICATION_ADMIN` grants and a healthy ERS database,\
**and** neither can authenticate to ERS using available sign-in credentials,\
**and** the independent operational recovery prerequisites and approvals are satisfied,\
**when** an authorized operator initiates controlled recovery of Administrator A,\
**then** Administrator A can establish a new credential and independently authenticate with the same canonical account and GLOBAL authorization,\
**and** any superseded sessions/tokens are invalidated as specified,\
**and** the operation is fully attributable and auditable without recording secrets,\
**and** Administrator A can use ordinary authenticated recovery to restore Administrator B,\
**and** neither recovery silently changes role grants or activates a revoked administrator.

**Negative tests:** missing authorization/approval; recovery of an inactive or revoked administrator; unknown actor/account; replayed recovery input; incomplete audit recording; interrupted transaction; leaked secret; no independent infrastructure access. Expected behavior: fail closed and preserve existing identity/grant state.

## 8. Decision log

| ID | Status | Decision |
|---|---|---|
| ADR-001 | Accepted (scope) | Design the accidental two-administrator credential-loss use case first; defer insider attack and compromised-infrastructure threat models. |
| ADR-002 | Accepted (process) | No implementation before documented requirements, architecture comparison, and acceptance plan. |
| ADR-003 | Open | Recover one administrator via independent authorization, then recover the other with normal Bite 33.6.7 workflow. |
| ADR-004 | Open | Choose independent recovery authority and recovery execution mechanism. |

## 9. Next collaboration checkpoint

**First question:** Confirm or correct working assumption A-001: does the initial use case mean both human administrators have lost their **ERS sign-in credentials only**, but retain authorized access to 1Password and the Production hosting/deployment environment?

Once agreed, define who can authorize and execute the controlled recovery, and only then compare architecture alternatives.
