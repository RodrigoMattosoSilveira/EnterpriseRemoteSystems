# ERS — Byte 35.4: Technical Tenant Operational Readiness

**Audience:** authorized ERS operator, release owner, Tenant Administrator for business signoff; **not** a customer training handout. Customer-facing instructions are exclusively in [Manual de operação da Entidade (pt-BR)](byte-35-4-manual-da-entidade-pt-br.md). Do not give customers Git, Docker, SQL, API or host-admin tasks.

**Status:** operational procedure and readiness assessment only; **no deployed state has been verified by writing this document**. The actual six Production launch gates are decided in **Byte 35.7**. Database initialization and opening-balance import belong to **35.5**. Named human admin enrollment and recovery/credential handoff belong to **35.6**. Do not treat this document or a successful static CI check as evidence those tasks are complete.

## O01 — Ownership, environment, credentials, STOP

**Actor:** authorized technical operator with named responsibility and a designated alternate; Tenant Administrator participates only in business acceptance. **Environment:** LOCAL or an explicitly authorized Development/Test training Tenant. Do **not** execute operational tests against Production without a separate approved change and stop/go record.

1. Record operator, date/time (with timezone), target environment (`LOCAL`, `development`, `test`), repository HEAD, Tenant, service owner, backup owner, and escalation contact in the evidence record. If any identity/authority is unknown, **BLOCKED**.
2. From the **repository root** run this read-only preflight:

```bash
pwd
git branch --show-current
git rev-parse HEAD
git status --short
```

**Expected:** intended branch/SHA, known and clean checkout. A dirty checkout is **BLOCKED** for a release exercise until explained; do not hard-reset or force-sync it.

3. Secrets and credentials must be held in the appropriate **1Password** collection (`ers-development` or `ers-test` for training; approved Production custody when later authorized). Do not place them in Markdown, Git logs, screenshots, shell history, or evidence files. No passwords are included in this material. Do not rotate secrets or impersonate a Tenant Administrator to pass a test.
4. Verify the business operator selected the intended Tenant using the application UI, not an `X-Actor-ID` header. The Application Administrator must never become an ordinary Tenant Actor.

**STOP:** wrong environment/tenant; unknown database/secret source; missing named operator; unexpected production endpoint; destructive command; missing verified fixture; CI failure; mismatch between live release SHA and accepted SHA; missing actual recovery evidence. Leave systems unchanged and record `BLOCKED` or `FAIL`.

## O02 — Release inventory and environment identity

**Actor:** release operator. **Environment:** LOCAL for preliminary checks; Development then Test once approved. **Prerequisite:** O01 completed.

1. Record accepted release SHA and the expected deployment target **separately**. A green run for an earlier SHA does not count.
2. From the source checkout, perform the offline documentation check and established local verification:

```bash
make byte354-readiness-check
make byte351-baseline-check
make byte352-i18n-check
make local-check
```

**Expected:** exit code 0 for every command, with no test unhandled exceptions. `make local-check` can take substantial time and may need local dependencies. It must not be skipped for promotion. No database reset is required by Byte 35.4.

3. In GitHub Actions confirm the CI run belongs to the **exact final committed SHA**, and record run URL and outcome. For deployed targets, verify the deployment revision through the established **read-only** release-identity evidence and configured `make server-smoke ENV=development|test` procedure, only after the designated operator approves that target.
4. For **deployed** environments use HTTPS exclusively; LOCAL development follows its normal configured URL and does not require HTTPS for this document. Never test insecure HTTP fallback in a deployed environment.

**PASS for local readiness only:** commands exit 0 and matching-SHA CI is green. **BLOCKED:** no permission to deploy, unavailable credentials, unknown revision or unavailable CI. This does not imply Production approval.

## O03 — Tenant/identity access matrix (UI first)

**Actor:** test coordinator with the actual named/authorized test identities. **Environment:** dedicated non-Production Tenant A and B, never a customer Tenant. **Prerequisite:** credentials verified privately through 1Password.

