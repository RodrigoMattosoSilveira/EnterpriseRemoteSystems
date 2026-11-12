# Bite 35.6 — Manual Acceptance T01–T09 (single developer vs. actual humans)

**Source:** committed candidate branch `1078-bite-356-application-administrator-and-operational-runbooks`; **working directory:** `~/projects/EnterpriseRemoteSystems` — **no other worktree**. Record the actual candidate SHA at execution.  **No password, reset token, private key, recovery document, session cookie or vault secret is recorded here.**

**Result conventions:** `PASS` = observed and independently evidenced; `FAIL` = observed violation; `BLOCKED` = prerequisite unavailable or missing human; `N/A` = expressly outside this stage with reason. For every case record UTC timestamp, actual identity, environment, branch/SHA, expected vs. observed outcome, evidence reference and cleanup. **One developer may sign off offline software quality; this cannot satisfy actual two-human recovery or authorize Production.**

## T01 — Candidate branch and safe working context (LOCAL, one human)

**Identity/context:** developer/tester, LOCAL terminal, no ERS sign-in or selected Tenant.

1. Open Terminal in the *single* ERS directory and run:
   ```bash
   cd ~/projects/EnterpriseRemoteSystems
   pwd
   git branch --show-current
   git rev-parse HEAD
   git status --short
   ```
2. Confirm branch equals `1078-bite-356-application-administrator-and-operational-runbooks` and HEAD equals the **current candidate commit** in your change record. `git status --short` must print nothing before claiming a committed-release verification.
3. Confirm no Test/Production credential, copy of database, or operational secret was used to begin this test.

**PASS:** correct single repository, correct HEAD and clean tree. **FAIL:** mismatch or unreviewed changes. **BLOCKED:** missing candidate SHA. No cleanup required.

## T02 — 1Password-only recovery contract (LOCAL, one human)

**Identity/context:** developer/tester, read-only repository inspection; *not* a 1Password login.

1. Open `ops/recovery-access.production.env` in VS Code. Confirm `RECOVERY_SHARED_SECRETS_PROVIDER=1Password` and `RECOVERY_SHARED_COLLECTION=ers-production`. **There are eight `RECOVERY_*_SOURCE` entries, not five; only the following five secret-custody locators must begin `op://ers-production/`:**
   - `RECOVERY_PRODUCTION_ENV_SOURCE`
   - `RECOVERY_S3_CREDENTIAL_SOURCE`
   - `RECOVERY_HOST_ACCESS_SOURCE`
   - `RECOVERY_HETZNER_CONSOLE_SOURCE`
   - `RECOVERY_DNS_SOURCE`
2. In the same manifest, verify the **other three source entries intentionally use different prefixes**:
   - `RECOVERY_REPOSITORY_SOURCE=github://RodrigoMattosoSilveira/EnterpriseRemoteSystems` — source repository, not a secret-custody locator.
   - `RECOVERY_EDGE_SOURCE=github://RodrigoMattosoSilveira/EnterpriseRemoteSystems/edge` — committed edge deployment files, not a secret-custody locator.
   - `RECOVERY_MFA_RECOVERY_SOURCE=technician-controlled://independent-mfa-and-recovery-codes` — requirement for owner-independent MFA/recovery access, **not** proof of custody or a populated vault item.
   Confirm that no credential, private key, MFA recovery code or other secret **value** is committed in the manifest. Do **not** require all eight sources to begin `op://` and do not rewrite the three non-1Password source entries merely to satisfy this test.
3. Open `docs/database-recovery-runbook.md`; confirm its active owner-unavailable secret-source list agrees with the five 1Password locators, and that former LastPass paths are not presented as current sources.
4. From the single ERS working directory, execute:
   ```bash
   cd ~/projects/EnterpriseRemoteSystems
   make byte356-operations-check
   make owner-unavailable-recovery-readiness-check
   ```
5. Confirm both commands exit with status `0`, the 35.6 check reports `11 PASS / 0 FAIL`, and the validator has not claimed to access the real 1Password vault. Record the non-secret output as evidence.

**PASS:** the five scoped 1Password locators match, the other three source types are as documented, no secret values are committed, and both checks exit zero. **FAIL:** any incorrect source type, unresolved active LastPass secret locator, missing source, exposed secret value, or failed check. **Operational custody remains BLOCKED until T07 proves actual authorized access.**

