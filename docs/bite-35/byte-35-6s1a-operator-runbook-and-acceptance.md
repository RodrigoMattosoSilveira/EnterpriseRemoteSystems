# ERS — Byte 35.6S.1A: Single Operator Runbook and Manual Acceptance (T01–T12)

**Document status:** Consolidated, operator-ready procedure. This is the **one document to follow**. It replaces the operational instructions in (1) “Patch application and operator verification,” (2) “Training (TRN) Environment and Deployment,” (3) “TRN Manual Acceptance T01–T12,” and (4) “TRN protected-data guardrail correction: application and testing.” Documents 1 and 4 are **historical patch instructions**, not tasks to repeat. The two earlier operational documents are superseded by this one.

**Source verified against:** `1096-356s1a-trn-environment-and-deployment`, feature commit `71130743526092103f2e96d6654d69f394788b6a` (committed ZIP). The merged/deployed `test` commit **may differ**. The Test checkout was previously reported as `002357d6d459cae3e399d1564676c412561a62ab`; this is **an observation, not an approved release assertion**. Do not reset TEST to the feature SHA.

**Selected architecture:** TRN runs on the **existing Hetzner VM**, with strict isolation and explicit capacity approval. It tracks the **latest TST-approved release candidate**, not DEV HEAD, and is deployed only on a separately approved request. TRN data and human Accounts persist across releases. External access is HTTPS only. TRN does not grant Production customer support privileges.

**Current evidence already supplied:** On November 17, 2026 at 16:55:17 UTC, a read-only `check-host` run reported PASS, with 7,190,024,192 bytes available RAM, 38,907,396,096 bytes free disk, 4 CPUs, and 1-minute load 0.0. This passes the **instantaneous** host preflight; **Production resource-history review is still unconfirmed**. No live TRN deployment or GitHub approval has been demonstrated in this conversation.

## 0. How to use this document

**Follow phases in order.** Each numbered test is included at the point where it can actually be executed; there is no second checklist to cross-reference. Treat anything not personally observed as **BLOCKED**, not PASS.

| Status | Definition |
|---|---|
| PASS | The real command/setting/behavior was personally verified and evidence recorded |
| FAIL | The system produced a wrong result or violated a safety requirement; STOP relevant operations |
| BLOCKED | Missing permission, evidence, approval, tool, or environment; do not improvise a bypass |
| NOT STARTED | No test attempted yet |

**Terminal location legend:**

- **LOCAL-MAC:** Your existing Mac Git repository root — the directory *actually containing `Makefile`*. Do **not** assume it is `~/projects/EnterpriseRemoteSystems` if your checkout lives elsewhere.
- **HETZNER-TEST:** SSH session as the authorized `deploy` user, directory `/opt/EnterpriseRemoteSystems/test`, which already contains `Makefile`.
- **HETZNER-TRN:** Same authorized Hetzner SSH identity, but directory `/opt/EnterpriseRemoteSystems/training` **after** cloning the repository into it. An empty `training` directory cannot run `make`.
- **GITHUB-WEB:** GitHub repository browser, using a named person with appropriate Settings/Actions privileges.
- **1PASSWORD:** Authorized vault-access application/CLI session; do not publish actual secret contents.
- **TRN-BROWSER:** A browser opened at `https://trn.enterpriseremotesystems.com` after HTTPS activation.

**Required human responsibilities (not ERS Roles):** Release Operator (selects the approved Test release and triggers the workflow); Infrastructure Operator (`deploy`/DNS/Docker/1Password technical changes); Independent GitHub Deployment Reviewer (approves the guarded environment); Training Coordinator (observes and accepts training); two different Training Application Administrators (separate personal TRN credentials); Training Tenant Administrator (valid tenant-scoped Actor); Customer Support Specialist (personal trainee Account, `TENANT_VIEWER`). Assign actual people and an approved change record. A person may hold compatible responsibilities, but required independent approvals and two distinct administrator identities must remain real.

**Never use** `sudo` to compensate for an incorrectly invoked Python script, `git clean`, database reset/replace commands, `docker compose down -v`, `docker system prune`, E2E Account passwords for a human, a Production S3 backup in TRN, or recovery-apply commands during these tests. Preserve the existing `backups/`, `recovery/`, `release-rehearsal-passed/`, and `test.zip` in the Test checkout; their untracked status does not authorize deleting them.

### Evidence record — create a private operational record

Create an entry in your team's approved private evidence repository or change ticket. Enter **only observed values**; use `BLOCKED` for anything missing. Do not put passwords, private keys, session cookies, customer data, or contents of `.env.training` into it.

| Evidence field | What to record and where to obtain it |
|---|---|
| Feature commit | `71130743526092103f2e96d6654d69f394788b6a` (source ZIP) |
| Actual TST deployed commit and tree | GitHub **Actions → Deploy Enterprise Remote Systems → successful Test run** plus read-only Git commands in T05 |
| TST rehearsal marker verification | Output of `verify-test`, timestamp, marker SHA-256; **not** a substitute for human acceptance |
| TRN change approval | Actual approved change/ticket identifier, approver identity and time; cannot be invented |
| GitHub Environment review configuration | `Settings → Environments → training`; reviewer, branch rule, prevent self-review, no bypass, secrets *names* |
| Shared-VM capacity | `check-host` JSON and independent Production capacity history (dates, peak metrics, reviewer) |
| TRN deployment | GitHub workflow URL/run ID, requested revision and tree, approval and outcome |
| TRN source and isolation | `git rev-parse HEAD`, Docker project/network/volume names, service health |
| Backup and recovery | Actual absolute backup path, manifest, off-host receipt/object version, staged recovery DB path, verifier result |
| Human administrators | Two distinct persons' Account/Actor IDs (non-secret) and individually observed logins |
| Trainee | Individual login identifier (no password), Training Tenant ID, role and login result |
| Persistence | Before/after non-sensitive Account, Membership, Person and Journey identifiers |
| T01–T12 | Each test: PASS/FAIL/BLOCKED, person, UTC time, evidence reference |

