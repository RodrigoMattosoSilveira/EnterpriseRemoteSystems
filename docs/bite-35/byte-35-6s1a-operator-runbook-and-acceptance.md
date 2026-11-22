# ERS — Byte 35.6S.1A: Single Operator Runbook and Manual Acceptance (T01–T12)

**Purpose:** Establish a persistent, isolated Training (TRN) environment on the existing ERS Hetzner VM, then prove that it is safe for supervised training. This is the single operator procedure. Earlier TRN deployment and T01–T12 documents remain reference material, **not additional tests to repeat**.

**Document baseline:** `1096-356s1a-trn-environment-and-deployment` at `947b10f777b2941f48554347a33c25a754648b67`. **Do not deploy this feature SHA merely because it is printed here.** T05 selects the latest separately approved `test` revision and tree.

## Before T01 — How to use this runbook

**Use one private evidence record** (your existing approved change record or private operational note). Record for each T01–T12: test ID, **PASS/FAIL/BLOCKED**, actual human identity, UTC date/time, observed result, and evidence location (GitHub run URL, non-secret screenshot, non-secret output, or approved change reference). Do not put passwords, tokens, private keys, cookies, `.env.training` contents, customer identifiers, or credentials in the evidence record.

**Status rules:** **PASS** = every stated acceptance observation is supported by recorded evidence; **FAIL** = actual wrong or unsafe behavior; **BLOCKED** = a required person, approval, tool or evidence is unavailable. A deliberately printed `BLOCKED` inside a negative automated test is **not** a failed test when the test command exits successfully and reports `OK`. Do not turn a BLOCKED into PASS by assuming an approval exists.

**Your roles in this procedure:** You may be both the **Release Operator** (GitHub/actions) and **Infrastructure and credential owner** (Hetzner/1Password). You do **not** need to contact an imaginary separate “custodian” or obtain a new approval from yourself. Where the source design requires a **different human reviewer** (GitHub deployment approval, independent PRD-capacity/recovery review, final handoff), it really requires one. If that human or actual authorization is not available, record BLOCKED at that gate. Operational roles are not ERS application Roles.

| Location | Open/use | Identity |
|---|---|---|
| `LOCAL-MAC` | Your existing ERS checkout containing `Makefile` | You, Developer/Release Operator |
| `GITHUB-WEB` | `RodrigoMattosoSilveira/EnterpriseRemoteSystems` → Settings or Actions | You as authorized repository owner; **different human** for protected deployment approval |
| `1PASSWORD` | Authorized 1Password account with access to the appropriate vaults | You, credential owner |
| `HETZNER-TEST` | SSH into approved shared VM; `/opt/EnterpriseRemoteSystems/test` | You, authorized Infrastructure Operator (`deploy` only if approved) |
| `HETZNER-TRN` | Same VM; `/opt/EnterpriseRemoteSystems/training` after installation | Same Infrastructure Operator |
| `TRN-BROWSER` | `https://trn.enterpriseremotesystems.com` | Individual TRN administrators, Training Tenant Administrator and trainee |

**Non-negotiable protections:** Never reset or replace an existing LOCAL/TRN database. Never use `docker compose down -v`, `docker system prune`, `git clean`, Test/Production restore-apply, or E2E-admin provisioning as an onboarding shortcut. Never expose DEV/TST/PRD backups or keys to TRN. Preserve `/opt/EnterpriseRemoteSystems/test/{backups,recovery,release-rehearsal-passed,test.zip}`, the TRN data volume `ers-trn_backend-data`, and all unrelated containers. Public app traffic must use HTTPS. Do not use `sudo` to conceal ownership problems.

## Phase 1 — LOCAL software evidence (run before server changes)

### T01 — Identify the source and run TRN/onboarding regressions

**Identity/location:** You, Developer; `LOCAL-MAC`, repository root.

**Actions:**

```bash
pwd -P
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
ls -l Makefile
git diff --check
make trn-deployment-check
make byte356s1-onboarding-check
```

**PASS:** `Makefile` exists; the actual branch and full SHA are recorded; `git diff --check` succeeds; TRN tests report **23 / OK**, onboarding tests **25 / OK**. The onboarding test's simulated `BLOCKED` evidence is expected. **FAIL:** any actual test fails or command returns nonzero. **BLOCKED:** checkout or needed local tool unavailable. **Evidence:** command output and source SHA. **Cleanup:** none; do not touch working LOCAL database.

### T02 — Verify destructive-operation guardrails

**Identity/location:** You, Developer; `LOCAL-MAC`.

**Actions:**

```bash
make production-environment-guardrails-check
make byte354c-training-check
```

**PASS:** both commands exit 0 and report verified Production guardrails and 35.4C Training fixture preservation. **FAIL:** a guardrail regression fails. **BLOCKED:** commands cannot run. **Evidence:** existing output for these commands on this exact code revision. **Do not** run destructive Make targets to test the guard; `make -n` is not a substitute for these regressions.

### T11 — Complete the canonical LOCAL and negative-case gate

**Identity/location:** You, Developer; `LOCAL-MAC`. This test is performed here to avoid returning to the Mac later.

**Actions:** T01 already exercised the **23 TRN negative-case regressions** (wrong revision/marker, resource shortages, unsafe environment, isolation). Keep that result. Run the canonical check **once** for the actual candidate source revision:

```bash
make local-check
```

