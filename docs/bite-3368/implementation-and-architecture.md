# Bite 33.6.8 — Integrated Regression, Recovery Rehearsal, and Final Acceptance

**Issue:** #998
**Implementation baseline:** branch `998-bite-3368--integrated-regression-testing-recovery-rehearsal-and-final-acceptance`, commit `17cedf7183834740533bd5e12d8c115b61d0f496`. This is the PATCH INPUT, not an anticipated promoted SHA.
**Acceptance state:** Software/test tooling delivered for validation; deployed Test and Production acceptance have NOT been performed by this delivery.

## Architecture and scope

The final Production-readiness gate ties together, without replacing, the existing Bite 33.1–33.6 backup, retention, S3, migration/restore, deployment, and rehearsal mechanisms, plus the Bite 33.6.7 two-human administrator enrollment and mutual account recovery. This delivery creates no new emergency recovery authority, additional operator, automatic administrator provisioning, or Production mutation.

### Three distinct levels of evidence

1. **Offline deterministic regression:** `make bite3368-core-check` executes a clean, **disposable** SQLite migration/backup/restore/re-migrate exercise with actual 76 migration scripts and failure-path checks; it also tests the acceptance verifier. It does **not** claim to exercise the Go admin enrollment executable, deployed Docker or S3, real RPO/RTO, or human/1Password access.
2. **Integrated regression:** `make bite3368-integrated-check` runs the core plus the existing focused Go/backup/off-host/restore/migration/rehearsal/1Password/credential/release evidence tests. Existing `make local-check`, CI, and Docker checks retain their established coverage; CI now includes the core regression explicitly.
3. **Deployed evidence and manual approval:** `scripts/verify-bite3368-final-acceptance.py --file ... --expected-revision ... --environment test|production` validates a non-secret evidence bundle and its SHA-256-linked, genuine `server-recovery-rehearsal.sh` JSON report. **It validates consistency, not authenticity.** A separately authorized reviewer must independently inspect original CI, backup/S3, 1Password, human acceptance, and change-management records. A JSON file with invented references can never substitute for that review.

### Final evidence fields

Start from `docs/bite-3368/final-acceptance-template.json`. Required: exact promoted 40-hex-character Git revision and tree, passing CI, focused integrated-check evidence, two *distinct* human account IDs/logins/actor keys with first-login, mutual-recovery and audit evidence, two independent 1Password reviews and effective service-account scope review, resolution of LastPass-versus-1Password documentation, authorized backup/off-host receipt, migration gate/smoke results, explicit accepted simultaneous administrator unavailability risk, a separately approved change, and the SHA-256 of the deployed recovery rehearsal JSON.

The rehearsal must report `status=passed` for the same environment and exact code revision/tree; an off-host recovery source; an actual isolated backend health check and restored database integrity; RPO ≤ 86,400 s and RTO ≤ 14,400 s with objectives *not relaxed*. A LOCAL-only SQLite backup is insufficient. Historic `owner-unavailable`/LastPass checks do not demonstrate approval of the launch's 1Password custody. Deferred Gate C stays deferred.

### Fail-closed boundaries

- No script creates or resets a Production account, alters deployed databases, contacts S3, reconfigures vaults, or silently promotes software.
- The acceptance verifier rejects missing/mismatched environment, revision, human identities, custody records, risk acceptance, non-off-host rehearsal, bad SHA, restored DB failures, and failed or weakened objectives.
- Do not commit signed evidence containing secrets, passwords, reset tokens, backup credentials, raw database files, or private 1Password data. Store only non-secret references in approved evidence storage.
- Successful `make bite3368-core-check` or `make bite3368-integrated-check` is **not** proof of deployed Test or Production readiness. Final PASS requires the authorized reviewer to reconcile the actual records.

**Operational test procedure:** [Manual Acceptance](manual-acceptance-tests.md)
**Canonical existing Production enrollment:** [Bite 33.6.7 Production Runbook](../bite-3367/production-operational-runbook.md)
**Existing server recovery and restore:** [Database Recovery Runbook](../database-recovery-runbook.md)
**Template:** [Final Acceptance Evidence](final-acceptance-template.json)

## Glossary impact

**ADD** to the release/operations glossary (if not already present): **Integrated Recovery Acceptance Evidence** — a non-secret, SHA-linked set of regression, Test/Production recovery-rehearsal, identity, secret-custody, and release-approval references reviewed for the exact release SHA. Evidence consistency verification does not replace independently authorized human approval.