## T03 — Controlled GLOBAL administrator enrollment regression (LOCAL, one human)

**Identity/context:** developer/tester, LOCAL disposable fixtures. Do not open or change the normal `backend/data/app.db`.

1. Run:
   ```bash
   make two-human-administrators-check
   ```
2. Confirm exit 0 and that the Go and Python suites run without skipped/failing cases. Inspect `backend/cmd/enroll-human-admins/main.go` and `docs/bite-3367/production-operational-runbook.md` for the exact existing guarded, two-human **offline** entry point; do not invoke it against an operational DB.
3. Confirm first-password-change, distinct Accounts/Actors, transaction rollback, and mutual recovery are covered by the existing Go regression. Record the successful command and CI result rather than reimplementing tests manually.

**PASS:** exit 0, no operational DB touched. **FAIL:** nonzero, missing required coverage. **BLOCKED:** required Go tooling unavailable. This is software verification, **not actual independent-human enrollment**.

## T04 — Recovery and deployment regressions (LOCAL, one human)

**Identity/context:** developer/tester, existing offline test tools; no Production session.

1. Execute:
   ```bash
   make promotion-readiness-check
   make local-check
   ```
2. Record exact candidate SHA, output, exit status, and matching GitHub CI run. The established suites cover safeguards and non-live recovery simulations; they **do not** prove actual off-host disaster recovery.
3. If Docker-backed tests create containers, stop/remove only those test-created containers when they finish. Inspect `docker ps -a` and `lsof -nP -iTCP:8080 -sTCP:LISTEN`; do not terminate unrelated services. If no Docker test was run, record N/A for Docker cleanup.

**PASS:** both checks exit 0 and matching-sha CI passes; test resources cleaned. **FAIL:** any regression failure. **BLOCKED:** tool/dependency absent. Production launch remains blocked.

## T05 — Existing administrator UI and role boundaries (deployed Test, authorized operator)

**Identity/context:** actual authorized Test Application Administrator; **Global administration**; Test HTTPS only. Test must already contain a legitimate named administrator; do not create one merely to make this UI test pass.

1. In an ordinary private Test browser profile, sign in with the **Test-only** Application Administrator credential from authorized 1Password access. Observe GLOBAL administration rather than Tenant membership.
2. Open **Administration → Authentication**, inspect the signed-in Account/Actor, and confirm GLOBAL scope; then open **Administration → Authorization** and confirm APPLICATION_ADMIN rights.
3. Attempt to select an ordinary Tenant identity for the global administrator. Confirm no ordinary Tenant Actor is created or inherited. Review the Audit Logs for the legitimate sign-in and actions without exposing session tokens.
4. Sign out; confirm the login page is displayed. Record environment, account/actor identifiers (non-secret), context and observations.

**PASS:** legitimate named global admin works, no Tenant Actor leak, audit and logout correct. **FAIL:** unauthorized Tenant scope/permission or missing audit. **BLOCKED:** no legitimate Test administrator or deployed app.

## T06 — Independent administrators and mutual access recovery (deployed Test, two actual humans)

**Identities/context:** Human A and Human B are **two different natural persons** with their own Test 1Password accounts, Test ERS logins, and browser profiles. Both work in Test GLOBAL Administration. Sole developer may record **BLOCKED**, not use two synthetic logins to claim this case.

1. From `docs/bite-3367/production-operational-runbook.md` use Gate 2 to establish whether the two Test humans have already been enrolled. If so, **do not rerun enrollment**.
2. Have A sign in using A's own credential/browser profile, complete the forced first change (when applicable), load **Administration → Authentication**, record A's Account ID and Actor ID, then sign out.
3. Have B independently repeat with B's own 1Password/browser profile. Verify two distinct Account IDs, Actor IDs and named human ownership; neither becomes a Tenant Actor.
4. Follow §6 **TC-03** of the established 33.6.7 runbook: A issues B a single-use reset through supported UI, B redeems it, then verify old credentials/sessions are invalid and the second redemption fails. Record audited issuer and recipient evidence, not the reset token.
5. Have A and B separately verify they can sign in after recovery. Close both sessions.

**PASS:** independence, scopes, password reset single use/session revocation, and audit all observed. **FAIL:** broken isolation, shared credentials, unrecoverable account or missing audit. **BLOCKED:** either actual human unavailable or prerequisites unmet. Never test against Production just to unblock Test.