## Phase 1 — Confirm the software, without modifying deployed environments

### T01 — LOCAL source and automated safety check (LOCAL-MAC)

**Identity:** Developer/Release Operator. **Purpose:** Prove the current source contains the TRN changes. **Do not run this on the live Hetzner TEST server as a substitute for LOCAL acceptance.**

Open Terminal in **your actual local ERS checkout** (one normal working directory, no additional worktrees). Navigate to it using your normal local path, then run:

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

**Expected:** `Makefile` is present in the working directory; the actual branch and SHA are recorded (they need not equal the old feature SHA after merge); `git diff --check` exits 0; TRN tests report **23 tests / OK**, and onboarding tests **25 tests / OK**. Check exact exit status with `echo $?` immediately after each command if in doubt. **FAIL:** failing regression. **BLOCKED:** no identifiable LOCAL repository or missing dependencies. **Cleanup:** none; do not reset LOCAL data.

### T02 — Destructive-operation guardrails (LOCAL-MAC)

**Identity:** Developer/Release Operator. **Purpose:** Verify both Production and Training are protected. The guardrail correction is already part of the source at the referenced feature commit; **do not apply its historical patch again**.

```bash
make production-environment-guardrails-check
make byte354c-training-check
```

**Expected:** `Bite 33.1 Production environment/destructive-operation guardrails verified.` and the 35.4C fixture regression PASS. Both commands exit 0. For additional non-executing Make inspection only:

```bash
make -n server-down-volumes ENV=training
make -n server-replace-development-db ENV=training
```

**Important:** `make -n` prints recipes; its output **does not itself prove rejection**. Rely on the regression tests and source guards. Never execute those destructive targets without `-n`. **FAIL:** any guard permits destructive Training/Production operations. **Cleanup:** none.

### T11 — Additional negative-case and canonical LOCAL checks (LOCAL-MAC)

**Identity:** Developer/Release Operator. **Purpose:** Run the negative cases that exercise bad Test markers, wrong environment, resource shortages and unsafe configuration. T11 can be completed now; it does not depend on live TRN.

```bash
make trn-deployment-check
make local-check
```

**Expected:** 23 TRN tests pass and canonical LOCAL verification exits 0. If LOCAL or CI has already passed against the exact promoted commit, record the evidence URL/output rather than changing the server to repeat tests. **FAIL:** any assertion. **BLOCKED:** unavailable toolchain (the repo requires Go 1.26.2). Do not reset your working database or clean unrelated Docker containers to repair a test.

### Promotion boundary

The code must already be merged/promoted through the established branch path to **Test**. On the Hetzner TEST server, your previously observed HEAD was `002357d6...`; it is normal that this differs from feature commit `71130743...`. Never check out the older commit merely to satisfy a manual written before promotion.

## Phase 2 — Approvals, latest approved Test candidate, and host capacity (read-only)

### T03 — Real authorization, GitHub protections and 1Password custody (GITHUB-WEB + 1PASSWORD)

**Identities:** Release Operator, **different** Independent GitHub Deployment Reviewer, Infrastructure Operator. **Prerequisite:** Written approval for creating a persistent TRN service on the existing Hetzner VM. Do not begin installation until these settings are verified.

**A. Create/inspect the `training` GitHub Environment** (GitHub user with repository Settings permission):

1. Open the ERS GitHub repository, then **Settings → Environments**. If `training` does not exist, choose **New environment**, enter **exactly** `training`, and create it. Opening a workflow with `environment: training` is **not** proof that protection rules were configured.
2. Open the `training` Environment. Under **Deployment protection rules**, enable **Required reviewers** and select the designated independent reviewer's GitHub account or an authorized review team. Enable **Prevent self-review** so the person initiating the run cannot approve it. If available, disallow administrator bypass of protection rules. Save the protection settings.
3. Under **Deployment branches and tags**, choose **Selected branches and tags** (wording may vary), add the **branch `test`** as the only allowed deployment branch, and save. This supplements the workflow's `github.ref_name == 'test'` check.
4. Confirm all these choices by reopening the Environment settings. Record reviewer account(s), branch policy and whether bypass is prohibited; **do not mark PASS based only on workflow YAML**.
5. **If Required reviewers or Prevent self-review is unavailable in your GitHub account/repository plan, mark T03 BLOCKED. Do not substitute a self-approved manual deployment.** GitHub's support for protection rules varies by repository visibility and plan; do not assume your account supports them.

Official reference for the operator to compare against the live UI: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments

**B. Add exactly the five named Environment secrets required by `.github/workflows/deploy-training.yml`:**

On the same Environment settings page, locate **Environment secrets → Add secret** (or **Secrets and variables → Actions**, scoped to the `training` Environment). Create/verify the following **names**, sourcing their actual values from separately approved custody. Never include the values in the evidence record.

| Secret name | Where its approved value must come from | Meaning/check |
|---|---|---|
| `DEPLOY_HOST` | Verified Hetzner server inventory | Hostname/IP of the existing authorized ERS VM |
| `DEPLOY_USER` | Approved server deployment account | Account permitted to operate the separate TRN checkout (`deploy` only if authorized) |
| `DEPLOY_SSH_PRIVATE_KEY` | Approved deployment-key custody in 1Password | Restricted SSH private key for that account; not a Production recovery key |
| `DEPLOY_KNOWN_HOSTS` | Independently authenticated SSH host-key inventory | Pinned known-hosts entry for the server; do not trust a first-contact `ssh-keyscan` alone |
| `OP_SERVICE_ACCOUNT_TOKEN` | Authorized **training-only** 1Password service account | Must be able to read `ers-training`, and **not** read other ERS vaults |

