# Bite 35.6 — Application Administrator and Operational Recovery Runbook

**Status:** Software/runbook deliverable; **not** Production authorization.  **Working directory:** `~/projects/EnterpriseRemoteSystems` (one repository; no extra worktree).  **Scope:** named human GLOBAL Application Administrators, 1Password-only credential custody, and established database/administrator recovery.  **Production data:** no changes made by this document or by `make byte356-operations-check`.

## 1. Roles, authority, and stop rules

- **Developer/tester (one human permitted):** runs LOCAL/CI static and disposable-db checks. A single developer does **not** demonstrate two-human custody or mutual administrator recovery.
- **Application Administrator A and B:** two **different actual humans**, separately enrolled with distinct Accounts/Actors and personally controlled credentials. These are GLOBAL administrators, not Tenant Actors. The existing `backend/cmd/enroll-human-admins` operation creates exactly two in one transaction; do **not** invent a single-admin bypass or reuse a bootstrap/E2E account.
- **Deployment/Recovery Operator:** named human approved for the precise environment, with an independently authorized change request. Can be an administrator only if the approved separation-of-duties policy permits that role; a simulated second username does not establish a second human.
- **Independent reviewer/approval holder:** a different human where the existing security/financial/recovery acceptance requires one. Record **BLOCKED** until available, rather than forge authorization.

**STOP:** Unknown environment, unapproved change, absent verified backup/off-host receipt, non-isolated DB writers for offline enrollment, unknown 1Password access, nonmatching revision, or any SQL/restore/evidence mismatch. Do not reset or overwrite a working LOCAL, Test, or Production database. Do not treat a passing static test as an operational GO.

## 2. Existing software — no new implementation path

| Need | Existing, authoritative operation |
|---|---|
| Controlled enrollment of two GLOBAL humans | [`docs/bite-3367/production-operational-runbook.md`](../bite-3367/production-operational-runbook.md), including §2.2; `/app/enroll-human-admins` |
| Read-only canonical two-actor/account status | `scripts/ers-two-human-admin-status.py` (on a **protected offline `.backup` copy**, not a live Production DB) |
| Normal first login and mutual password recovery | 33.6.7 runbook §6 TC-01–TC-06; existing ERS Authentication UI |
| Backups, off-host copies, isolated restore and RPO/RTO | [`docs/database-recovery-runbook.md`](../database-recovery-runbook.md) and existing `make server-backup`, `server-offhost-backup-verify`, `server-recovery-rehearsal` |
| Machine-readable recovery inventory | [`ops/recovery-access.production.env`](../../ops/recovery-access.production.env) (non-secret metadata only) |
| Human-readable source of recovery prerequisites | [`docs/database-recovery-runbook.md`](../database-recovery-runbook.md) |

**Do not** run one-time enrollment again against an already enrolled database. This bite does not create a second enrollment command, REST endpoint, credential store, or emergency recovery bypass. Deferred Bite 33.6.6+ remains deferred.

## 3. 1Password-only recovery inventory (required, not verified)

The canonical source is the **1Password** `ers-production` vault. This is the same Production vault already used by the deployment secret templates. The following additional **required recovery item identities** are specified by the committed, non-secret manifest; the names are a provisioning/verification contract, **not a statement that those items already exist**.

| Manifest key | Required 1Password locator | Intended recovery material |
|---|---|---|
| `RECOVERY_PRODUCTION_ENV_SOURCE` | `op://ers-production/recovery-production-env/document` | Current, exact deployed `.env.production` |
| `RECOVERY_S3_CREDENTIAL_SOURCE` | `op://ers-production/recovery-hetzner-s3/document` | Current backup AWS profile/file |
| `RECOVERY_HOST_ACCESS_SOURCE` | `op://ers-production/recovery-host-ssh/document` | Authorized host/replacement access |
| `RECOVERY_HETZNER_CONSOLE_SOURCE` | `op://ers-production/recovery-hetzner-console/document` | Hetzner Console access procedure |
| `RECOVERY_DNS_SOURCE` | `op://ers-production/recovery-dns/document` | DNS provider access procedure |

These `op://` values serve as **human-reviewed locators** in this recovery inventory. Do not assume a document attachment can be exported with a generic `op read` command; use the authorized 1Password UI and the item's verified type/permissions. Never copy credentials into Git, test logs, ChatGPT, or CLI arguments. Record only non-secret vault/item identifiers and observed access status.

Before any Production operation, the authorized reviewer must verify each item actually exists, contains the latest deployed value (not its plaintext in evidence), and is available to each approved recovery technician independently of the system owner. Each technician must have individual 1Password/GitHub/Hetzner/DNS access, MFA and recovery capability that **does not depend on the owner's device**. The deployment service account must not gain human recovery privileges by accident. A sole operator can check the inventory/documentation locally, but **cannot PASS this independent-human gate**.

**Legacy correction:** The earlier LastPass `ERS-Recovery` locator scheme has been removed from the canonical manifest, owner-unavailable preflight and active recovery runbook. Historical Bite 33 references may describe its former state but are **not** valid current credential locations. Real vault migration/access is a distinct authorized operational action and remains **BLOCKED** until observed; merely rewriting source locators does not migrate a secret.

## 4. One-human LOCAL / CI verification (safe now)

**Identity:** Developer/tester; **context:** LOCAL repository, no signed-in ERS session and no Production credentials. Run in the one existing work directory:

```bash
cd ~/projects/EnterpriseRemoteSystems
git branch --show-current
git rev-parse HEAD
git status --short
make byte356-operations-check
make owner-unavailable-recovery-readiness-check
make two-human-administrators-check
make promotion-readiness-check
make local-check
```