If you already have a successful `make local-check` result for the **same exact SHA/tree**, record that result instead of repeating it.

**PASS:** the T01 TRN regressions and canonical `make local-check` pass on the tested source. **FAIL:** any genuine assertion fails. **BLOCKED:** no reliable matching-SHA evidence or required tools unavailable. **Evidence:** logs/CI run and SHA. Do not reset LOCAL data or stop unrelated Docker containers.

## Phase 2 — Authorization and approved Test release (read-only checks first)

### T03 — Confirm GitHub protection, existing SSH credentials and Training-only 1Password access

**Identity/location:** You (repository owner and credential owner), `GITHUB-WEB` and `1PASSWORD`; a **different named GitHub reviewer** for later deployments. **Prerequisite:** a real authorized TRN change, recorded in your private evidence record. If none exists, **BLOCKED**; do not invent an approval identifier.

**A. Inventory the existing DEV/TST SSH secrets — no secret values required.**

1. **GitHub:** Open repository → **Settings → Secrets and variables → Actions → Repository secrets**. Mark whether each name is present: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_KNOWN_HOSTS`.
2. **GitHub:** Open **Settings → Environments → development → Environment secrets**, then **test → Environment secrets**. For those same four names, record their **effective location** for DEV and TST: `Environment` overrides `Repository`; a repository secret is effective where no same-named environment secret overrides it. There is no “Organization secrets” page to locate for this personal-account repository.
3. **GitHub:** Open **Actions → Deploy Enterprise Remote Systems**. Find **one successful DEV run** and **one successful TST run**. In each, open the deployment job and check that **Configure SSH**, **Deploy app stack**, and **Public smoke tests** succeeded. Record the run URLs and dates. Do not rerun deployments.
4. **You, as credential owner:** In the private evidence record, write: **“I am the credential owner. I confirmed the four effective DEV/TST SSH input names/scopes and successful deployments to the existing ERS VM.”** Add your name/date and the two run URLs. This is **your documented attestation**, not a fictional third-party “custodian approval.” If you cannot confirm these are the deployment inputs you control or cannot identify a retained authorized source for values you must install in TRN, record **BLOCKED**, and do not guess or extract values from GitHub (GitHub does not reveal stored secret values). The SSH host-key pin must still be independently verified before new installation; prior green runs alone are not host-key provenance.

**A PASS:** four effective names/scope locations recorded for both DEV and TST, both successful run URLs, and your truthful ownership attestation. **A FAIL:** evidence shows an unauthorized host or identity. **A BLOCKED:** a name is not effective for DEV/TST, or provenance genuinely unknown.

**B. Configure the GitHub `training` Environment — repository owner.**

1. **GitHub → Settings → Environments → training.** Create it only if it does not already exist.
2. Under **Deployment protection rules**, select **Required reviewers** and a **different actual human** authorized to approve deployment; enable **Prevent self-review**. Disable administrator bypass **if the UI offers that control**. Save and reopen the page to confirm. If required reviewer/self-review protection cannot be configured, **BLOCKED** (do not self-approve).
3. Under **Deployment branches and tags**, choose **Selected branches and tags**, allow **`test` only**; save and reopen to confirm.
4. Under **Environment secrets**, check these five names exist **at the training Environment scope**. If any is missing, install its value only from **existing authorized custody**; do not recreate, rotate, or overwrite an existing value simply to perform the check.

   | Required Training secret | Where to obtain the actual value (not in this document) |
   |---|---|
   | `DEPLOY_HOST` | Verified shared Hetzner server inventory |
   | `DEPLOY_USER` | Existing authorized deployment login |
   | `DEPLOY_SSH_PRIVATE_KEY` | Existing securely retained deployment SSH private key |
   | `DEPLOY_KNOWN_HOSTS` | Independently verified pinned SSH host-key entry for that VM |
   | `OP_SERVICE_ACCOUNT_TOKEN` | Existing Training-only 1Password service-account token, kept in human-only custody |

   **Only when a new or replacement `DEPLOY_KNOWN_HOSTS` value is needed:** Obtain the actual VM address from **Hetzner Cloud → Servers → approved ERS server**. In that server's **Hetzner web console** (not an ordinary SSH connection), run:

   ```bash
   ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
   ```

   On your Mac, replace the example with the **actual approved host** and compare the fingerprint retrieved over SSH with the console fingerprint:

   ```bash
   VERIFIED_HOST='YOUR_VERIFIED_HETZNER_HOST_OR_IP'
   ssh-keyscan -t ed25519 "$VERIFIED_HOST" 2>/dev/null | ssh-keygen -lf - -E sha256
   ```

   **PASS for the host-key pin:** both SHA-256 ED25519 fingerprints match exactly. Only then retain the verified `ssh-keyscan` host-key entry in your approved 1Password custody and install it as the Training secret. **BLOCKED:** fingerprints differ, the host lacks the expected ED25519 key, or the console/approved host cannot be accessed. `ssh-keyscan` alone is **not** trusted verification. Do not publish private keys or substitute a different VM.

5. Record the five *names*, actual scope, reviewer, `test`-only rule and self-review setting. **Do not configure** `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, or a GitHub `APP_AUTO_MIGRATE` variable for TRN. `APP_AUTO_MIGRATE=false` belongs in the server's `.env.training`.

**B PASS:** five `training` Environment secret names; independent reviewer and prevent-self-review; `test`-only branch. **B FAIL:** a bypass or wrong credential proven. **B BLOCKED:** rule unsupported, reviewer unavailable, required value not securely available.