**Verification:** Reopen Environment secrets list and check **all five names exist at the `training` Environment level** (not merely at repository scope). GitHub deliberately does not show secret values after creation. The workflow's 1Password check specifically rejects access by this service token to `ers-development`, `ers-test`, `ers-production`, `ers-deployment`, `ers-recovery` and `ers-automation-bootstrap`. Do not use an organization-wide token. Record only the names, scoped-access review, and who approved each secret source.

**C. Create the independent `ers-training` 1Password vault and source entries** (authorized vault custodian):

1. In 1Password, create/verify a vault named **exactly `ers-training`**, separate from DEV/TST/PRD/recovery. Assign the minimal individual and service-account permissions needed.
2. Create/verify item **`runtime-secrets`** with fields **`JWT_SECRET`**, **`LEDGER_CORRECTION_KEY`**, and **`LEDGER_SETTLEMENT_KEY`**. Use new training-only strong values generated under your approved credential policy; **never copy** another environment's values.
3. Create/verify item **`backup-credentials`** with fields **`aws_access_key_id`** and **`aws_secret_access_key`**, for a training-scoped S3 credential. Its approved S3 policy must restrict it to the TRN namespace `ers-backups/training` and prohibit reading other environments' backups.
4. Verify the field names against the committed reference templates (read these in the authorized code checkout): `ops/1password/training.env.tpl` and `ops/1password/training-aws-credentials.tpl`. Do not put 1Password reference strings or secrets in GitHub log output.
5. Ensure the authorized Hetzner operator can run **`op`** in an approved interactive authenticated session. This capability is **not created by the deployment workflow**: that workflow authenticates on a GitHub runner with its own restricted token.

**PASS:** two actual independent GitHub identities, effective reviewer/branch/no-bypass settings, all five environment-scoped secret names, independently scoped 1Password vault and valid source fields verified. **FAIL:** shared Production credentials, an unscoped token, or self-approval bypass. **BLOCKED:** no Settings authority, unsupported GitHub protection rules, unavailable vault/key custody, or missing approved change. **Cleanup:** close sensitive tabs; do not export secret values to the report.

### T04 — Shared Hetzner capacity and independent PRD review (HETZNER-TEST + approved monitoring)

**Identity:** Infrastructure Operator. **Prerequisite:** authorized read-only SSH access to the *existing* Hetzner VM.

```bash
cd /opt/EnterpriseRemoteSystems/test
pwd -P
python3 -B scripts/ers-trn-preflight.py check-host \
  --server-root /opt/EnterpriseRemoteSystems
```

**Expected:** `PASS: TRN preflight (read-only); no deployment, account provisioning or approval performed`, followed by JSON; minimum 2 GiB RAM, 5 GiB disk, 2 CPUs and load below 75% of CPU count; safe Docker ownership.

**Already observed:** PASS at 2026-11-17T16:55:17 UTC (7,190,024,192 RAM bytes; 38,907,396,096 disk bytes; 4 CPUs; load 0.0). **Do not rerun solely to re-prove the same point**, unless another deployment is scheduled or the observation has become stale.

**Still mandatory:** Review the actual Production workload in the authorized Hetzner VM monitoring dashboard for **current and peak** CPU/memory/disk usage, container restarts, health and error trends; record the time span and an independent operator's capacity decision. A practical review includes recent normal and peak business periods; the source code does **not** encode a fixed historical window. The Docker overlay caps TRN backend/frontend/Caddy at **768 / 384 / 128 MiB** and **1 / 0.75 / 0.25 CPUs**, respectively; limits do not replace real headroom evidence. A read-only current snapshot can support, but **not replace**, a historical review:

```bash
docker ps --filter name=ers-prd --format 'table {{.Names}}\t{{.Status}}'
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' \
  ers-prd-backend ers-prd-frontend ers-prd-caddy
df -h /opt/EnterpriseRemoteSystems
```

**PASS:** instantaneous thresholds **and** independently approved historical PRD capacity; **FAIL:** measurable PRD risk or unexpected container owner; **BLOCKED:** absent monitoring/history/review. Never stop, restart, or prune Production containers for this check.

### T05 — Exact latest TST-approved release (GITHUB-WEB + HETZNER-TEST)

**Identity:** Release Operator; separate release-approval owner. **Purpose:** identify the real approved Test revision, not the feature SHA.

**A. GitHub UI:** Open repository → **Actions → Deploy Enterprise Remote Systems**. Inspect the *latest successful Test deployment run*, its commit, **deployed Playwright** result, and **Record successful Test release rehearsal** step. Record run URL/number and 40-character commit SHA. If the latest Test run has no approved rehearsal, STOP; a prior successful run is not automatically a suitable current candidate. Record the actual human release acceptance separately.

**B. Read-only commands on the Hetzner TEST checkout:**

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

**PASS:** GitHub's successful Test deployment SHA equals the server's `TEST_REVISION`; the Test rehearsal marker is valid for that SHA/tree; the actual authorized release owner has recorded acceptance. **BLOCKED:** marker missing/stale, GitHub/server mismatched, approval unavailable, or wrong revision. **Do not** edit the marker or check out the feature SHA to make them match. The marker is **automated evidence**, not human authorization.

## Phase 3 — One-time TRN installation, GitHub authorization, deployment and HTTPS

**Entry gate:** T03, T04 and T05 all PASS. No TRN installation, new DNS routing, or GitHub deployment before these preconditions. The following is a change to a **shared Production-hosting VM**; the authorized change window and rollback plan must be approved.

