# Byte 35.6S.1A — TRN Environment and Deployment: Manual Acceptance T01–T12

**Baseline:** record the exact accepted release revision, selected latest TST-approved SHA, GitHub deployment run and training change approval in your private evidence record. Do not substitute the 1096 feature-branch SHA for the eventually accepted Test release SHA.

**Test identities:** *Release Operator* (authorized GitHub Test and TRN deployment), *Infrastructure Operator* (approved Hetzner/1Password administrator), *Training Application Administrator A/B* (two individually controlled TRN Application Administrator accounts), *Training Tenant Administrator* (approved Tenant Actor), *Customer Support Specialist* (her own `TENANT_VIEWER` login), *Training Coordinator* (observer). Assign real responsible persons before T03; responsibility names are not application Roles.

**Status rules:** **PASS** requires the stated real result; **FAIL** requires an observed defect or breach; **BLOCKED** means a required capability, approval or environment is missing. The software-only tests never count as a real deployed backup/restore, authorization, trainee login, or Production release approval. Preserve the private evidence of exactly what was observed; do not capture secrets, CPF, private customer data, session cookies or passwords.

## T01 — Offline source and safety contract

**Identity:** Development/Release Operator. **Environment:** LOCAL Mac, existing single Git checkout. **Precondition:** patch applied to the supplied committed SHA; working LOCAL database preserved.

1. Confirm branch/SHA and that `git diff --check` passes.
2. Execute:

```bash
cd ~/projects/EnterpriseRemoteSystems
make trn-deployment-check
make byte356s1-onboarding-check
```

**Expected:** 17+ TRN regressions and the existing 25 onboarding regressions pass without Docker volume mutation, Test/Production credentials or persistent database changes. **PASS:** all return `0`. **FAIL:** any assertion or changed application data. **BLOCKED:** missing dependencies. **Cleanup:** none; do not run database reset.

## T02 — Prove destructive operations fail closed for TRN

**Identity:** Release Operator. **Environment:** LOCAL (no deployed TRN operation). **Precondition:** no Docker access required.

1. Run the offline regressions from T01; inspect their `require-non-production` and unsafe `.env.training` cases.
2. Review the training `server-pull` and `server-down-volumes` targets in `Makefile` and the normal Development replace-db guard.
3. Optionally execute the read-only Make syntax check, which does not run Docker:

```bash
cd ~/projects/EnterpriseRemoteSystems
make -n server-down-volumes ENV=training
make -n server-replace-development-db ENV=training
```

**Expected:** the actual guarded operations are rejected by the automated tests; `make -n` only prints recipes and **does not prove rejection**. **PASS:** guarded negative regressions pass and training reset is not allowed. **FAIL:** `down -v` or DEV replace-db can execute against TRN. **BLOCKED:** contract not tested. **Cleanup:** none.

## T03 — Confirm actual human approval, 1Password and backup custody

**Identity:** Infrastructure Operator; independent release reviewer. **Environment:** GitHub UI and approved 1Password UI. **Precondition:** written approval to establish persistent TRN on existing Hetzner VM.

1. Open GitHub repository → **Settings → Environments → training**. Verify it exists, has independent required reviewers configured, and contains only restricted TRN deployment secrets; record reviewer policy, not secret values.
2. Open 1Password. Verify the distinct `ers-training` vault with runtime secrets and an S3 credential restricted to `ers-backups/training`; check that the training deployment service account cannot read `ers-development`, `ers-test`, `ers-production`, `ers-recovery` or `ers-automation-bootstrap`.
3. Confirm `JWT_SECRET`, ledger keys, cookie name, S3 key/profile and stored passwords are independent of all other deployed environments. Do not display their values in shared evidence.
4. Verify no E2E identity or `E2E_ADMIN_PASSWORD` is permitted in TRN.