**C. Verify 1Password Training isolation — your 1Password account.**

1. Open **1Password → `ers-training` vault**. Check the existing Training Service Account has **Read Items** for **`ers-training` only**; no access to `ers-development`, `ers-test`, `ers-production`, `ers-deployment`, `ers-recovery`, or `ers-automation-bootstrap`. Check no Write/Share/Create Vault permissions. Do not make a duplicate Service Account or revoke a working token.
2. In `ers-training`, open **`runtime-secrets`**. Confirm the fields `JWT_SECRET`, `LEDGER_CORRECTION_KEY`, `LEDGER_SETTLEMENT_KEY` exist and contain Training-only values (do not display their contents in evidence).
3. Open **`backup-credentials`**. Confirm `aws_access_key_id`, `aws_secret_access_key` exist for the `ers-training-backup` profile. In your authorized Hetzner S3 credential/policy console, confirm this access is restricted to the **`ers-backups/training`** prefix and cannot reach DEV/TST/PRD backups; the prefix string in an env file alone is **not** access control.
4. Compare item and field names to checked-in `ops/1password/training.env.tpl` and `ops/1password/training-aws-credentials.tpl`. Confirm you have a working authorized **interactive** `op` CLI login for the server; the GitHub service token is separate. Keep the service token securely held in the human-only bootstrap vault.

**C PASS:** vault access limited to Training, both items/fields present, S3 prefix policy verified, interactive 1Password access available. **C FAIL:** forbidden vault/prefix access or shared Production runtime key confirmed. **C BLOCKED:** cannot inspect applicable access controls or no authorized S3/1Password access.

**PASS:** A, B and C each PASS **and** the actual TRN change authorization is recorded. **FAIL:** any confirmed unsafe permission or unauthorized credential. **BLOCKED:** any missing prerequisite. **Do not begin installation until T03 PASS.**

### T04 — Inspect shared-host capacity and Production headroom

**Identity/location:** You as Infrastructure Operator, `HETZNER-TEST`; a **different real person** reviews Production resource history using your existing approved monitoring system. **Prerequisite:** authorized SSH login to the shared VM.

**Actions — current host check:**

```bash
cd /opt/EnterpriseRemoteSystems/test
pwd -P
python3 -B scripts/ers-trn-preflight.py check-host \
  --server-root /opt/EnterpriseRemoteSystems
```

**Expected output:** `PASS: TRN preflight (read-only)` plus JSON showing at least **2 GiB MemAvailable**, **5 GiB free disk**, **2 CPUs**, and one-minute load below **75% of CPU count**, with Docker ownership clean. A historical PASS dated 2026-11-17 was recorded, but use **current evidence when authorizing a new deployment window**; do not treat the old snapshot as current capacity.

**Actions — Production review:** A separate authorized reviewer opens the existing Production monitoring dashboard, records the **actual reviewed time span**, current and peak CPU/memory/disk measurements, service restarts and health/error events, and a clear **APPROVE** or **REJECT** decision for adding TRN to the shared VM. The source does not prescribe a historical duration: **record the one actually reviewed; do not invent one**. The TRN container ceilings are backend/frontend/Caddy **768/384/128 MiB** and **1/0.75/0.25 CPUs**. If monitoring history or a second reviewer does not exist, record BLOCKED rather than asserting that an instant host snapshot proves Production safety.

**PASS:** current host preflight passes and the separate reviewer documents observed Production headroom and APPROVE. **FAIL:** resource thresholds fail or observed Production risk is unacceptable. **BLOCKED:** reviewer or monitoring history unavailable. **Evidence:** JSON and non-secret monitoring/review reference. Do not stop PRD containers.

### T05 — Pin the latest human-approved Test candidate

**Identity/location:** You as Release Operator in `GITHUB-WEB` and `HETZNER-TEST`; the actual authorized release approver identified in existing release evidence.

**Actions — GitHub:** Open **Actions → Deploy Enterprise Remote Systems**. Select the **latest successful Test deployment**, then check the **Deployed Playwright E2E** job and the **Record successful Test release rehearsal** job (including its **Record rehearsal gate** step). Record the run URL, full deployed Test Git SHA, and the pre-existing human release-acceptance reference. A green run is automated evidence, not human approval. If no accepted latest candidate exists: BLOCKED, do not select an older SHA to make the procedure pass.

**Actions — read-only Test checkout:**

```bash
cd /opt/EnterpriseRemoteSystems/test
pwd -P
git branch --show-current
TEST_REVISION="$(git rev-parse HEAD)"
TEST_TREE="$(git rev-parse 'HEAD^{tree}')"
printf 'Test revision: %s\nTest tree: %s\n' "$TEST_REVISION" "$TEST_TREE"
ls -l -- "release-rehearsal-passed/${TEST_TREE}.passed"
python3 -B scripts/ers-trn-preflight.py verify-test \
  --marker "release-rehearsal-passed/${TEST_TREE}.passed" \
  --revision "$TEST_REVISION" \
  --tree-sha "$TEST_TREE"
```

**PASS:** GitHub Test SHA equals `TEST_REVISION`; marker verifier prints PASS for exact Test SHA/tree; human release acceptance recorded. **FAIL:** tampered/invalid evidence or wrong revision intentionally selected. **BLOCKED:** SHA mismatch, marker absent or human acceptance unknown. **Evidence:** full SHA, tree, run URL and verifier output. **Never** reset Test or edit rehearsal markers.