### 3.3 — Create the TRN checkout, *then* initialize `.env.training` (HETZNER-TEST → HETZNER-TRN)

**Identity:** Infrastructure Operator (`deploy` if authorized). **Where:** initially `/opt/EnterpriseRemoteSystems/test` is your existing checkout; `/opt/EnterpriseRemoteSystems/training` may be **missing or empty**. Never try `make` in an empty directory. **Do not create a new LOCAL Git worktree**; this is a separate server deployment checkout.

1. Inspect the destination without altering it:

```bash
cd /opt/EnterpriseRemoteSystems
pwd -P
ls -ld -- test training 2>/dev/null || true
if [ -d training ]; then
  find training -mindepth 1 -maxdepth 1 -print
fi
```

If `training` contains a `.git` checkout, **do not clone again**; inspect its origin, branch, SHA and existing secrets before taking any action. If `training` contains unknown files but is not an existing Git checkout, **STOP**; do not delete or move them. If `training` is **absent or empty**, proceed with the approved clone.

2. Run the clone **from the existing parent directory** (not from `training`):

```bash
cd /opt/EnterpriseRemoteSystems
git clone --branch test git@github.com:RodrigoMattosoSilveira/EnterpriseRemoteSystems.git training
cd /opt/EnterpriseRemoteSystems/training
pwd -P
git rev-parse --show-toplevel
git remote get-url origin
git rev-parse HEAD
ls -l Makefile
```

**Expected:** clone succeeds using the existing authorized deployment SSH/GitHub identity; Git root and `Makefile` are **now** `/opt/EnterpriseRemoteSystems/training`; origin is the approved repository. The HEAD must equal the Test-approved SHA from T05. If clone fails or the directory is already a checkout, STOP instead of forcing a clone. **No `sudo` is necessary** for properly assigned deployment directory ownership.

3. **Only now** initialize the TRN file (one time, in the directory that contains the Makefile):

```bash
cd /opt/EnterpriseRemoteSystems/training
make server-trn-init-env
chmod 600 .env.training
stat -c '%a %U:%G %n' .env.training
```

**Expected:** `Created .env.training (create-only for training)`, followed by file permission **600**. The generator writes `APP_ENV=training`, TRN cookie/origin, safe disabled E2E settings, an initial temporary JWT secret and empty ledger-key placeholders. The next stage replaces the generated JWT and keys from the dedicated vault. **Do not run `make server-trn-init-env` a second time**; source code deliberately refuses when `.env.training` already exists. If the file already exists, STOP and inspect with an authorized operator; do not overwrite it.

**PASS:** separate TRN checkout at approved SHA, Makefile found, new `.env.training` created once at mode 0600. **BLOCKED:** wrong revision, directory ownership, unresolved files, no Git access or preexisting environment file. **Do not** copy `.env.test` or `.env.production`.

### 3.4 — Install separate TRN runtime, S3 configuration and GitHub protections (HETZNER-TRN + GITHUB-WEB)

**Identity:** Infrastructure Operator, vault custodian, independent GitHub reviewer. **Prerequisites:** T03 completed (Environment/reviewers/secrets/vault); 3.3 complete; `ers-trn_backend-data` **does not exist**. The runtime installer is create-only and will refuse if a TRN Docker volume is already present.

**A. Confirm required tools and vault accessibility without printing secrets:**

```bash
cd /opt/EnterpriseRemoteSystems/training
python3 --version
op --version
docker info --format '{{.ServerVersion}}'
op vault get ers-training >/dev/null
```

**PASS:** all commands exit 0 under the authorized non-`sudo` deployment identity, with the `op` CLI already authenticated through the approved procedure. **BLOCKED:** tool missing, Docker unavailable, vault inaccessible. Do not paste a service-token value into a shell to bypass authentication.

**B. Materialize the exact reference templates and install their values.** The `ops/1password/` templates contain **references only**, not secrets. The following uses a protected subshell and removes **only the scratch directory it created**, even on failure. It does not create, reset or delete a database or Docker volume.

```bash
cd /opt/EnterpriseRemoteSystems/training
(
  set -euo pipefail
  umask 077
  # Existing shared secrets directory must not have its owner/mode changed here.
  if [ ! -d /opt/EnterpriseRemoteSystems/secrets ]; then
    install -d -m 0700 /opt/EnterpriseRemoteSystems/secrets
  fi
  if [ -e /opt/EnterpriseRemoteSystems/secrets/training-aws-credentials ] || \
     [ -L /opt/EnterpriseRemoteSystems/secrets/training-aws-credentials ]; then
    echo 'BLOCKED: training AWS credentials already exist; do not overwrite' >&2
    exit 2
  fi
  if docker volume inspect ers-trn_backend-data >/dev/null 2>&1; then
    echo 'BLOCKED: TRN data volume already exists; no initial credential rotation' >&2
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

**Expected messages:** `1Password materialization completed (secret values suppressed)` (twice), `1Password scratch materialization validated for training`, `PASS: TRN runtime values installed from scoped 1Password fragment (values suppressed)`. **STOP** on any nonzero exit. Do not print the `.env.training` file or credential file. No arbitrary `chmod -R` or privilege escalation is needed.

**C. Enter the independently approved, non-secret Hetzner S3 settings** into `.env.training`. These are initially blank. Use an approved editor on the TRN host:

```bash
cd /opt/EnterpriseRemoteSystems/training
nano .env.training
```

Find these three existing keys and enter their **actual** approved Hetzner values: `SERVER_OFFHOST_BACKUP_S3_ENDPOINT` (must be `https://<region>.your-objectstorage.com`), `SERVER_OFFHOST_BACKUP_S3_REGION` (one of `fsn1`, `nbg1`, `hel1`), and `SERVER_OFFHOST_BACKUP_S3_BUCKET` (actual approved bucket). **Do not invent a bucket or copy Production credentials.** Preserve `SERVER_OFFHOST_BACKUP_S3_PREFIX=ers-backups/training`, `AWS_SHARED_CREDENTIALS_FILE=/opt/EnterpriseRemoteSystems/secrets/training-aws-credentials`, and `AWS_PROFILE=ers-training-backup`. Save the file with mode 0600. The names/values for the three non-secret fields must come from the infrastructure owner's real Hetzner Object Storage configuration.