**Expected:** independent custody and least privilege are directly observed. **PASS:** reviewer confirms each setting and capability. **FAIL:** an improperly scoped token/key, shared session secret, or missing required reviewer. **BLOCKED:** no authorized vault/GitHub reviewer. **Cleanup:** close sensitive browser tabs; do not copy secret values.

## T04 — Read-only shared Hetzner VM capacity and ownership preflight

**Identity:** Infrastructure Operator. **Environment:** approved Hetzner Linux SSH shell, `test` checkout, not PRD shell. **Precondition:** Test has the accepted code and Python 3.

```bash
cd /opt/EnterpriseRemoteSystems/test
python3 -B scripts/ers-trn-preflight.py check-host \
  --server-root /opt/EnterpriseRemoteSystems
```

**Expected:** `PASS: TRN preflight (read-only)`, 2 GiB available RAM, 5 GiB free disk, 2+ CPUs, load/headroom threshold and known Docker ownership; review current PRD metrics additionally. **PASS:** result and PRD capacity/availability reviewed. **FAIL:** host is oversubscribed or Docker resource ownership is unexpected. **BLOCKED:** cannot inspect. **Cleanup:** none; no container created.

## T05 — Select the latest TST-approved candidate, not DEV or arbitrary branch

**Identity:** Release Operator. **Environment:** GitHub Test deployment and authorized Test Linux shell. **Precondition:** latest successful TST release rehearsal with deployed Playwright evidence.

```bash
cd /opt/EnterpriseRemoteSystems/test
TEST_REVISION="$(git rev-parse HEAD)"
TEST_TREE="$(git rev-parse 'HEAD^{tree}')"
python3 -B scripts/ers-trn-preflight.py verify-test \
  --marker "release-rehearsal-passed/${TEST_TREE}.passed" \
  --revision "$TEST_REVISION" --tree-sha "$TEST_TREE"
```

**Expected:** exact SHA/tree from Test matches marker and verified Playwright release-rehearsal evidence. Separately confirm human release approval. **PASS:** marker and approval are real and current. **FAIL:** mismatched SHA, source tree or invalid evidence. **BLOCKED:** marker absent or release not accepted. **Cleanup:** none.

## T06 — One-time TRN stack deployment and network isolation

**Identity:** Release and Infrastructure Operators. **Environment:** GitHub `training` Environment / Hetzner. **Precondition:** T03–T05 PASS, TRN checkout and `.env.training` provisioned through the operator runbook; DNS and approved edge change prepared.

1. Run **Deploy ERS Training (TRN) — approved Test candidate** from the `test` branch; supply exact Test SHA, approval identifier and literal confirmation.
2. Wait for required reviewer authorization and inspect every job step.
3. After successful rollout, on the approved host execute:

```bash
cd /opt/EnterpriseRemoteSystems/training
make server-trn-ps
make server-trn-backend-health
make server-trn-env-caddy-health
# These are read-only observations:
docker volume inspect ers-trn_backend-data --format '{{.Name}}'
docker network inspect ers-trn_default --format '{{.Name}}'
git rev-parse HEAD
```

**Expected:** 3 `ers-trn` services healthy; separate volume/network; deployed revision exactly the accepted Test SHA; no PRD/TST/DEV volume changes. **PASS:** exact match and independent availability. **FAIL:** wrong project, hidden replace-db, missing resource limits or changed other environment. **BLOCKED:** reviewer or capacity prerequisite missing. **Cleanup:** no container deletion; preserve TRN volume, log evidence privately.

## T07 — Verify independent backup and isolated restore rehearsal

**Identity:** Infrastructure Operator and separate evidence reviewer. **Environment:** Hetzner TRN, approved isolated recovery workspace (never the live TRN DB). **Precondition:** T06 PASS and a real verified TRN backup exists.

1. Locate the latest actual `app-*.db` and matching `.manifest.json` and `.offhost.json` under `/opt/EnterpriseRemoteSystems/training/backups`.

```bash
cd /opt/EnterpriseRemoteSystems/training
find backups -maxdepth 1 -type f -name 'app-*.db' -print | sort
```

