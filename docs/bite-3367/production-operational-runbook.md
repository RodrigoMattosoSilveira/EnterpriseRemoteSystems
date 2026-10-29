# Bite 33.6.7 — Production Operational Runbook

**Branch:** `994-bite-3367-two-human-administrators`
**Document review baseline:** `072a5628eab19bf8d496bc653d7c4a38e25dfc3a` (documentation refactor input, **not** an authorization to deploy that commit)
**Purpose:** Authoritative, controlled process for preparing and executing **actual Production enrollment** and accepting two independent human GLOBAL Application Administrators. A Production change approval, backup verification, stopped database writers, and release authorization are mandatory.
**Status:** Operational procedure; **not** a record that Production enrollment or acceptance has occurred.

**Related documents:** [Implementation and Architecture](implementation-and-architecture.md) explains what the system does; [Manual Acceptance Test Suite](manual-acceptance-tests.md) provides the detailed LOCAL/deployed Test MT-00–MT-11 sequence and individual execution records. **Do not use LOCAL test commands to enroll Production accounts.**

**Execution order:** Verify Gate 1 and Gate 2 evidence → obtain explicit Production change authorization → independently verify 1Password, Production backup/off-host/restore → identify exact Production image and volume → stop *all* Production database writers → enroll **once** → perform offline status verification → restart Production → complete human acceptance and sign-off. If any prerequisite is not met, **STOP**. No deferred Gate C step is required.

## 1. Operating authority and safety invariants

The Production launch uses two separate human GLOBAL `APPLICATION_ADMIN` identities. An existing automation administrator must remain unchanged. The organization explicitly accepts the residual simultaneous-human-unavailability risk. This runbook governs the enrollment that establishes those humans, *not* the deferred cryptographic recovery architecture.

**Do not treat operational attestations as automated proof:** `--offline-confirmed`, `--approval-reference`, `--operator-reference`, and `--backup-evidence-reference` are operator statements and identifiers. The executable does not verify the change-approval system, actual downtime, the legitimacy of the 1Password accounts, or whether the off-host backup is restorable. Record independently verified evidence for each.

**Known blocker requiring operator verification:** Legacy recovery documentation and `ops/recovery-access.production.env` contain LastPass-oriented references, while the accepted launch uses 1Password. Resolve or formally reconcile these references and demonstrate actual individual 1Password access **before** accepting Production. Do not bypass existing promotion controls or confuse a legacy LastPass preflight with 1Password verification.

The existing Production data-protection gates remain binding: verified backups and Hetzner S3 off-host copies, migration integrity, isolated restore/rehearsal, **RPO ≤ 24 hours**, and **RTO ≤ 4 hours**. Enrollment does not replace disaster recovery.

## 2. Operator preparation and guarded enrollment command

**Authorized operator:** A named, authorized Production operator on the approved deployment host. Use a change ticket with approval reference, maintenance window, operator ID, release/image SHA, database volume name, backup manifest/receipt IDs, and two distinct approved human identities. These are non-secret references; do not store credentials or tokens in the ticket.

**Input contract:** The offline executable `/app/enroll-human-admins` accepts one JSON object on stdin containing exactly two administrators (`actorKey`, `displayName`, `login`, `password`). The private prompt helper collects the two separate initial passwords (12–72 UTF-8 bytes); both must differ. The command creates both or neither and cannot be replayed after a successful enrollment. Production additionally requires `ENROLL_TWO_HUMAN_ADMINS` exactly. Never pass initial passwords in arguments, environment variables, shell tracing, files, or logs.

### 2.1 Reusable operator variables

For each environment, select and record non-secret values; do not paste personal passwords into the shell:

```bash
export APPROVAL_REF='CHG-<approved-change-id>'
export OPERATOR_REF='<operator-audit-identifier>'
export BACKUP_REF='BKP-<verified-backup-or-offhost-receipt-id>'
export ACTOR_A='<new-human-a-actor-key>'
export ACTOR_B='<new-human-b-actor-key>'
```