Verify without printing secret contents:

```bash
cd /opt/EnterpriseRemoteSystems/training
stat -c '%a %n' .env.training /opt/EnterpriseRemoteSystems/secrets/training-aws-credentials
make server-environment-contract-check ENV=training
```

**Expected:** both file modes **600**; Make exits 0 and emits no contract violation. This validates the software contract, **not** S3 access or an off-host backup. If an S3 credential/bucket is not scoped as required, stop before deployment.

**D. Re-verify GitHub Environment protection before starting the workflow** (GITHUB-WEB): reopen **Settings → Environments → training** and show the independent reviewer, prevent-self-review rule, only `test` branch, and the five secret *names* to the second person. **No approvals have yet been recorded.** A named approval is made when a workflow enters the waiting state in 3.5, not by checking a box in Settings. Mark 3.4 PASS only after both the server-side contract and Github-side protection settings pass.

### 3.5 / T06 — Deploy the latest approved TST candidate, without resetting TRN (GITHUB-WEB → HETZNER-TRN)

**Identities:** Release Operator (starts), independent GitHub reviewer (approves). **Prerequisites:** T03–T05 and 3.3–3.4 PASS, reviewed change window, correct Test SHA/tree, no active PRD incident.

**In GitHub UI:**

1. Open repository → **Actions** → select workflow **Deploy ERS Training (TRN) — approved Test candidate**.
2. Select **Run workflow** and choose branch **`test`**. If `test` is unavailable or the workflow does not exist on it, STOP; do not select a feature branch.
3. Fill three inputs **exactly**: `test_revision` = the 40-character approved `TEST_REVISION` from T05; `approval_reference` = your **actual** approved change identifier (at least six characters, permitted letters/digits/dot/colon/underscore/hyphen, starting with alphanumeric); `confirmation` = `DEPLOY-APPROVED-TEST-TO-TRN`.
4. Start the run. Verify that the job **waits for the `training` Environment reviewer** and is not executing privileged deployment steps before that approval.
5. The designated **different** reviewer opens the pending GitHub deployment approval, examines the requested Test SHA, reason and evidence, then explicitly approves or rejects. Record who approved and the run URL. **If the run proceeds without a required review, STOP and mark FAIL** even if it later succeeds.
6. Verify the workflow completes every step (source pin, TST rehearsal marker, 1Password scope check, capacity, environment contract, migration/backup gate, health, off-host backup) with a successful run conclusion. Record the run's Test revision/tree. A success does **not** certify public HTTPS or training access.

**Read-only checks after successful deployment on HETZNER-TRN:**

```bash
cd /opt/EnterpriseRemoteSystems/training
make server-trn-ps
make server-trn-backend-health
make server-trn-env-caddy-health
docker volume inspect ers-trn_backend-data --format '{{.Name}}'
docker network inspect ers-trn_default --format '{{.Name}}'
git rev-parse HEAD
```

**Expected:** only TRN Compose services, `ers-trn_backend-data`, `ers-trn_default`, internal health passing, and `git rev-parse HEAD` exactly equal to the approved TST SHA. The deployed workflow builds the exact approved *source tree*; it does **not** prove byte-identical OCI image promotion. **PASS:** all results and run approval observed, other environments unaffected. **FAIL:** wrong revision, missing approval, other environment modification, or failed backup. **BLOCKED:** incomplete prerequisites. Preserve volumes/evidence; never `down -v`.

### 3.6 / T12 (part 1) — Approve and activate public HTTPS (HETZNER-TRN → shared edge)

**Identity:** Infrastructure Operator and separately authorized reviewer. **Prerequisites:** T06 internal deployment PASS, DNS records reviewed, approved edge change window, explicit Production rollback plan. The edge router is shared with PRD; changing it is not a routine TRN command.

**Read-only inspection:**

```bash
cd /opt/EnterpriseRemoteSystems/training
make server-trn-ps
docker network inspect ers-trn_default --format '{{.Name}}'
make edge-diff
```

**Important:** `make edge-diff` uses `diff ... || true`, so a zero exit status is **not** evidence that configurations match. Read the printed differences and approve the exact TRN host/network additions, confirming no unintended PRD/TST/DEV changes. Verify DNS `trn.enterpriseremotesystems.com` points to the authorized edge host and TLS certificate issuance is approved. If DNS/certificate or rollback is missing, mark BLOCKED and do not touch the edge.

**Approved edge action, only within the recorded change window:**

```bash
cd /opt/EnterpriseRemoteSystems/training
make edge-sync
cd /opt/EnterpriseRemoteSystems/edge
docker compose -f docker-compose.edge.yml config
cd /opt/EnterpriseRemoteSystems/training
make edge-up
make edge-reload
```

**STOP condition:** `edge-sync` uses `rsync --delete` and `edge-up` may affect the shared proxy. Do **not** run this block until the independent Infrastructure Operator has confirmed the changes and rollback source. Do not execute `edge-down`, delete existing external networks, or restart unrelated environments. If edge becomes unhealthy, stop TRN onboarding and follow the **approved existing edge rollback procedure**; this document does not authorize improvised edits to shared Production routing.

**Browser checks:** open these four endpoints in separate tabs and verify successful HTTPS health responses and valid certificates:

- `https://trn.enterpriseremotesystems.com/api/v1/healthz`
- `https://dev.enterpriseremotesystems.com/api/v1/healthz`
- `https://tst.enterpriseremotesystems.com/api/v1/healthz`
- `https://app.enterpriseremotesystems.com/api/v1/healthz`

**PASS:** TRN public TLS health and unchanged DEV/TST/PRD health. **FAIL:** disrupted service, insecure public access, or unexpected route. **BLOCKED:** DNS/edge approval absent. Internal container HTTP checks are intentional and do not imply public HTTP support.

## Phase 4 — Backups, real human administrators, synthetic Training Tenant

### T07 — Verify TRN off-host backup and isolated restore (HETZNER-TRN)

**Identities:** Infrastructure Operator and separate evidence reviewer. **Prerequisites:** T06 deployed, real TRN backup exists, verified TRN S3 custody; explicit approval to stage a recovery copy in the isolated TRN recovery directory. **No restoration to the live DB.**

Find actual backups:

```bash
cd /opt/EnterpriseRemoteSystems/training
find /opt/EnterpriseRemoteSystems/training/backups \
  -maxdepth 1 -type f -name 'app-*.db' -print | sort
```

**Choose one real, existing absolute path from the output.** Execute the complete block below **in one terminal session**; its subshell stops immediately on a wrong path or failed verification and does not leave temporary shell variables behind.

```bash
cd /opt/EnterpriseRemoteSystems/training
(
  set -euo pipefail
  read -r -p 'Paste the exact absolute TRN backup .db path from the list: ' BACKUP_FILE
  case "$BACKUP_FILE" in
    /opt/EnterpriseRemoteSystems/training/backups/app-*.db) ;;
    *) echo 'BLOCKED: not an approved TRN backup path' >&2; exit 2 ;;
  esac
  test -f "$BACKUP_FILE"
  test -f "$BACKUP_FILE.manifest.json"
  test -f "$BACKUP_FILE.offhost.json"
  make server-backup-verify ENV=training BACKUP_FILE="$BACKUP_FILE"
  make server-offhost-backup-verify ENV=training BACKUP_FILE="$BACKUP_FILE"

  # Only after a separately recorded approval to stage a recovery copy:
  read -r -p 'Recovery staging approved by the independent reviewer? Type APPROVED: ' STAGE_APPROVAL
  test "$STAGE_APPROVAL" = APPROVED || { echo 'BLOCKED: stage approval missing' >&2; exit 2; }
  RECEIPT_FILE="$BACKUP_FILE.offhost.json"
  make server-restore-materialize-offhost ENV=training RECEIPT_FILE="$RECEIPT_FILE"
  # The command prints the new Recovery candidate directory.
  find /opt/EnterpriseRemoteSystems/training/recovery -type f -name 'app-*.db' -print
  read -r -p 'Paste the exact newly staged recovery .db path from THAT new directory: ' RECOVERY_BACKUP_FILE
  case "$RECOVERY_BACKUP_FILE" in
    /opt/EnterpriseRemoteSystems/training/recovery/*/app-*.db) ;;
    *) echo 'BLOCKED: recovery DB outside TRN candidate directory' >&2; exit 2 ;;
  esac
  test -f "$RECOVERY_BACKUP_FILE"
  make server-restore-verify ENV=training RECOVERY_BACKUP_FILE="$RECOVERY_BACKUP_FILE"
)
```

The staging approval prompt is an **additional confirmation** and is **not itself authorization**: the reviewer must already have approved this exact isolated recovery exercise. A failure at any point means **STOP**; do not select another environment's backup or repeat staging blindly.

**PASS:** correct TRN backup, manifest, real S3 receipt/object version, newly staged isolated DB and read-only restore-verify all pass. Record file paths and SHA/object version without copying secrets. **FAIL:** mismatch or bad integrity. **BLOCKED:** missing stage approval or ambiguous candidate. **Cleanup:** preserve recovery evidence unless separately approved for targeted cleanup; track/remove **only** disposable containers created by the test, confirm none remain and no exclusive ports remain occupied. No Docker cleanup is needed if none were created. **Never run** `make server-restore-apply` for T07.

### T08 — Enroll two individually controlled TRN Application Administrators (HETZNER-TRN + two browsers)

**Identities:** Infrastructure Operator, two **distinct actual humans** (Admin A and Admin B), independent approver. **Prerequisites:** T07 complete, actual approved enrollment change, verified current TRN off-host backup, no other TRN database writers, individual credentials prepared in 1Password. This is an explicitly authorized live TRN **database write**, not part of an offline test.

Run this **single guarded block** only after the two humans and independent approval are present. It will ask for identifiers, not password values; the enrollment helper collects the two passwords interactively later.

```bash
cd /opt/EnterpriseRemoteSystems/training
find backups -maxdepth 1 -type f -name 'app-*.db' -print | sort
(
  set -euo pipefail
  read -r -p 'Enter the actual verified absolute TRN backup path: ' TRN_ENROLL_BACKUP_FILE
  read -r -p 'Enter the actual approved change identifier: ' TRN_ENROLL_APPROVAL
  read -r -p 'Enter the actual operator identifier: ' TRN_ENROLL_OPERATOR
  export TRN_ENROLL_BACKUP_FILE TRN_ENROLL_APPROVAL TRN_ENROLL_OPERATOR
  export TRN_ENROLL_CONFIRM=ENROLL-TRAINING-HUMANS-OFFLINE
  case "$TRN_ENROLL_BACKUP_FILE" in
    /opt/EnterpriseRemoteSystems/training/backups/app-*.db) ;;
    *) echo 'BLOCKED: invalid TRN backup path' >&2; exit 2 ;;
  esac
  : "${TRN_ENROLL_APPROVAL:?Missing approved change identifier}"
  : "${TRN_ENROLL_OPERATOR:?Missing authorized operator identifier}"
  bash scripts/ers-trn-enroll.sh
)
```