2. Choose an actual absolute `app-*.db` path **from that output** and set `BACKUP_FILE` accordingly. Do not substitute a made-up timestamp, Test file, or Production backup. Execute these existing read-only verifications:

```bash
: "${BACKUP_FILE:?Set to the actual observed TRN backup path first}"
make server-backup-verify ENV=training BACKUP_FILE="$BACKUP_FILE"
make server-offhost-backup-verify ENV=training BACKUP_FILE="$BACKUP_FILE"
```

3. With independent approval for an isolated recovery **under TRN's own recovery directory**, stage the off-host object version using the existing non-destructive restore tooling:

```bash
RECEIPT_FILE="$BACKUP_FILE.offhost.json"
make server-restore-materialize-offhost ENV=training RECEIPT_FILE="$RECEIPT_FILE"
# The command prints the newly created recovery candidate directory.
# Find the exact staged DB only under that new directory, not the live backend volume:
find /opt/EnterpriseRemoteSystems/training/recovery -type f -name 'app-*.db' -print
```

4. Choose the **newly staged** absolute backup path from the printed recovery directory; set `RECOVERY_BACKUP_FILE` to that observed path. Execute the read-only restore verification:

```bash
: "${RECOVERY_BACKUP_FILE:?Set to the newly staged TRN recovery DB path first}"
make server-restore-verify ENV=training RECOVERY_BACKUP_FILE="$RECOVERY_BACKUP_FILE"
```

**Never execute `server-restore-apply` in this acceptance test.** Record the actual off-host receipt, object version, SHA, isolation directory, verification result and reviewer. If the independent isolated restore location cannot be established, mark **BLOCKED**, not PASS.

**Expected:** verified TRN-only S3 receipt and recoverable isolated copy, never a PRD object or live DB write. **PASS:** both verifications and independent isolated restore succeed. **FAIL:** data integrity/receipt mismatch. **BLOCKED:** no authorized isolated recovery. **Cleanup:** delete only test-created isolated recovery containers and copies after evidence retention; never delete `ers-trn_backend-data` or unrelated containers. Verify ephemeral test IDs are gone.

## T08 — Individual first-human TRN administrator enrollment

**Identity:** two independent named Training Application Administrators and authorized Infrastructure Operator. **Environment:** TRN, controlled offline maintenance. **Precondition:** T07 verified off-host backup, independent authorization and verified ability to stop ONLY TRN backend.

1. Follow the complete one-time procedure in the operator runbook, **H**. It requires an exact `TRN_ENROLL_BACKUP_FILE` and the three `TRN_ENROLL_*` approval/identity values.
2. The operator executes `scripts/ers-trn-enroll.sh` from the canonical TRN checkout. Input is prompted interactively and passed directly into `/app/enroll-human-admins`; no password file or SQL console.
3. On independent browsers, Admin A and Admin B sign in using their **own** 1Password credentials and complete first-password-change requirements. Confirm each is APPLICATION-global and neither is an E2E account.

**Expected:** two distinct real human GLOBAL Accounts and Actors, no fixture password, backend restarted/healthy and backup refreshed. **PASS:** both authenticated independently. **FAIL:** shared credential, duplicate Account, wrong scope, or unauthorized DB write. **BLOCKED:** missing approval, off-host backup, or second human. **Cleanup:** if enrollment fails, backend intentionally remains stopped; follow isolated recovery runbook. Do not reset TRN database.

## T09 — Create dedicated synthetic Tenant and support specialist account

**Identity:** Training Application Administrator, Training Tenant Administrator, Customer Support Specialist and Training Coordinator. **Environment:** browser `https://trn.enterpriseremotesystems.com`. **Precondition:** T08 PASS and HTTPS availability.