## Phase 3 — One-time installation and approved rollout

**Entry requirement:** T03–T05 PASS, approved change window and an available approved rollback/incident procedure. If TRN already exists, **inspect and reuse it**; do not repeat initial installation, reset Accounts, overwrite `.env.training`, or replace its data volume.

### Setup S1 — Create the separate server checkout and create-only environment

**Identity/location:** You as Infrastructure Operator on shared Hetzner VM; start in `/opt/EnterpriseRemoteSystems`.

**Action 1 — read-only destination check:**

```bash
cd /opt/EnterpriseRemoteSystems
pwd -P
ls -ld -- test training 2>/dev/null || true
if [ -d training ]; then
  find training -mindepth 1 -maxdepth 1 -print
fi
```

**Decision:** If `training/.git` exists, use the existing checkout: verify its remote points to ERS and note its SHA; **do not clone**. If `training` contains unexplained files but no repo: **BLOCKED**; do not delete anything. If `training` is absent or empty and creation was approved, run:

```bash
cd /opt/EnterpriseRemoteSystems
git clone --branch test git@github.com:RodrigoMattosoSilveira/EnterpriseRemoteSystems.git training
cd /opt/EnterpriseRemoteSystems/training
pwd -P
git remote get-url origin
git rev-parse HEAD
ls -l Makefile
```

**Action 2 — initialize only if `.env.training` is absent:**

```bash
cd /opt/EnterpriseRemoteSystems/training
make server-trn-init-env
chmod 600 .env.training
stat -c '%a %U:%G %n' .env.training
```

**PASS:** separate TRN repo from approved origin, `Makefile` present, checkout initially at T05 Test-approved SHA, `.env.training` exists as mode `600` and was not overwritten. **FAIL:** an attempted installation alters another environment. **BLOCKED:** wrong remote/SHA, unknown destination, an existing env file needing inspection, or missing server privileges. **Evidence:** non-secret origin, SHA and mode. **Do not run the initializer when `.env.training` already exists.**

### Setup S2 — Materialize initial Training runtime and S3 credentials

**Identity/location:** You as Infrastructure/1Password operator, `HETZNER-TRN`. **Only first installation**; requires S1 PASS and no existing TRN data volume or AWS credential file. For an existing installation, record S2 as **already installed/verified** using its existing evidence and a read-only environment contract; do not rotate secrets.

**Action 1 — tools and vault access (no secret values):**

```bash
cd /opt/EnterpriseRemoteSystems/training
python3 --version
op --version
docker info --format '{{.ServerVersion}}'
op vault get ers-training >/dev/null
```

**PASS checkpoint:** all commands succeed, with an authorized interactive `op` session and Docker permissions. **BLOCKED:** one fails. Never paste the GitHub service token into the server terminal.

**Action 2 — only on an empty, approved installation:** Run this entire **Bash** block. It refuses existing TRN AWS credentials and the persistent volume and cleans **only its own** temporary scratch directory on exit.

```bash
cd /opt/EnterpriseRemoteSystems/training
(
  set -euo pipefail
  umask 077
  if [ ! -d /opt/EnterpriseRemoteSystems/secrets ]; then
    install -d -m 0700 /opt/EnterpriseRemoteSystems/secrets
  fi
  if [ -e /opt/EnterpriseRemoteSystems/secrets/training-aws-credentials ] || \
     [ -L /opt/EnterpriseRemoteSystems/secrets/training-aws-credentials ]; then
    echo 'BLOCKED: Training AWS credentials already exist' >&2
    exit 2
  fi
  if docker volume inspect ers-trn_backend-data >/dev/null 2>&1; then
    echo 'BLOCKED: TRN data volume already exists' >&2
    exit 2
  fi
  TRN_SCRATCH="$(mktemp -d /opt/EnterpriseRemoteSystems/secrets/trn-init.XXXXXXXX)"
  trap 'rm -rf -- "$TRN_SCRATCH"' EXIT
  python3 -B scripts/ers-op-materialize.py \
    --template ops/1password/training.env.tpl \
    --output "$TRN_SCRATCH/runtime.env" \
    --expected-root "$TRN_SCRATCH"
  python3 -B scripts/ers-op-materialize.py \
    --template ops/1password/training-aws-credentials.tpl \
    --output "$TRN_SCRATCH/aws-credentials" \
    --expected-root "$TRN_SCRATCH"
  python3 -B scripts/ers-op-validate-fragments.py \
    --environment training \
    --fragment "$TRN_SCRATCH/runtime.env" \
    --aws-credentials "$TRN_SCRATCH/aws-credentials"
  python3 -B scripts/ers-trn-install-runtime-secrets.py \
    --env-file /opt/EnterpriseRemoteSystems/training/.env.training \
    --fragment "$TRN_SCRATCH/runtime.env" \
    --confirm INITIALIZE-TRAINING-SECRETS
  install -m 0600 "$TRN_SCRATCH/aws-credentials" \
    /opt/EnterpriseRemoteSystems/secrets/training-aws-credentials
)
```

**PASS checkpoint:** both materializations report values suppressed, the Training fragment validator passes, runtime installer reports PASS; **no secret contents displayed**. **FAIL:** values appear in output or wrong environment/scoping is confirmed. **BLOCKED:** preexisting volume/file, missing vault entry or command failure. **Never rerun as a way of recovering a failed write**; inspect state and use the existing credential-maintenance/recovery procedure.