The script independently checks the backup and its manifest/receipt, validates the TRN contract, stops **only** `ers-trn-backend`, confirms isolation, collects passwords interactively from both humans, runs the enrollment operation once through a temporary container (`--rm`), restarts the backend and makes a new backup. **On failure, it deliberately leaves the TRN backend stopped.** Do not automatically retry, reset the database, or create E2E accounts. Identify the temporary container created by the exercise and verify it has been removed before accepting; do not touch unrelated containers.

**UI verification:** In separate browser profiles, Admin A and Admin B independently sign in to **TRN**, complete mandatory first-password-change requirements, verify distinct global Application Administrator Accounts/Actors, and sign out. **PASS:** both distinct humans authenticate and new TRN backup verified. **FAIL:** shared credential, duplicate identity, wrong permissions. **BLOCKED:** any missing approval, backup, writer isolation, or second human.

### T09 — Create synthetic Training Tenant and trainee account (TRN-BROWSER)

**Identities:** Training Application Administrator (global), authorized Training Tenant Administrator (tenant scope), Customer Support Specialist (personal `TENANT_VIEWER`), Training Coordinator (witness). **Prerequisites:** T08 PASS and public HTTPS confirmed.

1. **Global Application Administrator / TRN:** Sign in with an individual TRN global admin Account. Open **Administration → Tenants → Create Tenant**. Search existing Tenants first to avoid duplication. Create one **synthetic** Tenant (a suggested *nonreserved* code is `ERS_SUPPORT_TRAINING`, only if unused); describe it as synthetic/no customer records. Record the actual Tenant code/ID. **Do not use** `TRAIN354C_A` or `TRAIN354C_B`.
2. **Global Application Administrator / TRN:** Open **Administration → Tenants → [the existing synthetic Tenant] → Tenant Administrators**. The normal **Assign Tenant Administrator** selector requires an eligible Account-bound Tenant Actor. If one already exists, select the independently approved eligible human and assign the role. **If no eligible Tenant Actor exists and the active Tenant has no prior candidate or administrator assignment**, select **Create first Tenant Administrator candidate**. Enter only the separately authorized human's valid Person identifiers, new tenant Actor key, unique email login, and initial password. This operation creates the canonical global Person, ordinary Account, active Membership, and Tenant Actor **without granting a role**. After creation, explicitly select that candidate and use **Assign Tenant Administrator** to grant `TENANT_ADMIN`; verify the Tenant reaches `ACTIVE_READY`. Follow [T09 first-Tenant-Administrator onboarding](byte-35-7-t09-first-tenant-admin-onboarding.md) for the complete UI-first steps and negative checks. If neither the create-only action nor an eligible candidate is available, mark **BLOCKED** rather than inventing an Actor or bypassing the UI. Never assign a T08 global administrator as a tenant Actor, create an E2E account, or edit the database directly.
3. **Training Tenant Administrator / TRN / exact Training Tenant context:** Sign in with this separately authorized tenant-scoped human Account; confirm the Tenant context at the top. Open **People / Pessoas** and search for the trainee's exact authorized email before creating anything. If a Person already exists, use **Add Membership / Adicionar vínculo** for this Tenant; do not duplicate the global Person or Authentication Account. If absent and authorized, select **Create Person** and enter the required identifying fields through the UI, then verify one active Tenant Membership. **Privacy prerequisite:** The existing form may require CPF, RG, phone, and email. Do **not invent a false CPF for the actual trainee** or copy her real identifiers into public test evidence. If processing her identifiers in TRN has not been approved, STOP/BLOCKED and request an approved privacy-safe onboarding design.
4. **Training Tenant Administrator / same Tenant:** Open the Person detail → **Authentication / Autenticação**. Check whether Authentication is already enabled; where permitted, use **Enable Authentication / Habilitar autenticação** with a **unique, one-time password** securely issued via 1Password. If this section does not permit enrollment, an authorized GLOBAL administrator may use **Administration → Authentication → Create account** only after the active Tenant Membership exists, without creating a duplicate Account. If neither supported path works, STOP; do not call hidden APIs or use SQL.
5. **Training Tenant Administrator / same Tenant:** Open **Administration → Tenant Authorization / Delegated Roles**. Find the exact trainee login and Tenant Actor, verify active Membership, and grant the existing **`TENANT_VIEWER`** Role *for the Training Tenant only*. Do not grant `TENANT_ADMIN`, `APPLICATION_ADMIN`, a Production lease, or a standing Support Role.
6. **Customer Support Specialist / separate browser profile:** Sign in at `https://trn.enterpriseremotesystems.com` with her own Account and one-time password. Complete mandatory initial password change, sign out, then sign in again with the changed password. Confirm the approved Training Tenant and only permitted **read-only** pages; a Journey can be inspected only if the Role actually permits it. Verify she does not see a global Administration context or any other customer Tenant.

**PASS:** independent personal login, correct read-only role, no E2E or global administrator privileges, synthetic training data only. **FAIL:** cross-Tenant data exposure, permanent unintended grant, missing password separation. **BLOCKED:** no eligible Tenant Administrator or supported UI operation. **Cleanup:** sign out; preserve training data.

### T10 — Prove persistence under an approved redeployment (GITHUB-WEB + TRN-BROWSER)

**Identities:** Training Coordinator, Release Operator, independent reviewer. **Prerequisites:** trainee and at least one synthetic Person/Journey already created; another explicit approved redeployment of the **current latest TST-approved SHA** or a newer approved Test candidate.