References are **identifiers**, with no blanks or secret values; accepted characters: letters, digits, period, `_`, `-`, `:`, `@`, `/`. Actor keys do not allow `/`. Record the exact chosen references in the change ticket. `ACTOR_A`, `ACTOR_B`, and the initial login emails must be unique and previously unused. Do not reuse Test identity credentials or 1Password items in Production.

### 2.2 Isolated Docker execution pattern

Use this pattern **only after** verifying the correct environment image and volume, checking backup evidence, stopping the backend, and confirming that no other process is using the database volume. Do not run against a live SQLite WAL database.

```bash
# ENVIRONMENT: one of test or production, set separately at the applicable Gate.
# IMAGE: copy the exact repository-promoted backend image ID while the backend runs.
# DB_VOLUME: inspect the existing deployment volume name before stopping.
# ENROLL_CONTAINER: unique name; never reuse a container unrelated to this test.
set -euo pipefail
umask 077
export ENROLL_CONTAINER="ers-3367-enroll-${ENVIRONMENT}-$$"
trap 'docker rm -f "$ENROLL_CONTAINER" >/dev/null 2>&1 || true' EXIT

python3 scripts/ers-two-human-admin-input.py | docker run \
  --name "$ENROLL_CONTAINER" --rm --interactive --network none \
  --mount "type=volume,src=${DB_VOLUME},dst=/app/data" \
  --env "APP_ENV=${ENVIRONMENT}" \
  --entrypoint /app/enroll-human-admins "$IMAGE" \
  --db /app/data/app.db \
  --environment "$ENVIRONMENT" \
  --offline-confirmed \
  --approval-reference "$APPROVAL_REF" \
  --operator-reference "$OPERATOR_REF" \
  --backup-evidence-reference "$BACKUP_REF" \
  ${PRODUCTION_CONFIRMATION:+--confirm-production "$PRODUCTION_CONFIRMATION"}

# Teardown: --rm removes a successful/failed run container; trap is a fallback.
docker ps -a --filter "name=$ENROLL_CONTAINER" --format '{{.Names}}'
# Expected: NO lines (if any line appears: FAIL, remove ONLY that test container).
```

**Before using the example:** define `PRODUCTION_CONFIRMATION=''` in Test or `PRODUCTION_CONFIRMATION='ENROLL_TWO_HUMAN_ADMINS'` in Production. The pipeline uses `set -o pipefail`; any input or enrollment failure blocks the Gate. The interactive Python tool prints all visible questions to stderr and never emits partial JSON on cancellation. The command is a **one-time** action; do not run it again on the same database after success. Never use `docker compose down -v`, and never delete the Production volume.

## 3. Gate 1 — Accepted LOCAL and CI evidence (prerequisite)

**Identity:** Developer on the committed feature branch. **Context:** LOCAL repository only; no Production session required. **Prerequisite:** Docker Desktop available for the complete `make local-check`, Go **1.26.2**, Node/Playwright dependencies installed.

1. On the feature branch, run:
   ```bash
   git branch --show-current
   git rev-parse HEAD
   git status --short
   ```
   For the original code baseline, the provided ZIP commit was `072a5628eab19bf8d496bc653d7c4a38e25dfc3a`. **For the deployed release**, record and verify the actual approved/promoted SHA and clean working tree; do not expect the old implementation SHA `92863de5...` after patches and merges. Stop on an unauthorized mismatch.
2. Against the candidate software revision, run:
   ```bash
   git diff --check
   make two-human-administrators-check
   make promotion-readiness-check
   make local-check
   cd frontend && npx playwright test && cd ..
   ```
3. Verify Go tests exercise create-only refusal, identity collisions, password policy, incomplete migration/catalog, rollback of **both** humans after the second audit insert is deliberately rejected, canonical GLOBAL permissions, preservation of pre-existing automation identity, mutual reset token single-use, and revoked sessions. Verify Python tests cover private input cancellation and read-only status refusal.
4. Commit and push only after LOCAL passes. Record new commit SHA, CI workflow URL, each passing job, and the result of `git diff --check`. Validate feature CI against the **new SHA**, not the baseline SHA.