**Action 3 — fill approved *non-secret* S3 endpoints; keep isolation settings:**

```bash
cd /opt/EnterpriseRemoteSystems/training
nano .env.training
```

Set existing keys `SERVER_OFFHOST_BACKUP_S3_ENDPOINT`, `SERVER_OFFHOST_BACKUP_S3_REGION`, `SERVER_OFFHOST_BACKUP_S3_BUCKET` to your actual approved Hetzner values. Confirm these existing entries remain exactly:

```text
SERVER_OFFHOST_BACKUP_S3_PREFIX=ers-backups/training
AWS_SHARED_CREDENTIALS_FILE=/opt/EnterpriseRemoteSystems/secrets/training-aws-credentials
AWS_PROFILE=ers-training-backup
APP_AUTO_MIGRATE=false
```

Check modes and server contract **without showing values**:

```bash
cd /opt/EnterpriseRemoteSystems/training
stat -c '%a %n' .env.training /opt/EnterpriseRemoteSystems/secrets/training-aws-credentials
make server-environment-contract-check ENV=training
```

**PASS:** both files mode `600`, contract check succeeds, actual approved endpoint/region/bucket configured, and T03 S3 policy confirmed. **FAIL:** cross-environment credentials/prefix. **BLOCKED:** real Hetzner bucket, endpoint, region or scoped S3 policy unknown. **Evidence:** modes and contract result, never file contents.

### T06 — Deploy the approved Test revision through protected GitHub Actions

**Identity/location:** You, Release Operator, `GITHUB-WEB`; **different human** Environment reviewer. **Before starting:** T03–T05 and S1–S2 PASS, real change approval/window, no ongoing PRD incident.

**Actions:**

1. **GitHub → Actions → Deploy ERS Training (TRN) — approved Test candidate → Run workflow.** Select branch **`test`**.
2. Set `test_revision` = exact 40-character T05 Test SHA; `approval_reference` = existing actual change ID (6–120 characters, starts alphanumeric; then alphanumerics/`.`/`:`/`_`/`-`); `confirmation` = **`DEPLOY-APPROVED-TEST-TO-TRN`**. Start the workflow.
3. Confirm the job **waits for the `training` Environment approval before privileged steps**. A **different named reviewer** checks the same approved SHA and approves in GitHub. Record reviewer and run URL. If no reviewer prompt appears, **FAIL/STOP**, even if the job later succeeds.
4. Confirm the run completes successfully: pinned source/tree; Test marker; Training-only 1Password access; capacity; migration/recovery gate; internal health; post-deployment off-host backup. Do not infer public HTTPS, restore acceptance or human logins from a green job.

**Actions — read-only on `HETZNER-TRN`:**

```bash
cd /opt/EnterpriseRemoteSystems/training
make server-trn-ps
make server-trn-backend-health
make server-trn-env-caddy-health
docker volume inspect ers-trn_backend-data --format '{{.Name}}'
docker network inspect ers-trn_default --format '{{.Name}}'
git rev-parse HEAD
```

**PASS:** reviewer approved before job ran; workflow succeeded; HEAD equals T05 SHA; TRN's own backend/Caddy healthy; isolated volume `ers-trn_backend-data` and network `ers-trn_default` exist. **FAIL:** bypass, different SHA, missing verified backup, or changed DEV/TST/PRD. **BLOCKED:** no approved run or a prerequisite unavailable. **Evidence:** approval/runs, HEAD and non-secret checks. Do not remove volumes to repair a failed deployment.

### HTTPS edge activation — first-time shared-edge change (checkpoint for T12)

**Identity/location:** You, Infrastructure Operator, `HETZNER-TRN`; a **different authorized edge-change reviewer**. **Only after T06 PASS and approved edge change window.** The edge also serves Production.

**Action 1 — inspect before changing anything:**

```bash
cd /opt/EnterpriseRemoteSystems/training
make server-trn-ps
docker network inspect ers-trn_default --format '{{.Name}}'
make edge-diff
```

Open your authorized DNS/Hetzner control panel and confirm `trn.enterpriseremotesystems.com` resolves to the approved edge server. **Read the `make edge-diff` differences:** exit code 0 alone does not mean the changes are safe (`diff ... || true`). Record the **actual diff**, edge-reviewer approval and available existing rollback plan. If the diff changes routes beyond authorized TRN additions, **FAIL/STOP**.

**Action 2 — only in the independently approved edge window:**

```bash
cd /opt/EnterpriseRemoteSystems/training
make edge-sync
cd /opt/EnterpriseRemoteSystems/edge
docker compose -f docker-compose.edge.yml config
cd /opt/EnterpriseRemoteSystems/training
make edge-up
make edge-reload
```

`edge-sync` uses `rsync --delete`, and `edge-up` can affect the shared edge. Do not run these commands if review/rollback is missing; **BLOCKED** instead. Never run `edge-down`.

**Action 3 — in a browser, open each address and confirm valid HTTPS and healthy response:**

- `https://trn.enterpriseremotesystems.com/api/v1/healthz`
- `https://dev.enterpriseremotesystems.com/api/v1/healthz`
- `https://tst.enterpriseremotesystems.com/api/v1/healthz`
- `https://app.enterpriseremotesystems.com/api/v1/healthz`