1. In TRN UI, record **non-sensitive** before-values: trainee Account login/ID, Membership/Role, synthetic Person and Journey IDs/counts, and current TRN SHA (read-only `git rev-parse HEAD` on HETZNER-TRN).
2. In GitHub, follow **the same protected Training workflow and independent approval steps as T06** with the real approved Test revision, approval reference, and confirmation literal. Do not run DEV's database replacement target or any volume deletion.
3. After successful internal deployment and public HTTPS verification, repeat the UI checks as the same trainee using her existing password. Confirm her Account, Membership, Person, Journey and training progress survived; check the same `ers-trn_backend-data` volume exists.

**PASS:** all persistent records and credentials survive. **FAIL:** an Account or training record disappears, password changes unexpectedly, or a volume is replaced. **BLOCKED:** no independent approval/redeployment window. Preserve the data and backup evidence.

### T12 — Final independent TRN-only handoff (GITHUB-WEB + browser)

**Identities:** Infrastructure Operator, independent Release Reviewer, Training Coordinator. **Prerequisites:** T01–T11 PASS, including backup restore verification, actual two-human admin login and the trainee's individual login, plus successful HTTPS checks from 3.6.

1. Recheck TRN + DEV/TST/PRD HTTPS health endpoints listed in 3.6.
2. Compare the **GitHub TRN run SHA/tree**, Test approval and marker, TRN Git HEAD, backup receipt/object version, isolated restore verification, two human administrator observations, trainee login and T10 persistence proof.
3. Record T01–T12 status, actual evidence references and a named **GO** (training access only) or **NO-GO** in the private operational record.
4. On GO, the Training Coordinator may distribute the approved trainee training packet and begin supervised learning. No Production support authorization or 35.7 Production activation is granted.

**PASS:** complete independent evidence and no impact on other environments. **FAIL:** cross-environment impact/security failure/data loss. **BLOCKED:** any unverified gate; do not admit trainees prematurely.

## Phase 5 — Ongoing operation, failure rules, cleanup

**Every future TRN release:** Repeat Test-approved marker check, a *new* documented approval, current host capacity/PRD history review, GitHub independent reviewer approval, persistent-volume migration gate, off-host backup, health/smoke and data-persistence verification. No automatic promotion from DEV/TST pushes. Version selection remains **latest approved Test candidate**, until you explicitly change policy after Production go-live.

**On a problem:**

- Wrong Git SHA, missing marker, missing reviewer, failed 1Password scope or missing capacity: **BLOCKED**, no deployment authorized.
- Failed migration/health: **STOP**; existing protected TRN-only migration recovery gate determines any guarded rollback. Do not restore PRD or TEST data or attempt arbitrary database surgery.
- Failed post-deployment backup: **STOP**; the GitHub workflow intentionally stops only TRN services; retain the persistent TRN volume and review backup error without secret disclosure.
- Broken shared edge/PRD health: **STOP TRN** and follow the preapproved edge rollback/incident runbook.
- Missing training data or login: **FAIL**; preserve evidence and recovery copies, do not reset/reseed.

**Cleanup:** The LOCAL Python tests create no persistent Docker containers. Live TRN containers and `ers-trn_backend-data` **must remain** after successful acceptance. Temporary restore or enrollment containers/copies are handled only with specifically tracked identities and an approved, scoped cleanup. Never indiscriminately prune Docker or delete shared-VM files. Confirm any test-created containers and exclusively used ports are released; do not stop unrelated services.

## Appendix A — Where the existing commands actually come from

| Command or setting | Verified repository source |
|---|---|
| `make server-trn-init-env` | Root `Makefile` → `server-init-env ENV=training` → `scripts/init-server-env.sh` (create-only, relative to working directory) |
| `make server-environment-contract-check ENV=training` | Root `Makefile` → `scripts/ers-environment-guard.sh`; checks S3 metadata, cookie, environment and unsafe settings |
| `python3 -B scripts/ers-trn-preflight.py ...` | `scripts/ers-trn-preflight.py` (Python source is not guaranteed executable; always invoke through Python) |
| Training workflow name / inputs / five secrets | `.github/workflows/deploy-training.yml` (only `test`, job `environment: training`) |
| Runtime/backup 1Password items | `ops/1password/training.env.tpl` and `ops/1password/training-aws-credentials.tpl` |
| `make edge-sync`, `make edge-up`, `make edge-reload` | Root `Makefile`; shared edge, change-controlled |
| Backup / off-host / restore verification | Root `Makefile`; `server-backup-verify`, `server-offhost-backup-verify`, `server-restore-materialize-offhost`, `server-restore-verify` |
| Two-human enrollment | `scripts/ers-trn-enroll.sh` and `scripts/ers-two-human-admin-input.py` |
| Negative-case verification | `scripts/test-trn-environment.py`, `scripts/test-production-environment-guardrails.py` |

## Appendix B — Glossary Impact

- **TRN:** Persistent non-Production Training environment on existing Hetzner VM, not an ERS Tenant or authorization Role.
- **Training Tenant:** A synthetic Tenant inside TRN, separate from protected test fixtures.
- **Latest TST-approved release candidate:** Latest exact Test SHA/tree with valid Test rehearsal evidence and a separately accepted human release decision.
- **Release Operator / Infrastructure Operator / Training Coordinator / Independent Reviewer:** Human operational responsibilities, not new application Roles.
- **Protected Training data:** Training Accounts and business records are never subject to routine destructive demo/reset operations.
- **Training Application Administrator:** Individually controlled, application-global administrator in TRN only; no implied DEV/TST/PRD access.

Existing Person, Account, Actor, Membership, Entidade, Journey, OPENING_BALANCE, and Tenant Support Access Lease semantics are unchanged.