| Training identity | Intended context | Minimum check |
|---|---|---|
| APP | Global administration only | Global Tenants/Authentication; no ordinary Tenant Actor or Tenant ledger authority |
| ADMIN-A | Tenant A | People, Collaborators, planning and tenant administration according to permissions |
| ADMIN-B | Tenant B | Independent data; no Tenant-A leakage |
| EARN-A | Tenant A | Work Period/earnings paths, not expense-administration authority |
| EXP-A | Tenant A | Expense workflows, not earnings administration |
| COLLAB-A | Tenant A, own Person/Journey | Self-service and scoped receipts, without editing other People's financial information |
| SHARED | Same Person and Account, Tenant A and B | Distinct Tenant Actors, Memberships, Journeys, and financial histories |

Existing synthetic `E2E Authorization Admin Boundary` and `E2E Operational Isolation` can be used **only after fixtures, credentials and allowed states are individually verified**. They are not proof that standardized manual-testing Tenants are ready in every environment. Provisioning new permanent fixtures is a separately approved operation; do not reset the existing database for this bite.

**PASS:** all necessary identities authenticate using their own accounts, authorized navigation works, negative checks deny cross-Tenant access. **FAIL:** privilege escalation or cross-Tenant disclosure. **BLOCKED:** unavailable credential/fixture/permission; do not substitute APP for a Tenant identity.

## O04 — Monitoring and routine operating rhythm

**Actor:** named service operator. **Environment:** deployed Development/Test rehearsals, and Production **only after** activation approval.

| Cadence | Human responsibility | Evidence / STOP condition |
|---|---|---|
| At start of operating day | Verify app availability, selected environment, recent deployment/incident status | Timestamped HTTPS health response and release identity; report non-200 or unexpected SHA |
| Daily | Confirm latest **scheduled** backup ran and failure alerts were reviewed | Backup timestamp/receipt, verified status, alert owner; missing schedule/alert evidence = BLOCKED |
| Daily during Tenant onboarding | Confirm logins, role grants and tenant scope against approved access list | Named approvals and no extra privileged Accounts |
| Weekly or per agreed rotation | Review backup retention, off-host receipt, restore-point freshness, operator coverage | Redacted evidence; unverifiable retention or inaccessible storage = BLOCKED |
| After each release/change | Confirm migration safety, API availability, smoke, rollback/recovery owner | Change ticket, accepted SHA, test evidence, operator signoff |
| Periodic rehearsal (policy owner sets schedule) | Isolated recovery from authentic off-host material, including owner-unavailable conditions when required | RPO/RTO measurements, integrity/foreign-key checks, independent authorized technician |