**PASS checkpoint:** all four show healthy HTTPS with a valid certificate and no DEV/TST/PRD regression. **FAIL/STOP:** broken TLS, incorrect route, unhealthy PRD/shared services. **BLOCKED:** DNS, independent reviewer, window or rollback unavailable. **Evidence:** HTTPS status for all four after change. Use only the approved edge incident/rollback procedure on failure, not improvisation. Internal Docker HTTP health probes do not permit public HTTP.

## Phase 4 — Real backup, human identities and persistence

### T07 — Verify actual TRN backup and isolated off-host restore candidate

**Identity/location:** You, Infrastructure Operator, `HETZNER-TRN`; independent recovery evidence reviewer. **Prerequisite:** T06 PASS, real TRN backup/receipt, and specific approval to stage a copy (never restore it over live DB).

**Action 1 — list real Training backups:**

```bash
cd /opt/EnterpriseRemoteSystems/training
find /opt/EnterpriseRemoteSystems/training/backups \
  -maxdepth 1 -type f -name 'app-*.db' -print | sort
```

If none appear, **BLOCKED**. Select one existing **absolute TRN path** from the output and have the reviewer authorize an isolated staging rehearsal for that exact backup; record approval. Do not select a Test/Production backup.

**Action 2 — verify and stage the approved copy.** Execute the **whole block in the same terminal**; type only the paths actually returned by the commands:

```bash
cd /opt/EnterpriseRemoteSystems/training
(
  set -euo pipefail
  read -r -p 'Paste absolute TRN backup .db path from the list: ' BACKUP_FILE
  case "$BACKUP_FILE" in
    /opt/EnterpriseRemoteSystems/training/backups/app-*.db) ;;
    *) echo 'BLOCKED: not a TRN backup path' >&2; exit 2 ;;
  esac
  test -f "$BACKUP_FILE"
  test -f "$BACKUP_FILE.manifest.json"
  test -f "$BACKUP_FILE.offhost.json"
  make server-backup-verify ENV=training BACKUP_FILE="$BACKUP_FILE"
  make server-offhost-backup-verify ENV=training BACKUP_FILE="$BACKUP_FILE"

  read -r -p 'Independent reviewer already approved isolated staging? Type APPROVED: ' STAGE_APPROVAL
  test "$STAGE_APPROVAL" = APPROVED || { echo 'BLOCKED: staging not approved' >&2; exit 2; }
  RECEIPT_FILE="$BACKUP_FILE.offhost.json"
  make server-restore-materialize-offhost ENV=training RECEIPT_FILE="$RECEIPT_FILE"
  find /opt/EnterpriseRemoteSystems/training/recovery -type f -name 'app-*.db' -print
  read -r -p 'Paste new staged TRN recovery .db path from the new directory: ' RECOVERY_BACKUP_FILE
  case "$RECOVERY_BACKUP_FILE" in
    /opt/EnterpriseRemoteSystems/training/recovery/*/app-*.db) ;;
    *) echo 'BLOCKED: recovery path outside TRN staging' >&2; exit 2 ;;
  esac
  test -f "$RECOVERY_BACKUP_FILE"
  make server-restore-verify ENV=training RECOVERY_BACKUP_FILE="$RECOVERY_BACKUP_FILE"
)
```

**PASS:** manifest, real S3 off-host receipt/object version, newly materialized recovery DB and verifier succeed; reviewer authorization recorded. **FAIL:** checksum/integrity/isolation mismatch. **BLOCKED:** source path, receipt, S3 permission, staging approval or new destination uncertain. **Evidence:** backup/receipt/candidate paths, manifest/object version and outputs (no secrets). **Never run** `make server-restore-apply` here. Preserve recovery evidence; this procedure creates no intended persistent test containers. If any temporary container was created, identify and remove **only that test-owned container** with approved cleanup, verify it is gone and any exclusive test port released. Never stop unrelated services or remove the TRN volume.

### T08 — Enroll two distinct real TRN Application Administrators

**Identity/location:** You, Infrastructure Operator, `HETZNER-TRN`; Admin A and Admin B are **two different human beings**, with two separate TRN browser profiles; enrollment must have an actual approved change. **Prerequisite:** T07 PASS, recent verified backup, separate human identities and no other TRN database writer. **This is an intentional live TRN database write.**

**Action 1 — locate the actual verified backup:**

```bash
cd /opt/EnterpriseRemoteSystems/training
find backups -maxdepth 1 -type f -name 'app-*.db' -print | sort
```

**Action 2 — execute once with real values.** The prompts ask for **identifiers and a backup path**, not passwords. The existing helper prompts the two humans for their credentials interactively and does not put passwords in command arguments or files.

```bash
cd /opt/EnterpriseRemoteSystems/training
(
  set -euo pipefail
  read -r -p 'Paste verified absolute TRN backup path: ' TRN_ENROLL_BACKUP_FILE
  read -r -p 'Enter actual approved enrollment change ID: ' TRN_ENROLL_APPROVAL
  read -r -p 'Enter your actual operator ID: ' TRN_ENROLL_OPERATOR
  export TRN_ENROLL_BACKUP_FILE TRN_ENROLL_APPROVAL TRN_ENROLL_OPERATOR
  export TRN_ENROLL_CONFIRM=ENROLL-TRAINING-HUMANS-OFFLINE
  case "$TRN_ENROLL_BACKUP_FILE" in
    /opt/EnterpriseRemoteSystems/training/backups/app-*.db) ;;
    *) echo 'BLOCKED: invalid TRN backup path' >&2; exit 2 ;;
  esac
  bash scripts/ers-trn-enroll.sh
)
```