**PASS:** All commands exit `0`, Playwright passes, relevant GitHub CI jobs are green at the new SHA, and no unexpected Docker test containers or occupied ports remain. **FAIL / promotion blocker:** Any missing test, wrong SHA, skipped Go tests, unexpected database changes, or inaccessible CI evidence.

**Docker cleanup:** `make local-check` may start containers; use its normal teardown and inspect `docker ps -a` for only ERS test-created containers. Stop/remove individually by recorded name or ID if a failed test left any behind; do not stop unrelated containers. Confirm localhost port 8080 is free using `lsof -nP -iTCP:8080 -sTCP:LISTEN` when the local test requires it. Expected: no listener after all ERS test services have been stopped.

## 4. Gate 2 — Accepted deployed Test rehearsal (prerequisite; never Production)

**Identity:** Authorized Test operator (`OPERATOR_REF`), then two independently controlled Test human Application Administrators. **Context:** Test GLOBAL Administration (`*`), not any Tenant. **Prerequisite:** Bite 33.6.7 Test deployment completed, fully migrated, with a separate Test-only database and backup; verify the Test origin, not Production.

1. Record Test deployment commit SHA, Test URL, change approval, and chosen Test human logins and actor keys. Ensure both Test logins/actor keys are absent before enrollment by signing in with an **existing Test Application Administrator**, choosing **Administration → Authentication**, and inspecting the list (use the search/filter UI). Do not create either new Test human through the UI; this is an offline-enrollment rehearsal.
2. From the deployment host with the Test backend running, execute:
   ```bash
   export ENVIRONMENT=test
   export DB_VOLUME=ers-tst_backend-data
   export PRODUCTION_CONFIRMATION=''
   export IMAGE="$(docker inspect ers-tst-backend --format '{{.Image}}')"
   docker volume inspect "$DB_VOLUME"
   docker image inspect "$IMAGE" --format '{{.Id}}'
   make server-backup ENV=test
   ```
   Record the exact generated backup path and verify it with:
   ```bash
   make server-backup-verify ENV=test BACKUP_FILE='<recorded-absolute-Test-backup-path>'
   ```
   Ensure `BACKUP_REF` matches the recorded verified backup evidence. This is the maintenance rollback point. Ensure the Test system is not participating in a migration recovery gate or backup job during the enrollment window.
3. Schedule Test maintenance, inform Test users, and stop the Test stack **without deleting volumes**:
   ```bash
   make server-test-down
   docker ps --filter "volume=$DB_VOLUME" --format '{{.ID}} {{.Names}}'
   ```
   Expected: no lines from the `docker ps` check. Also check `docker ps --format '{{.Names}}'` for `ers-tst-backend` (expected absent). If any other container/process has the volume open, STOP; do not run the enrollment.
4. Execute the isolated Docker enrollment pattern in §2.2 with two Test-only human credentials and approved Test references. Save only the successful, **non-secret** `account_id`, `actor_id`, `actor_key`, and normalized login fields in the change ticket. If the command fails, **do not** retry blindly; record the failure, verify the Test DB state and backup, and investigate.
5. While the backend is still stopped, create a **SQLite-consistent, private offline inspection copy** and run the read-only status script on the host (the backend Docker image includes `sqlite3` but does **not** install Python):
   ```bash
   STATUS_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ers-3367-status.XXXXXXXX")"
   chmod 0700 "$STATUS_DIR"
   docker run --rm --network none \
     --mount "type=volume,src=${DB_VOLUME},dst=/app/data,readonly" \
     --mount "type=bind,src=${STATUS_DIR},dst=/out" \
     --env "HOST_UID=$(id -u)" --env "HOST_GID=$(id -g)" \
     --entrypoint /bin/sh "$IMAGE" -ec \
       'umask 077; sqlite3 /app/data/app.db ".backup /out/app.db"; chown "$HOST_UID:$HOST_GID" /out/app.db'
   chmod 0600 "$STATUS_DIR/app.db"
   python3 scripts/ers-two-human-admin-status.py --db "$STATUS_DIR/app.db" \
     --actor-key "$ACTOR_A" --actor-key "$ACTOR_B"
   rm -f "$STATUS_DIR/app.db"
   rmdir "$STATUS_DIR"
   ```
   Record only the printed non-secret status, not the offline database copy. Treat the copy as sensitive, restrict access, and follow the organization’s secure deletion policy for its storage medium. Expected: `ready=true`, two different Account IDs, both `usable=true`, both `mustChangePassword=true` before first login. If `.backup` or the status command fails, **STOP**; do not restart and declare success without diagnosis.