**Read-only health observation** (substitute only the explicitly approved URL):

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://dev.enterpriseremotesystems.com/api/v1/healthz
curl -fsS -o /dev/null -w '%{http_code}\n' https://tst.enterpriseremotesystems.com/api/v1/healthz
```

**Expected:** each authorized, reachable target prints `200` with exit code 0. **This does not test authentication, Tenants, write readiness, or backup integrity.** Do not probe Production as part of a non-Production test. Preserve failures as incidents rather than masking them with retries.

## O05 — Backups, retention, recovery and data preservation

**Actor:** designated backup/recovery operator, not customer. **Environment:** approved non-Production exercise; use actual canonical recovery procedures in [Database Recovery Operational Runbook](../database-recovery-runbook.md) and [Bite 33.6.8 manual acceptance](../bite-3368/manual-acceptance-tests.md).

1. Identify the **effective** environment, database path, and backup/restore owner **before** any command. Do not assume `backend/data/app.db` is always the active database.
2. Inspect the documented target capabilities and prerequisites with the operator before execution: `make server-backup`, `make server-backup-verify`, `make server-offhost-backup-verify`, `make server-restore-verify`, and `make server-recovery-rehearsal`, each with explicit `ENV=` and the required validated backup input. **Do not execute** these commands merely because this runbook lists them.
3. For an **already existing Test-environment backup** whose path and provenance have been confirmed by the approved operator, run the existing **verification-only** commands. Execute these **only** from the authorized Test deployment checkout, after verifying that the selected `BACKUP_FILE` belongs to that environment and that its `.manifest.json` and off-host receipt are present. Do not improvise the path or run this example against Production:

```bash
# Authorized Test operator ONLY; example requires an independently identified backup.
ENV=test
BACKUP_FILE='/absolute/verified/test/backups/app-<actual-timestamp>.db'
test -f "$BACKUP_FILE" && test -f "$BACKUP_FILE.manifest.json" || {
  echo 'BLOCKED: expected existing Test backup/manifest not found'; exit 1;
}
make server-backup-verify ENV="$ENV" BACKUP_FILE="$BACKUP_FILE"
make server-offhost-backup-verify ENV="$ENV" BACKUP_FILE="$BACKUP_FILE"
```

**Expected:** both commands exit 0 and validate their corresponding authentic backup/manifest and off-host receipt. **STOP/BLOCKED:** wrong environment, absent receipt, missing manifest, missing credentials or verification error. These commands verify an existing restore point; they **do not** perform an isolated restore or attest to the recovery objectives.

4. Require verified off-host copy, checksums/receipt and backup freshness. A backup on the same host is insufficient evidence of an off-host restore. A rehearsal must restore to a **separate isolated environment**, never replace a live Tenant database.
5. Confirm actual SQLite `integrity_check`, `foreign_key_check`, isolated backend health, database compatibility, and measured recovery objectives. The existing default objectives are **RPO ≤ 24 hours** and **RTO ≤ 4 hours**; report measured values, not estimates.
6. Record the restore-point identity, actual immutable-object VersionIds when available, technician, timestamps, and evidence location. **STOP** if the recovery relies on unsupported policy assumptions or missing credentials.

**Production data rule:** no demo/reset/seed command, no manual SQL rewriting balances, no bare `make server-restore-apply`, and no automatic Production database replacement. Production initialization and signed historical `OPENING_BALANCE` import are **35.5** work, not 35.4. Preserve the established Hetzner `ERS Backups` project and `ers` bucket; advanced shared-bucket isolation **33.6.8E/F** remains deferred and unaccepted.

## O06 — Security, audit and role-change discipline

**Actor:** Tenant Administrator for authorized Tenant changes, Application Administrator for the global plane, security/release owner for review.

1. Use the normal UI to review role grants, Account status, Actor scope, Tenant Membership and audit history. Capture **redacted** before/after evidence for actual approved changes.
2. For support access, use an **approved temporary Tenant Support Access Lease** with bounded Tenant, permissions, reason and expiry; Tenant Administrator approval/termination governs effectiveness. A lease must **not** create Tenant Actor, Person, Membership, Collaborator or Role Grant.
3. Confirm non-Production access tests deny other Tenants' ledger, roles and Persons. A failed unauthorized test is a **PASS** only if it denies the attempt without disclosing another Tenant's data.
4. Never use application-global authority as a workaround for absent Tenant permissions or missing fixtures. Don't print authentication cookies or tokens in test logs.

**PASS:** scopes and audit behavior correct, separate identities; **FAIL:** unauthorized disclosure or write. **BLOCKED:** required tester credentials/fixtures unavailable.

## O07 — Incident triage and safe escalation

**Actor:** on-duty operator. **Environment:** record incident target precisely.

1. Capture incident ID, time zone, environment, affected Tenant(s), user-visible symptom, impact, last known good SHA, latest known valid backup and named owner. Redact sensitive values.
2. **Security issue or cross-Tenant leak:** stop unsafe transactions, restrict access via approved incident procedure, preserve immutable evidence, contact security owner immediately. Do not improvise role grants or global access.
3. **Incorrect financial balance/receipt:** pause relevant Tenant posting, record the Journey/ledger entry identifiers, ask authorized business owner to review. No bonuses as offsets, no direct ledger editing, and no signature on another person's behalf.
4. **Failed deployment or migration:** stop promotion, preserve original database/backups and logs, follow the existing [migration recovery gate](../bite-33-6-recovery-rehearsal-and-operational-runbook.md). A rollback is a separately approved action, not an automatic consequence of failed smoke.
5. **Unavailable backup/recovery:** mark `BLOCKED`, preserve evidence, invoke canonical recovery runbook with an authorized technician; never conduct a live restore as a drill.
6. Record disposition (`OPEN`, `MITIGATED`, `ESCALATED`, `CLOSED`), next owner and next action; customer-facing updates must not disclose infrastructure secrets.

## O08 — Release, on-call handoff and known launch dependencies

**Actor:** release owner and secondary operations owner. **Environment:** before promoting each accepted Bite 35 revision.

Complete a **human-reviewed** handoff covering: (a) accepted commit/CI; (b) local plus deployed smoke; (c) named Tenant business contact; (d) named backup/recovery owner plus alternate and escalation route; (e) current alerts/schedule; (f) last actual isolated restore with measured RPO/RTO; (g) approved user/role inventory; (h) unresolved blockers and rollback decision authority.

**Historical launch blocker (updated in 35.6):** earlier versions of `docs/database-recovery-runbook.md` and `ops/recovery-access.production.env` specified **LastPass**. Bite 35.6 replaces the locator contract with **1Password-only** references; a static check does **not** establish actual independent vault access or usable owner-unavailable restore. Keep recovery readiness **BLOCKED** until human access and an isolated restore are observed and approved.

**Further pending gates:** actual signed opening-balance import / Production initialization (**35.5**), named human administrator and recovery runbook (**35.6**), six Production launch gates and controlled first-Tenant activation (**35.7**). Deferred items **34.4**, **34.5**, **33.6.6+**, **33.6.8E/F** must remain visible as deferred rather than silently treated as implemented.

## O09 — Rehearsal cleanup, audit trail and outcome

**Actor:** technical test coordinator. **Environment:** LOCAL/non-Production only.

1. This Byte 35.4 documentation/checker suite **creates no Docker containers and makes no database changes**. Before testing, inventory existing containers and listeners if Docker is installed:

```bash
docker ps -a --format '{{.ID}} {{.Names}}'  # only if Docker is available
lsof -nP -iTCP:8080 -sTCP:LISTEN          # macOS; empty if nothing listens
```

2. If an **independent**, separately authorized automated test created containers, record their exact IDs/names **when created**. On normal completion or failure, stop/remove only those recorded IDs, then verify no test-created container remains. Never indiscriminately stop Docker containers belonging to other work.
3. If this training session started an identified LOCAL backend/frontend in dedicated terminals, stop **only those two processes** with Ctrl+C; verify port 8080 is released **if** it was owned by this session. Do not stop pre-existing services.
4. Close UI dialogs and sign out test identities; record any test-only financial mutations and the approved reconciliation/disposition. Do **not** delete audit history or real data. Do not reset a shared database to perform cleanup.
5. Attach the non-secret acceptance evidence using [readiness evidence template](byte-35-4-readiness-evidence.template.json) and [manual acceptance tests](byte-35-4-manual-acceptance.md). Keep passwords, `.env` files, bank data, session cookies, customer identifying data, and recovery secrets out of the evidence artifact.

**Outcome rule:** `PASS` requires all required test evidence and approvals; `FAIL` means reproducible defect, security exposure or financial inconsistency; `BLOCKED` means a missing/unsafe prerequisite or unverified real-world gate; `N/A` requires a written justification and reviewer approval. A machine check that passes only attests **document structure**, not people training, Production backups, operator availability or launch authorization.

## Glossary impact

No domain concept redefinition. This manual distinguishes **tenant functional** training from **technical operations**, preserving Person, Membership, Actor, Journey, Work Period, informed versus actual work, receipt direction, and opening-balance semantics. The exact customer's terms may be reviewed during Portuguese training, but such feedback is not authorization to modify the frozen launch scope.