The source script verifies backup+off-host receipt, stops **only** `ers-trn-backend`, performs one offline enrollment in an ephemeral `--rm` container, restarts the backend and takes a new backup. **If enrollment fails, backend deliberately stays stopped:** do not repeat/reset automatically; use approved TRN-only recovery procedure. Do not touch unrelated containers.

**Action 3 — browser proof:** Admin A signs in to **TRN** using own credentials and completes required first-password change; Admin B signs in separately in another browser profile. Each confirms own global `APPLICATION_ADMIN` identity and signs out. Check no E2E identity was used. Confirm the ephemeral enrollment container has been removed (the script uses `--rm`) and no unrelated containers were altered.

**PASS:** two distinct humans, distinct global Accounts/Actors, individual successful sign-ins, verified post-enrollment TRN backup and no leftover test container. **FAIL:** shared/duplicate identity, incorrect authority, unwanted database writes. **BLOCKED:** missing second human, authorization, backup, writer isolation or usable credentials. **Evidence:** non-secret individual identity references and outcomes.

### T09 — Create one synthetic Training Tenant and one individual trainee

**Identity/location:** TRN Global Application Administrator, **separate authorized Training Tenant Administrator**, individual Customer Support Specialist (trainee), Training Coordinator witness; all use `TRN-BROWSER` with their own accounts. **Prerequisite:** T08 PASS and successful public HTTPS. Do not create a global admin/tenant actor or trainee using SQL or E2E shortcuts.

**Actions:**

1. **Global Admin / TRN:** Sign in. Open **Administration → Tenants**, search for intended synthetic Training Tenant first. If absent, use **Create Tenant** with an approved clearly synthetic unique code (e.g. `ERS_SUPPORT_TRAINING` **only if unused**). Record actual Tenant ID/code. Never use `TRAIN354C_A` or `TRAIN354C_B`.
2. **Global Admin / TRN:** In the new Tenant's administrative details, open **Tenant Administrators** and choose **Assign Tenant Administrator** for an **already eligible, separately authorized human Tenant Actor**. Confirm that Tenant becomes `ACTIVE_READY`. If no eligible candidate appears, **BLOCKED**: this runbook contains **no** authorized shortcut to manufacture an eligible actor. Do not turn the global Application Administrator into a Tenant Actor.
3. **Tenant Admin / TRN:** Sign in as the designated human, select **exact Training Tenant context**. Open **People / Pessoas** and search trainee's exact authorized login/email. If already present, add **only the required Training Membership**. Otherwise use **Create Person** through the normal UI, with identity fields processed under the existing approved privacy policy. Verify one active Training Membership and no duplicate global Person. If the UI requires real CPF/RG/phone and their processing is not authorized, **BLOCKED**; do not invent identifiers for a real trainee.
4. **Tenant Admin / TRN:** Open the Person page → **Authentication / Autenticação**. Enable Authentication if permitted, using a unique one-time password held in 1Password. If UI denies it, an authorized Global Admin may use the existing **Administration → Authentication → Create account** only with the active Membership and without duplication. If neither supported operation exists, **BLOCKED**; no hidden API or SQL workaround.
5. **Tenant Admin / TRN:** Open **Administration → Tenant Authorization / Delegated Roles**. Select the exact trainee's Tenant Actor; grant **`TENANT_VIEWER` for the Training Tenant only**. Check that no `TENANT_ADMIN`, `APPLICATION_ADMIN`, global Support Role or Production Support Access Lease was granted.
6. **Trainee / separate TRN browser profile:** Sign in with own Account, complete mandatory password change, sign out, then sign back in. Confirm selected Training Tenant and only permitted read-only pages. Confirm **no** Global Administration or unrelated Tenant information. Open a Journey only if the Viewer permission actually permits it.

**PASS:** synthetic Tenant and nonduplicated Person/Membership; authorized Tenant Admin; own trainee login and exact `TENANT_VIEWER` scope; no other-Tenant data; Training Coordinator witnessed. **FAIL:** cross-Tenant exposure, duplicate identities or unexpected elevated role. **BLOCKED:** eligible Tenant Admin, permitted UI path, privacy authorization or individual trainee credentials missing. **Evidence:** non-secret IDs and observed UI states. **Cleanup:** sign out; keep approved Training records.

### T10 — Prove Training data survives one approved redeployment

**Identity/location:** You, Release Operator in `GITHUB-WEB` / `HETZNER-TRN`; different GitHub reviewer; trainee and Training Coordinator in `TRN-BROWSER`. **Prerequisite:** T09 has created a synthetic Person and Journey, and a **new authorized deployment** is allowed. T10 requires a real second rollout, even when the exact Test-approved SHA is unchanged; it is not proven by initial deployment alone.

**Action 1 — before:** As trainee/Training Coordinator in TRN, record non-sensitive Account ID/login, Membership, `TENANT_VIEWER` grant, synthetic Person and Journey IDs/counts. On `HETZNER-TRN`:

```bash
cd /opt/EnterpriseRemoteSystems/training
git rev-parse HEAD
docker volume inspect ers-trn_backend-data --format '{{.Name}}'
```