Record actual candidate HEAD and CI URL for that same revision. The first two commands use static contracts and synthetic/disposable resources; `make local-check` also runs other existing repository checks and may use test-created Docker resources. They do **not** access Production vaults or grant admin privileges. A check failing or missing tooling is **FAIL/BLOCKED**, not a reason to alter the system Python, reset LOCAL data or forge operator signoff.

**Expected:** all commands exit 0. `make byte356-operations-check` reports each contract check PASS and `RESULT: Byte 35.6 ... PASS`. The full suite must have no unexplained errors. Check that any test-created Docker containers are removed and ports released, without stopping unrelated containers.

## 5. Deployed Test verification — operator sequence, not a LOCAL workaround

**Identity:** Named authorized Test operator; **context:** Test/GLOBAL Administration. Required: approved Test change, accepted Test revision/image, verified backup and isolated restoration evidence, two named actual humans A and B with Test-only 1Password accounts/credentials.

1. Open the deployed Test HTTPS application. As the existing Test Application Administrator, select **Global administration**, then open **Administration → Authentication**. Confirm the planned human logins and Actor keys are not present. **STOP** if already enrolled; use the existing status and first-login acceptance instead of enrolling again.
2. Record Test backup SHA, off-host evidence, Test Docker image and database volume. Execute the existing 33.6.7 **Gate 2** steps in their written order. Never mount a live DB volume while SQLite writers run, never copy Production data into Test, and never run `docker compose down -v`.
3. Have **Human A** use A's independent browser profile and 1Password identity to sign in, complete the first-password-change requirement and open **Administration → Authentication** while GLOBAL context is selected. Record account/actor identifiers and audit reference but **not** credentials. Sign out.
4. Have **Human B** repeat independently using B's distinct browser profile and 1Password identity. The two Accounts and Actors must differ; neither is an ordinary Tenant Actor. Sign out.
5. Execute the 33.6.7 mutual recovery test: A initiates the authorized reset for B; B redeems it; verify single use and old-session revocation, and audit evidence. Follow the existing TC-03 procedure for exact UI operations. **Do not** invent a second person by controlling two logins yourself.
6. Independently verify Test-only vault access and scoped deployment service permissions, then execute the existing approved isolated restore rehearsal. Record measured RPO/RTO; objectives remain **≤24 h / ≤4 h**. A Test success does not assert Production success.
7. Stop/remove only created Test containers per the Gate 2 teardown, verify expected ports are free, and record results. Any unavailable human/approval/recovery prerequisites are **BLOCKED**, not PASS.

## 6. Production readiness — no automatic activation

**Identity:** Authorized Production release owner and independent approver; **context:** Production operational change, not an ERS browser Tenant context. **Do not execute these steps just to finish software acceptance.**

1. Reconfirm the exact accepted release SHA and Test evidence, security boundaries and 35.5 independently approved opening balances; require six 35.7 launch gates to be reviewed separately.
2. In a private approved session, verify the 1Password inventory of §3 using **two actual human identities**, owner-independent MFA and approved permissions, and review service-account isolation; record only non-secret evidence references.
3. Verify current Production/off-host backups and a fresh isolated restore using `docs/database-recovery-runbook.md`. Measure and record RPO ≤24 h and RTO ≤4 h; no restore-apply on live Production for rehearsal.
4. If enrollment is genuinely needed and approved, execute **existing** 33.6.7 Gate 3 with stopped writers, guarded one-time CLI and safe rollback/teardown. Never improvise a direct SQL insert, bypass the two-human requirement, or rerun enrollment after success.
5. Perform independent human Production TC-01–TC-06 acceptance and obtain explicit change/launch approval. If anyone/anything is missing, record **BLOCKED** and stop. This document does not authorize Production initialization, deployment or activation.

## 7. Recovery / incident operator handoff

**Named recovery owner** records change/incident ID, UTC timestamp, environment, deployed revision, observed symptom, last good verified backup + off-host receipt, vault access owners and escalation contact. Read the canonical `docs/database-recovery-runbook.md` and use its **offline isolated restore** commands first. Do not experiment on the live volume; preserve existing WAL/shm and backup evidence. If the owner is unavailable, verify each authorized technician's 1Password/source access without owner assistance. If access is unavailable, **BLOCKED; escalate through the designated external organizational channel**. Do not synthesize replacement Production JWT, ledger keys, account credentials or recovery keys.

After recovery, independently validate SQLite integrity and migrations, reconcile business entries, verify health and HTTPS through approved procedures, check role boundaries, and record actual outage and RPO/RTO. Remove only recovery-created containers/volumes and verify ports released; retain approved evidence. If the operator used another human's credentials, owner-only MFA or unverified source, the recovery gate has failed regardless of an apparently healthy app.

## 8. Evidence and acceptance record

Record for each test: `test_id`, `environment`, `actual_human/operator`, `administration_context`, `approved_change`, `candidate_sha`, `CI URL`, `backup_sha/receipt_reference`, `1Password item/access reference (not value)`, `observed behavior`, `expected behavior`, `PASS|FAIL|BLOCKED|N/A`, UTC start/end, cleanup confirmation, and reviewer. Use [Byte 35.6 Manual Acceptance](byte-35-6-manual-acceptance.md). Software acceptance by the sole developer may PASS while human, vault-access, usable restore and launch gates remain **BLOCKED**.

## 9. Glossary impact

**Named Human Application Administrator:** a real human's individually controlled canonical GLOBAL administrator Account/Actor, distinct from bootstrap automation and any Tenant Actor.

**Recovery Custody Locator:** a non-secret identifier for a required 1Password recovery item; its existence in Git is **not** proof of the item's existence, its currency or any operator's access.

**Owner-Unavailable Recovery:** the actual ability of an independently authorized technician to recover and verify ERS without the system owner's device, memory, credentials or approval.