## T07 — Independent 1Password custody and owner-unavailable readiness (operational Test/Production gate, two humans)

**Identities/context:** two approved real recovery technicians (or distinct authorized Application Administrators) and an authorized reviewer; **1Password external to ERS**, no Tenant context. Do not ask a developer to impersonate the absent human.

1. Reviewer obtains approved access matrix naming the `ers-production` vault and each of the five recovery item identifiers in §3 of `byte-35-6-administrator-and-recovery-runbook.md`; separate Test/Production approvals and appropriate access are mandatory.
2. Human A independently unlocks A's personal 1Password account; selects the approved organizational vault, confirms access to **every** required item title and that the material is current without revealing/copying secrets to evidence, then locks their session.
3. Human B independently repeats with B's *different* 1Password identity, MFA and recovery path. No use of the owner's device or A's unlock session.
4. Authorized reviewer checks actual effective vault/item access and the Production deployment service account's limited permissions, without creating or granting new permissions during a test.
5. Confirm the current `.env.production` and S3 credential sources match the deployed versions using approved non-secret custody evidence, not by copying their values to this record.

**PASS:** both distinct real humans demonstrably have independently usable, least-privilege access to current recovery prerequisites. **FAIL:** unauthorized shared account, missing item, over-broad service token, owner-only MFA. **BLOCKED:** one human, vault material, approval or reviewer absent. A passing static `make` check alone does **not** pass T07.

## T08 — Usable isolated restore / operator recovery (deployed Test first; Production gate separate)

**Identities/context:** authorized Database/Recovery Operator and independent observer according to the approved operational runbook. Use Test or an approved isolated recovery environment; never the live Production SQLite volume.

1. Follow the canonical `docs/database-recovery-runbook.md` and the existing `make server-recovery-rehearsal ENV=test ...` procedure with a verified Test off-host backup and explicit immutable receipt/manifest IDs.
2. Require an isolated restore (no existing environment data overwritten), SQLite `PRAGMA integrity_check`, migration verification, backend health through approved HTTPS, and signed reconciliation of stored business records. Record original off-host backup source, object version, SHA, environment, revision and evidence path without secrets.
3. Measure and record actual RPO (maximum 24 h) and RTO (maximum 4 h). Evidence must report actual measured values, not a promised target.
4. Stop/remove **only** containers, volumes and ports created for this isolated rehearsal. Check remaining test resources and expected port release. Do not use `server-restore-apply` on the live environment.

**PASS:** actual isolated restore evidence and measured objectives pass, complete cleanup. **FAIL:** integrity/recovery/health/RPO/RTO failure. **BLOCKED:** off-host backup, approvals, independent recovery operator or evidence unavailable. Passing Test does not automatically PASS Production.

## T09 — Acceptance and Production STOP decision (one developer may complete software column)

**Identities/context:** release owner and authorized independent Production approver; no Production mutation. Distinguish two records explicitly:

1. **Software acceptance**: record T01–T04 and, where available, T05; matching-sha LOCAL, CI, and successful regression evidence. A sole developer may mark this **PASS**.
2. **Operational acceptance**: record T06–T08 independently with actual Test/Production people and evidence. If any remains BLOCKED, record it verbatim and **do not** mark the Production operational gate PASS.
3. Compare six Bite 35.7 launch gates, 35.5 independently approved financial initialization and the named administrator recovery evidence. Missing evidence must remain **BLOCKED**. This bite never initiates Production enrollment, import or activation automatically.
4. Record final status, actual signoff people (never invented names), UTC timestamp, unresolved risks, and next responsible party. Verify no test-created Docker containers/ports remain.

**PASS (software only):** T01–T04 and matching-sha CI pass, open operational gates explicitly documented. **PASS (operational):** authorized human and recovery gates actually observed and approved. **FAIL:** a false PASS, fabricated independent approval or unauthorized Production operation. **BLOCKED:** prerequisites incomplete.

## Glossary impact

Add to the ERS glossary: **Named Human Application Administrator**, **Recovery Custody Locator**, and **Owner-Unavailable Recovery** using definitions in the linked 35.6 runbook. Preserve existing GLOBAL/Tenant Actor boundaries and backup/recovery definitions.