6. Restart Test:
   ```bash
   make server-test-up
   make server-ps ENV=test
   ```
   Open the Test URL. Run the human acceptance test cases in §6 (using Test credentials). Record all PASS/FAIL results and audit evidence.
7. Execute negative cases against **another disposable migrated Test database** (not the live Test volume): existing login, existing actor key, repeated input, mismatched password, incomplete authorization catalog, missing audit trigger, and forced second-audit write failure. The Go unit regression tests are the safe way to inject these failures. **Do not damage the live Test audit triggers or authorization catalog.**
8. Remove Test-only scratch copies, test-created containers, and test-only port listeners. Verify `docker ps -a --filter 'name=ers-3367-'` shows none. Do not delete the shared Test database unless performing an independently approved, separately backed-up Test reset.

**PASS:** Test backup verified, backend fully isolated for offline enrollment, both identities independently usable, all §6 tests pass, negative regressions verified without affecting live Test, and clean Docker teardown. **Block:** Any inability to stop all Test writers, missing immutable audit, failed backup, incomplete migration, actor collision, secret leakage, or failed mutual recovery.

## 5. Gate 3 — Production enrollment (separate, explicit authorization)

**Identity:** Named authorized Production operator. **Context:** Production operational maintenance; no Tenant selected. **Prerequisites:** Gates 1–2 PASS at accepted hashes; reviewed Production change request and maintenance window; separately approved risk acceptance; Production backup and off-host recovery readiness PASS; two distinct authorized humans and private 1Password accounts prepared.

1. Independently confirm both humans have **their own individual 1Password accounts**, with appropriate access to environment-specific Production operational secrets and recovery materials. Confirm that Production deployment service-account tokens have only intended vault scope; humans are not required to share credentials. Demonstrate, in the 1Password UI and with audit/access evidence, that each human can access the specific material needed to operate and recover Production without borrowing the other human's login. Record **vault/item identifiers and access results only**, never secret values. Resolve any LastPass/1Password locator mismatch; do not weaken existing 1Password preflights.
2. Confirm Production branch/release SHA, exact Docker image ID, Production origin and maintenance approval. Check Production settings: `APP_ENV=production`, bootstrap disabled, no E2E account provisioner. Confirm there is no armed migration/deployment recovery gate. Capture existing admin/access baseline without printing secrets.
3. Perform and record the Production backup and off-host checks **while the backend is still running**:
   ```bash
   make server-backup ENV=production
   make server-backup-verify ENV=production BACKUP_FILE='<recorded-absolute-Production-backup-path>'
   make server-offhost-backup-verify ENV=production BACKUP_FILE='<recorded-absolute-Production-backup-path>'
   make server-recovery-rehearsal ENV=production \
     RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME='app-<verified-backup-timestamp>.db'
   ```
   Validate the resulting manifest/receipt identifiers, backup SHA-256, off-host object identity, evidence timestamp, selected revision/tree, and RPO/RTO proof. Verify `PRAGMA integrity_check`, migration checks, and app boot through the rehearsal evidence. **RPO ≤ 24 h and RTO ≤ 4 h** are binding acceptance conditions. Never run `server-restore-apply` merely to enroll administrators.