1. Global Admin creates one new synthetic Training Tenant via **Administration → Tenants**; do not use `TRAIN354C_A/B`.
2. Complete authorized creation/assignment of an eligible Tenant Administrator with the existing UI. If no eligible Actor is available, record BLOCKED.
3. Tenant Admin uses the approved People / Membership / Authentication workflow to create/associate the trainee's **individual** account and grant only `TENANT_VIEWER`.
4. Trainee signs in with her own password in a separate browser profile, performs first password change, signs out/in again, and sees only her Training Tenant.

**Expected:** no access to DEV/TST/PRD or unrelated Tenants, no global admin, and complete normal UI visibility within permitted Training context. **PASS:** direct observed UI result. **FAIL:** cross-Tenant leak, E2E credential usage, or missing individual account separation. **BLOCKED:** authorized Person/Actor workflow unavailable. **Cleanup:** sign out; preserve training Account and data.

## T10 — Prove account and training-data persistence across approved TRN redeployment

**Identity:** Training Coordinator, Release and Infrastructure Operators. **Environment:** TRN + Test GitHub UI. **Precondition:** real synthetic sample Person, Journey and training account present; another TST-approved revision or approved same-SHA TRN redeploy available.

1. In TRN UI, record non-sensitive identifiers and counts for one synthetic Person, Journey, and the trainee Account; do not record actual CPF or passwords.
2. Record exact current TRN deployed SHA. Execute **only** the authorized GitHub Training deployment workflow (never run DEV's DB replacement) for the chosen current TST-approved revision.
3. Return to TRN and confirm the same Account, Membership, Journey and synthetic records remain and the trainee's existing password still works. Confirm `ers-trn_backend-data` still exists and no replacement occurred.

**Expected:** all pre-existing persistent training objects remain unchanged except approved migrations. **PASS:** observed before/after equivalence. **FAIL:** data, roles or password reset caused by deployment. **BLOCKED:** no approved candidate/redeployment window. **Cleanup:** preserve training state.

## T11 — Negative-case gate verification without touching deployments

**Identity:** Development/Release Operator. **Environment:** LOCAL Mac, offline Python tests. **Precondition:** T01 software available.

```bash
cd ~/projects/EnterpriseRemoteSystems
make trn-deployment-check
```

**Expected:** tests reject wrong/missing Test marker, modified artifact evidence, insufficient RAM/disk, overloaded CPU, shared backup prefix, wrong environment and destructive operations. **PASS:** all negative regressions pass. **FAIL:** any unsafe input accepted. **BLOCKED:** test infrastructure absent. **Cleanup:** none.

## T12 — HTTPS, other-environment safety, and handoff

**Identity:** Infrastructure Operator, independent Release reviewer, Training Coordinator. **Environment:** HTTPS browser and authorized deployment UI. **Precondition:** TRN edge route approved, T03–T11 PASS or explicitly documented BLOCKED.

1. Open the TRN HTTPS `/api/v1/healthz` in a browser and confirm valid TLS, 200 response, and no mixed-mode HTTP fallback.
2. Independently verify DEV, TST and PRD health endpoints still respond normally; no application routes are exposed over insecure public HTTP.
3. Review GitHub TRN run, matching Test SHA/tree, capacity report, independent backup and restore evidence, two human accounts, trainee login and T01–T12 outcomes.
4. Record a named GO/NO-GO for **training access only**. It does not represent customer Production readiness or a 35.7 launch gate.

**Expected:** all required evidence exists and Production remains unaffected. **PASS:** named approval permits training access; **FAIL:** unhealthy other environment, TLS failure, lost training data. **BLOCKED:** missing isolated restore, review, DNS, or operator. **Cleanup:** sign out; preserve backup/history; only remove disposable test-created assets, never persistent TRN or any unrelated container.

## Glossary Impact

Terms **TRN Environment**, **Training Tenant**, **TST-approved release candidate**, **Training Coordinator**, and **Release Operator** are defined in the operational runbook. No ERS Role, AccountActor, Person, Tenant Support Access Lease or opening-balance semantics are added.