**Action 2 — deployment:** Recheck that the selected candidate still meets T05 and shared-host headroom/authorization are current. Run **the same protected workflow as T06**, with a **new real approval reference** and **different human GitHub approval**; do not delete the TRN volume.

**Action 3 — after:** Sign in as the **same trainee using the existing password**; compare Account, Membership, Role, Person, Journey and synthetic records with the before-values. Re-run the two read-only commands above and confirm the same persistent volume and approved deployment revision. Confirm public TRN HTTPS health.

**PASS:** IDs/data and authorized roles persisted; same individual credentials work; volume remains `ers-trn_backend-data`. **FAIL:** any reset, missing data, unexpected role/password change or replaced volume. **BLOCKED:** no approved new rollout/window or insufficient synthetic Journey to compare. **Evidence:** before/after IDs, GitHub run URL and review. Do not re-seed to conceal data loss.

### T12 — Final independent cross-environment and Training handoff

**Identity/location:** You (Infrastructure/Release Operator); **different named final reviewer**; Training Coordinator; `GITHUB-WEB` and browsers. **Prerequisite:** T01–T11 PASS, approved edge HTTPS activation and all Training-only checks.

**Actions:**

1. **Browser:** Open the four HTTPS health URLs in the edge activation step. If they were already checked **after the last deployment/edge change** and their evidence is current, reuse it; otherwise check again. Record healthy TLS for TRN/DEV/TST/PRD and no Production regression.
2. **Independent reviewer:** Read the actual evidence record. Check T05 Test-approved SHA/tree/marker and human release acceptance; T06/T10 GitHub runs and independent reviews; T04 capacity approval; T07 real off-host receipt and staged restore; T08 two human logins; T09 individual trainee; T10 retained data. Check no T01–T11 result is FAIL or BLOCKED.
3. **Independent reviewer:** Record **GO — supervised Training only** or **NO-GO**, with actual name, UTC timestamp and evidence reference. On GO, Training Coordinator releases the approved trainee packet and supervised TRN access. **No** Production support access, Production tenant role or Bite 35.7 launch approval is implied.

**PASS:** independent GO based on complete evidence; valid public TLS; all four environments healthy; no missing prior acceptance. **FAIL:** observed cross-environment damage, insecure routing or data loss. **BLOCKED:** any missing test, review, real human identity or approval. **Evidence:** final signed/reviewed private record; no secrets.

## After T12 — Recurring work and safe cleanup

For every later TRN release, repeat **only release-dependent gates**: current Test candidate and approval (T05), current host/Production capacity and change authorization (T03/T04 as applicable), guarded T06 workflow with different reviewer, verified off-host backup, and post-change HTTPS/health and data persistence. **Do not** recreate vaults, training Administrators, Tenants, Accounts or the TRN volume for each release. Keep existing LOCAL regression evidence for matching SHA/tree rather than repeating it.

**On failure:** Wrong SHA, marker, scope or approval → BLOCKED, do not deploy. Migration/health failure → stop and use only the existing TRN migration-recovery gate and approved rollback; never reset data. Off-host backup failure → STOP: the workflow stops only TRN services to prevent unprotected writes. Shared edge/PRD failure → STOP TRN changes, follow approved shared-edge incident/rollback. Identity/data regression → FAIL, preserve logs and backup evidence.

**Cleanup:** Keep persistent TRN backend/frontend/Caddy, `ers-trn_backend-data`, its backups, Training Accounts and Journeys. Track any temporary container created during recovery/enrollment; if present, record its exact container ID and remove **only that known temporary container** after authorized cleanup. Verify it is absent and any exclusively reserved test port is free. **Never** stop unrelated containers or erase TRN/test/Production volumes. Routine T01–T02/T11 offline tests do not call for manual Docker teardown unless they created test containers.

## Existing implementation references (not extra test steps)

| Requirement | Committed source |
|---|---|
| T01/T02/T11 LOCAL checks | `Makefile` (`trn-deployment-check`, `byte356s1-onboarding-check`, `local-check`, Production/35.4C checks) |
| T03/T06 protected Training workflow | `.github/workflows/deploy-training.yml` |
| T04/T05 host/marker checks | `scripts/ers-trn-preflight.py` |
| S1/S2 Training initial configuration | `scripts/init-server-env.sh`, `scripts/ers-trn-install-runtime-secrets.py`, `scripts/ers-environment-guard.sh` |
| Training-only source values | `ops/1password/training.env.tpl`, `ops/1password/training-aws-credentials.tpl` |
| T07 backup/isolated restore | `Makefile` (`server-backup-verify`, `server-offhost-backup-verify`, `server-restore-materialize-offhost`, `server-restore-verify`) |
| T08 guarded enrollment | `scripts/ers-trn-enroll.sh`, `scripts/ers-two-human-admin-input.py` |
| Edge review/deployment | `Makefile` (`edge-diff`, `edge-sync`, `edge-up`, `edge-reload`) |

**Glossary Impact:** No new ERS Roles or entities. **TRN** remains an isolated persistent non-Production environment; a **Training Tenant** is a synthetic Tenant within it; **latest Test-approved candidate** is an exact Git SHA/tree with successful Test rehearsal **plus existing human release approval**. **Release Operator**, **Infrastructure Operator** and **Training Coordinator** are responsibilities, not app Roles. A different human GitHub reviewer remains required; the person who holds SSH credentials may also be the Release Operator. Global Person, Account, Actor, Membership, Journey and Tenant Support Access Lease semantics are unchanged.