4. Set and record:
   ```bash
   export ENVIRONMENT=production
   export DB_VOLUME=ers-prd_backend-data
   export PRODUCTION_CONFIRMATION=ENROLL_TWO_HUMAN_ADMINS
   export IMAGE="$(docker inspect ers-prd-backend --format '{{.Image}}')"
   docker volume inspect "$DB_VOLUME"
   docker image inspect "$IMAGE" --format '{{.Id}}'
   ```
   Confirm `/app/enroll-human-admins` exists inside the accepted image and is from the approved release. Confirm `BACKUP_REF` points to the verified Production off-host evidence, `APPROVAL_REF` to signed change approval, `OPERATOR_REF` to the named operator.
5. Notify stakeholders of downtime; stop Production cleanly **without deleting any volume**:
   ```bash
   make server-prod-down
   docker ps --filter "volume=$DB_VOLUME" --format '{{.ID}} {{.Names}}'
   docker ps --format '{{.Names}}' | grep -Fx 'ers-prd-backend' && echo 'FAIL: Production backend still running'
   ```
   Expected: no Docker container using the Production volume and no `ers-prd-backend`. If either shows up, **do not proceed**. Independently ensure no host-side SQLite writer or one-off recovery container remains. Record the verified maintenance isolation.
6. Run §2.2 exactly once, using **two Production-only human identities** and distinct passwords privately recorded in the proper human 1Password accounts. Verify `exit 0` and exactly two distinct success lines with no sensitive credentials. Never retry automatically. If any error occurs, stop and escalate; the database transaction should roll back, but verify this using a fresh offline status check/backup rather than assuming success or failure.
7. Before restarting, run the identical private, consistent SQLite `.backup` + Python status verification procedure in Test Gate 2 step 5, using the verified Production `DB_VOLUME`, `IMAGE`, `ACTOR_A`, and `ACTOR_B` variables; this inspects a copy **not** the live database. Repeat a controlled non-secret status check after first password change. Compare approved Account/Actor IDs with the enrollment result and audit records. Do not print password hashes or password-reset tokens.
8. Restart and verify Production:
   ```bash
   make server-prod-up
   make server-ps ENV=production
   ```
   Perform public smoke and health validation required by the established Production release procedure. Have each human execute the acceptance cases in §6 using independent browsers. Obtain sign-off before declaring the Gate complete.

**PASS:** Approval, off-host backup, independent 1Password access, immutable audit, isolated enrollment, two independent accounts, recovery rehearsal and operational human testing all verified. **Block:** Any missing evidence, failed 1Password access, unverified image, incorrect volume, nonzero command exit, secret exposure, or failed access/recovery test. Production operator must restore service safely and activate the approved incident/rollback process as needed; **do not** automatically overwrite Production with a backup after a failed enrollment.

## 6. Gate 4 — Human administrator acceptance (Test first; Production only when approved)

For each test, record the environment, URL, release SHA, time (UTC), actual human identity/login, actor key, Account ID, selected context, operation, outcome, audit correlation/reference, and a PASS/FAIL verdict. **Never record a password, recovery token, session cookie, authorization header, or secret in the evidence.** Use independent browser profiles to avoid accidentally sharing authentication sessions. The navigation names below refer to the existing UI; if a menu is renamed, record the exact observed label.

### TC-01 — Human A: first login and forced credential change

- **Identity:** Human Administrator A, Production/Test-specific personal login from approved enrollment. **Context:** GLOBAL Administration (`*`); not a selected Tenant.
- **Prerequisite:** A enrolled with `mustChangePassword=true`; backend restarted; A possesses only A's unique initial credential.
- **Actions:** Open the exact environment HTTPS URL in Browser Profile A; choose **Sign in**; enter A's login and initial password; submit. Verify ERS forces **Change Password** before ordinary Administration actions. Enter A's current initial password, A's **new private** password (minimum 12 characters, ≤72 UTF-8 bytes), repeat, and submit. Expect logout/session revocation. Sign in again with A's new password. Use the application navigation **Administration → Authentication**, then **Administration → Authorization**, without switching into a Tenant.
- **Expected:** Only A's account is authenticated; first change succeeds; initial password is rejected; new login works; GLOBAL Administration pages are authorized; status shows `mustChangePassword=false` for A.
- **PASS:** All expectations meet. **FAIL / blocker:** Automatic permanent login without first password change, wrong GLOBAL Actor, access only through legacy headers, or inability to navigate Administration.

### TC-02 — Human B: independent first login

- **Identity:** Human Administrator B using B's private login and new password, **different browser profile**. **Context:** GLOBAL Administration (`*`).
- **Actions:** Repeat TC-01 for B (do not use A's browser profile, cookie, or 1Password login); then, with A still signed in, show the two profiles can independently load **Administration → Authentication**. Use **Administration → Authorization** in B's profile. Verify two different human Account IDs and Actor IDs against the enrollment record.
- **Expected / PASS:** B is independent, is forced to change B's initial password, and can administer without A's session. **FAIL / blocker:** Shared session, duplicated Account/Actor identity, or Tenant-only privilege.

### TC-03 — A assists B; token single-use and old session invalidated

- **Identity:** **Actor A** issues the token as an authenticated GLOBAL Application Administrator; **Actor B** uses it to recover B's account. **Context:** GLOBAL Administration for issuer; public reset screen for B.
- **Prerequisite:** B has a valid, separately active authenticated session in Browser B; A and B have completed first password changes. Record B's account ID from the Administration account list.
- **Actions:** In Browser A choose **Administration → Authentication**; locate the **B login** in the account list and confirm its Account ID before acting. Choose the password-reset-token action for **B only**; copy the token or reset link via an approved secure, short-lived channel to B **without storing it in test evidence**. In a third, independent browser profile with no existing B session, open the app's **Password Reset** page using the single-use reset link. Enter B's privately chosen replacement password, confirm, submit. In Browser B refresh the previously authenticated Administration page; ERS must require B to sign in again. Verify B's old password fails, B's replacement password succeeds. Reopen the same reset link once: it must fail as used/invalid. Discard the token and clear its copied/browser history after the test.
- **Expected / PASS:** Authorized issuance, token valid for one successful reset only, B's sessions revoked, A's own account and session unaffected, new B password effective, and the issued-token audit entry attributed to A. **FAIL / blocker:** Token reuse, cross-account reset, continued B session, missing audit attribution, or A being logged out unexpectedly.

### TC-04 — B assists A (reverse recovery)

- **Identity:** **Actor B** issues the token; **Actor A** receives it. **Context:** GLOBAL Administration for B.
- **Prerequisite:** A signed in under A's changed password; B signed in under B's recovered password. Record A's Account ID.
- **Actions:** In Browser B open **Administration → Authentication**, select A's exact account, issue a reset token for A; relay the token privately. In a fresh third browser profile reset A's password, verify A's existing authenticated browser session is revoked on refresh, verify A's prior password is rejected and A's recovered password works, and verify the link cannot be reused.
- **Expected / PASS:** Mirror-image of TC-03; audit attributes issuance to B, not A. **FAIL / blocker:** Any one-way recovery dependency, token reuse or absent audit.

### TC-05 — Authorization and audit controls

- **Identity:** Either A or B separately; cross-check the other human's activity. **Context:** GLOBAL Administration (`*`), not a Tenant.
- **Actions:** Navigate **Administration → Authorization** and inspect both human authorization Actors. Verify both are active with `APPLICATION_ADMIN` and a GLOBAL `*` grant; they are not Tenant actors or Persons. Navigate **Administration → Audit Logs** and locate the enrollment event `authentication.human_admins.offline_enroll` for each Account ID reset-token issuance `authentication.password_reset_tokens.issue` and consumption `authentication.password_reset_tokens.consume` for TC-03 and TC-04; record timestamp and actor attribution. The offline enrollment audit's actor is the **offline operator reference**, **not** a fictitious authenticated human session. Compare approval/operator/backup references against the change record. Where UI filtering cannot expose this detail, use a **read-only, approved SQLite-safe offline DB copy** and query the audit fields (not secret fields). Do not mutate append-only audit records.
- **Expected / PASS:** Two distinct valid GLOBAL grants, accurate issuance-attribution, two offline enrollment events, no change to legacy automation account/grant, no audit secrets. **FAIL / blocker:** Missing/wrong-grant or missing/misattributed audit. Authorized self-deactivation and final usable administrator protections must continue to pass the existing backend/authorization regression suite; do not intentionally deactivate humans in Production to test a failure case.

### TC-06 — 1Password individual access and independent operability

- **Identity:** A independently, then B independently, each in their own 1Password and ERS browser profile. **Context:** Production/Test vault appropriate to environment.
- **Actions:** A signs in to 1Password with A's own identity, opens the approved environment vault/item **by its recorded name**, and confirms read access without exposing contents in screenshots or logs. A signs out; B repeats under B's own identity. Check each can obtain needed recovery and deployment materials, with least privilege and without using the other's personal MFA or passwords. Confirm environment-specific deployment service accounts remain isolated; verify no Production secret is checked into Git, `.env` examples, logs, or artifacts.
- **Expected / PASS:** Both can operate individually with approved 1Password access and secret boundaries. **FAIL / blocker:** Shared human credentials, missing access, overbroad deployment service account, broken credential materialization, or retained dependency on LastPass-only access without accepted remediation.

### TC-07 — Negative/refusal and last-administrator safeguards (non-Production only)

- **Identity:** Test operator on disposable fully migrated LOCAL/Test DB; one active Test Application Administrator for the authenticated UI cases. **Context:** Test GLOBAL Administration.
- **Actions:** Run focused Go tests for duplicate actor/login and replay, missing/invalid catalog, audit-trigger failure and forced second-row audit failure. Verify enrollment exits nonzero and **no new account, actor, grant, or audit** remains. With the existing Test Application Administrator signed in, verify the UI refuses self-deactivation; validate the existing authorization regression rejecting removal of the final active Application Administrator grant or Actor. Do not manipulate the live Production administrator set to demonstrate these refusals.
- **Expected / PASS:** Refusals without partial writes or security downgrade; existing last-admin controls remain effective. **FAIL / blocker:** Silent idempotent reconciliation, partial enrollment, ability to remove the final usable administrator, or leaked credentials.

## 7. Evidence, cleanup and closeout

**Capture in the signed change/release gate:** source branch/baseline SHA, approved deployed release SHA and image ID, clean release evidence, local/CI results, Test and Production image IDs, database volume names, verified backup manifests, off-host receipt/SHA-256, recovery rehearsal evidence and RPO/RTO, approval/operator references, two human login/Actor/Account identifiers, initial-password-change completion, audit references, Test and Production TC-01–TC-06 PASS results, 1Password access matrix, residual-risk approval, and Docker cleanup evidence.

**Explicit cleanup:** For each `ers-3367-enroll-*` test-created container, `docker ps -a --filter name=ers-3367-enroll-` must show no entries after test completion. If a test-created container remains, remove **only its recorded ID**, e.g. `docker rm -f '<recorded-ers-3367-container-id>'`. Confirm no temporary status or copied database files remain; erase them according to the organization's secure data-handling policy. If Test/LOCAL started a temporary backend, stop **only** that test-created container/service and confirm port 8080 is released when expected. Do not run `docker system prune`, `docker stop $(docker ps -q)`, or `docker compose down -v` against shared hosts.

**Promotion:** After Gate 1 + Gate 2 PASS, merge `994` to the accepted Bite 33.6 branch `945`, then promote through the approved Development → Test → Production hierarchy. **Production enrollment requires Gate 3 approval even if software is deployed.** Do not merge `990` or `991`. After Gate 3 + Gate 4 PASS, sign the simultaneous-human-unavailability risk acceptance and close Bite 33.6.7. If any Gate fails, halt and repair/retest; do not claim Production readiness.

## 8. Domain terminology and document maintenance

See [Implementation and Architecture](implementation-and-architecture.md#5-glossary-definitions--add) for the agreed definitions. Any change to safeguards, CLI flags, approved deployment targets, or custody procedures requires reviewed documentation and acceptance updates **before** the Production operation. This document's commands are not approval to run them.
