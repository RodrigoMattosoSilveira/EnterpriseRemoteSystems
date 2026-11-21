# Byte 35.6S.1A — Training (TRN) Environment and Deployment

> **SUPERSEDED — DO NOT EXECUTE THIS AS A SEPARATE PROCEDURE.** The single current operational procedure, including T01–T12, is [`byte-35-6s1a-operator-runbook-and-acceptance.md`](byte-35-6s1a-operator-runbook-and-acceptance.md). This file remains for legacy test-contract/reference compatibility only.

**Purpose:** Train an individually identified Customer Support Specialist on the most recent **TST-approved release candidate**, independently of DEV/TST test fixtures and Production customer data. TRN shares the existing Hetzner *VM*, but **never** a database, authentication session, credential, deployment schedule, or backup namespace with another environment.

**Status:** Software and offline regressions are deliverables; **live TRN is BLOCKED until actual server, GitHub, 1Password, backup, DNS/HTTPS, and human acceptance evidence is collected.** Nothing in this document authorizes Production activation, provides a Production support lease, or relaxes the 35.5/35.6/35.7 gates.

## A. Who does what — assign actual people before beginning

| Responsibility (not an ERS authorization Role) | Required access | What the person actually does |
|---|---|---|
| Training Coordinator | Read-only training docs and an approved Training Tenant | Schedules change window, witnesses login, records training decisions |
| Release Operator | GitHub Actions Test deployment, authorized release/SSH credentials | Records the approved Test SHA/tree/marker; starts the TRN GitHub deployment; stops on failure |
| Infrastructure Operator | Existing Hetzner VM and restricted TRN DNS/network/1Password configuration | Creates **separate** TRN checkout/config, verifies VM resources, storage, S3, DNS, HTTPS |
| Training Application Administrator(s) | Individual ERS GLOBAL admin accounts **in TRN only** | Set up Training Tenant and provision its eligible Tenant Administrator using existing UI rules |
| Training Tenant Administrator | Authorized TRN Tenant Actor and Membership | Adds approved staff Person/Account and synthetic training records via the UI |
| Support Specialist | Her own individual `TENANT_VIEWER` account in TRN | Signs in; completes guided functional/technical exercises |

An individual may perform several non-conflicting tasks, but a GitHub Environment reviewer must be independent where required by the configured approval policy. Do not substitute an E2E or shared credential for a human. Passwords and private keys must stay in 1Password; never paste them into support tickets, GitHub logs, or this evidence record.

## B. Environment contract

| Attribute | TRN (new) | Must never match |
|---|---|---|
| Public address | `https://trn.enterpriseremotesystems.com` (DNS must be confirmed) | DEV/TST/PRD hostnames |
| Directory on existing VM | `/opt/EnterpriseRemoteSystems/training` | `/development`, `/test`, `/production` |
| Git source | **exact** current Test revision and tree with approved Test release rehearsal | A mutable DEV or feature branch |
| Docker Compose project | `ers-trn` | `ers-dev`, `ers-tst`, `ers-prd` |
| Persistent SQLite volume | `ers-trn_backend-data` | Any other environment's volume |
| Backend environment | `APP_ENV=training` | `APP_ENV=test` or `production` |
| Server config | `.env.training`, mode 0600 | `.env.test`, `.env.production` |
| Session cookie | `ers_trn_session`, Secure | Shared session cookies/secrets |
| Secret custody | Individual 1Password `ers-training` vault, scoped deployment token | Reusing `E2E_ADMIN_PASSWORD` or another environment's JWT |
| Off-host backup | Verified separate S3 prefix `ers-backups/training`, separate credential file/profile | `ers-backups/production` or Test backup credentials |
| Docker resources | 768 MiB / 1 CPU backend; 384 MiB / .75 CPU frontend; 128 MiB / .25 CPU Caddy | Unbounded training containers |

No real customer data is permitted. Training data, trainee identities, passwords, and progress must survive normal TRN deployments. The ordinary `make server-replace-development-db` and `down -v` operations must reject TRN. The existing 35.4C fixture Tenants `TRAIN354C_A` and `TRAIN354C_B` are not reused for training onboarding.

## C. Verify accepted Test release **before** touching TRN

**Release Operator — GitHub web UI:** Open **Actions → Deploy Enterprise Remote Systems**. Select the most recent successful **Test** deployment that completed its deployed Playwright test and **Record successful Test release rehearsal**. Record its exact 40-character commit SHA from deployment evidence. Do **not** substitute the SHA of an arbitrary successful DEV build. Check the human release decision, if required by your team's release policy.

**Release Operator — authorized Hetzner Linux shell (read-only):**

```bash
cd /opt/EnterpriseRemoteSystems/test
pwd -P
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
# Use the exact tree SHA printed above:
TREE_SHA="$(git rev-parse 'HEAD^{tree}')"
ls -l "release-rehearsal-passed/${TREE_SHA}.passed"
python3 -B scripts/ers-trn-preflight.py verify-test \
  --marker "release-rehearsal-passed/${TREE_SHA}.passed" \
  --revision "$(git rev-parse HEAD)" \
  --tree-sha "$TREE_SHA"
```

**PASS:** `PASS: TRN preflight (read-only)` and JSON containing the exact Test revision, tree and marker checksum. **BLOCKED:** missing/stale marker, different Test HEAD, invalid evidence, or unclear release approval. The marker verifies automated Test rehearsal evidence; it is **not itself a human authorization**. Do not fabricate or hand-edit markers.

## D. Verify VM isolation and capacity before installation

**Infrastructure Operator — authorized Hetzner Linux shell:**

```bash
cd /opt/EnterpriseRemoteSystems/test
python3 -B scripts/ers-trn-preflight.py check-host \
  --server-root /opt/EnterpriseRemoteSystems
```

**PASS:** Linux host has at least 2 GiB `MemAvailable`, 5 GiB free on the ERS server root filesystem, at least two CPUs, one-minute load below 75% of CPU count, and no existing `ers-trn-*` container owned by a foreign Compose project. **BLOCKED:** insufficient resources, unknown Docker ownership, missing Python 3, or wrong host. These are minimum *entry* thresholds, not proof of sustained Production capacity. Review Production's current memory/cpu/disk use, restart/error rates, and actual Hetzner metrics with an authorized operator; schedule TRN launch during low load. If capacity is not sufficient, do **not** add TRN to the shared VM.

The `docker-compose.training.yml` overlay sets container CPU, memory and PID ceilings only for TRN. Do not add `-v`, delete named volumes, or stop existing DEV/TST/PRD containers for this installation. The trusted edge proxy joins the new `ers-trn_default` network; no database volume or backend credentials are shared with other projects.

## E. One-time server preparation (Infrastructure Operator)

**Preconditions:** The patch has been promoted through the approved Git branches; the **Test** branch contains this implementation and passed its normal checks. DNS/Caddy changes are reviewed; the GitHub `training` Environment is provisioned with *required reviewers*, restricted authorized deploy secrets (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_KNOWN_HOSTS`, and scoped `OP_SERVICE_ACCOUNT_TOKEN`), and no Production vault access. These are GitHub settings, not repository YAML defaults. **BLOCKED** unless an authorized operator explicitly verifies this control in GitHub Settings → Environments → `training`.

Create a **distinct Git checkout** on the Hetzner VM (this is a deployment directory, not a local developer worktree):

```bash
cd /opt/EnterpriseRemoteSystems
# Only after approved host access and directory ownership review:
git clone --branch test git@github.com:RodrigoMattosoSilveira/EnterpriseRemoteSystems.git training
cd /opt/EnterpriseRemoteSystems/training
git rev-parse HEAD
make server-trn-init-env
chmod 600 .env.training
```

**Expected:** `Created/updated .env.training`. This initializer is **create-only** for TRN: a second invocation MUST fail rather than overwrite credentials or backup settings. A newly generated `JWT_SECRET` is only an initial value; the source of truth is the *independent* `ers-training` 1Password vault. The file MUST be provisioned by an authorized operator using **only** the `ers-training` 1Password vault, not copied from DEV/TST/PRD. Before executing the next block, create the `runtime-secrets` and `backup-credentials` entries in that vault using the exact field names in `ops/1password/training.env.tpl` and `ops/1password/training-aws-credentials.tpl`. Ensure that the operator has an approved **interactive 1Password CLI session** on the Hetzner host; never paste a service token into the shell or log. These commands do not display secret values.

**Infrastructure Operator — authorized Hetzner Linux shell; initial installation only, before any TRN volume exists:**

```bash
cd /opt/EnterpriseRemoteSystems/training
umask 077
install -d -m 0700 /opt/EnterpriseRemoteSystems/secrets
TRN_SCRATCH="$(mktemp -d /opt/EnterpriseRemoteSystems/secrets/trn-init.XXXXXXXX)"
# Keep scratch on the protected server only. Erase scratch after success or failure.
trap 'rm -rf -- "$TRN_SCRATCH"' EXIT

python3 -B scripts/ers-op-materialize.py \
  --template ops/1password/training.env.tpl \
  --output "$TRN_SCRATCH/runtime.env" --expected-root "$TRN_SCRATCH"
python3 -B scripts/ers-op-materialize.py \
  --template ops/1password/training-aws-credentials.tpl \
  --output "$TRN_SCRATCH/aws-credentials" --expected-root "$TRN_SCRATCH"
python3 -B scripts/ers-op-validate-fragments.py \
  --environment training --fragment "$TRN_SCRATCH/runtime.env" \
  --aws-credentials "$TRN_SCRATCH/aws-credentials"

python3 -B scripts/ers-trn-install-runtime-secrets.py \
  --env-file /opt/EnterpriseRemoteSystems/training/.env.training \
  --fragment "$TRN_SCRATCH/runtime.env" \
  --confirm INITIALIZE-TRAINING-SECRETS
install -m 0600 "$TRN_SCRATCH/aws-credentials" \
  /opt/EnterpriseRemoteSystems/secrets/training-aws-credentials
rm -rf -- "$TRN_SCRATCH"
trap - EXIT
```

**Expected:** both materializations, the scoped fragment validator, and runtime installer report PASS without printing any passwords or keys. If the TRN SQLite volume already exists, the installer intentionally refuses to rotate credentials; use a separately approved credential-maintenance procedure instead. Never commit `.env.training` or the AWS credentials file. A `BLOCKED` result requires investigation, not reinitialization.

Complete and independently validate **TRN-only S3 backup settings**, keeping `SERVER_OFFHOST_BACKUP_ENABLED=true`, `SERVER_OFFHOST_BACKUP_TRANSPORT=s3`, `SERVER_OFFHOST_BACKUP_S3_PREFIX=ers-backups/training`, and `AWS_SHARED_CREDENTIALS_FILE=/opt/EnterpriseRemoteSystems/secrets/training-aws-credentials`. Supply the actual region, endpoint and approved bucket using the established Hetzner backup procedure and a **separate** S3 key/profile restricted to the TRN prefix. The file and key must be stored in the approved 1Password vault and materialized with restricted permissions using the commands above. Access to the PRD backup prefix must be denied. Do not reuse the Production AWS credentials file or assume that a separate prefix alone enforces access isolation. Separately verify the TRN access key's S3 object policy using an authorized S3 policy review; no broader bucket permission is implied by this repository. Capture a verified actual off-host restore later in manual acceptance.

**Infrastructure Operator — same host:** open `.env.training` with an approved editor (do not `cat` it into logs) and set `SERVER_OFFHOST_BACKUP_S3_ENDPOINT`, `SERVER_OFFHOST_BACKUP_S3_REGION`, and `SERVER_OFFHOST_BACKUP_S3_BUCKET` to the *actual approved* Hetzner object-storage values. These values cannot safely be invented in a generic runbook. Verify the endpoint's HTTPS certificate and the separate TRN prefix and profile in the environment contract. Do not use or change a Production S3 credential.

Once populated, validate without printing secrets:

```bash
cd /opt/EnterpriseRemoteSystems/training
make server-environment-contract-check ENV=training
# Expected: exit code 0; no output containing secret values
```

**BLOCKED** if the environment file, scoped vault, S3 permissions, runtime file permissions, or required reviewers are not verified. Do not run `make server-trn-up` as a workaround.

## F. Deploy the approved Test candidate — GitHub UI

**Release Operator:** Open the **Test** branch → **Actions → Deploy ERS Training (TRN) — approved Test candidate** → **Run workflow**. Enter:

- `test_revision`: the actual 40-character Test SHA collected in C (not the feature-branch SHA).
- `approval_reference`: your approved internal change identifier; never a password.
- `confirmation`: `DEPLOY-APPROVED-TEST-TO-TRN`.

Authorize through the independent GitHub `training` Environment reviewer. The workflow then checks that the Test branch HEAD matches the requested SHA, verifies the actual Test rehearsal marker from the server, checks 1Password vault scope, reads shared-VM capacity and Docker ownership, and checks the existing TRN environment contract. It fetches and checks out the **exact** Test revision into the separate TRN checkout; builds the same source revision as Test (current tooling does **not** yet prove byte-identical OCI image promotion); reuses the existing backup/rehearsal/migration recovery gate, deploys with `ENV=training`, verifies internal health/schema, and creates a verified new off-host TRN backup. It never runs `server-replace-development-db`, provides E2E passwords, or executes `down -v`.

**PASS:** Workflow completes and prints the exact Test revision and internal TRN health; a verified TRN backup and receipt exist. **FAIL:** workflow error; preserve all evidence, do not delete volumes, and follow its TRN-only STOP/rollback instructions. A failed post-deployment off-host backup deliberately stops only the TRN Compose services (never deletes volumes or changes DEV/TST/PRD); the operator must resolve the backup failure and explicitly reauthorize a rollout before training resumes. **BLOCKED:** unapproved or missing Test rehearsal marker, GitHub reviewer setting, capacity, separate 1Password vault or backups. A GitHub success does not prove public HTTPS, restored backup or trainee login.

## G. First-time edge HTTPS activation (Infrastructure Operator)

**Preconditions:** the TRN backend project is healthy, DNS A/AAAA records for `trn.enterpriseremotesystems.com` correctly target the existing edge host, and adding `ers-trn_default` to the edge proxy network has been reviewed. The edge is shared with PRD: **do not reload or restart it without a change approval and rollback plan**. The new Caddy configuration is declarative only; this patch does not modify the running edge.

**Read-only inspection:**

```bash
cd /opt/EnterpriseRemoteSystems/training
make server-trn-ps
# Expect only ers-trn containers under Compose project ers-trn.
docker network inspect ers-trn_default --format '{{.Name}}'
cd /opt/EnterpriseRemoteSystems/test
make edge-diff
# Review exact intended edge/Caddy and Compose changes before any edge action.
```

**Approved operator action (only after review and planned maintenance):** sync the approved `edge/` files using the existing `make edge-sync` procedure, run `docker compose -f docker-compose.edge.yml config` inside `/opt/EnterpriseRemoteSystems/edge` to validate them, and use the existing `make edge-up` / approved edge reload procedure. Edge re-creation may affect other environments; halt if you cannot demonstrate the PRD availability and rollback plan. Never remove unrelated networks or containers.

**Browser verification:** Open `https://trn.enterpriseremotesystems.com/api/v1/healthz`. Confirm an HTTPS 200 health response with valid certificate. Independently check the DEV/TST/PRD health endpoints after edge changes. **BLOCKED** if any environment becomes unhealthy or TLS is not correct.

## H. First human administrator and customer-support onboarding

No E2E administrator is automatically provisioned in TRN. The new database intentionally has **no** human Accounts. To make TRN usable, an authorized two-human administrator enrollment must follow the existing **offline** procedure, extended for `--environment training`. This is a separate explicit human operation after the first successful deployment and verified TRN off-host backup; it is **not** performed by GitHub Actions. Use the existing 35.6 security and recovery standards.

**Training Application Administrators and Infrastructure Operator:** obtain approval and two distinct new training-only credentials in 1Password; verify that no real customer data is present and that a real, independently verified TRN off-host backup exists. The script below stops **only** the TRN backend, confirms that it stopped, prompts both human administrators for their own passwords, performs a single-use offline enrollment through an ephemeral TRN image container, and restarts the TRN backend after success. It does **not** save password input. Make sure all other TRN database writers have been excluded; any unexpected TRN container or writer is BLOCKED.

**Infrastructure Operator — authorized interactive Hetzner Linux shell:**

```bash
cd /opt/EnterpriseRemoteSystems/training
# Read-only: list real backups created by server-backup, newest last alphabetically.
find backups -maxdepth 1 -type f -name 'app-*.db' -print | sort
# Choose the actual verified path from this list; never choose a TST/PRD backup.
# Example syntax ONLY: set an actual filename returned by find, not this illustration.
# export TRN_ENROLL_BACKUP_FILE=/opt/EnterpriseRemoteSystems/training/backups/app-<actual-timestamp>.db
```

After selecting the actual file and setting `TRN_ENROLL_BACKUP_FILE` to its absolute path, set `TRN_ENROLL_APPROVAL` to the actual approved change ID and `TRN_ENROLL_OPERATOR` to the real operator's recorded ID. These are **identifiers, not credentials**; do not replace them with invented values.

```bash
export TRN_ENROLL_CONFIRM=ENROLL-TRAINING-HUMANS-OFFLINE
# The next three variables must already have been set to actual observed values:
: "${TRN_ENROLL_BACKUP_FILE:?Choose the actual backup path first}"
: "${TRN_ENROLL_APPROVAL:?Use the actual signed/approved change ID}"
: "${TRN_ENROLL_OPERATOR:?Use the actual authorized operator ID}"
bash scripts/ers-trn-enroll.sh
unset TRN_ENROLL_CONFIRM TRN_ENROLL_BACKUP_FILE TRN_ENROLL_APPROVAL TRN_ENROLL_OPERATOR
```

**PASS:** script reports enrolled administrators without password disclosure, TRN-only backend restarts healthy, new backup succeeds, and both people independently sign in and change their initial passwords. **FAIL:** shared credentials or wrong environment/Actor. **BLOCKED:** absent second human, approval, backup receipt, or independently demonstrated writer isolation. On failure, **TRN backend intentionally remains stopped**; do not reset its database or stop another environment.

The Training Application Administrator can then use **Administration → Tenants** to create a dedicated synthetic Training Tenant (not `TRAIN354C_A`/`TRAIN354C_B`). The Tenant Administrator and Customer Support Specialist are provisioned via the existing approved UI Person, Membership, Authentication and Role workflows. The trainee begins as `TENANT_VIEWER`; no global admin, E2E fixture password, or Production support lease. Complete Byte 35.6S.1 T01–T12 **in TRN** after deployment.

## I. Failure, recovery and recurring deployments

- Missing Test approval or bad SHA: **BLOCKED**, nothing deployed.
- Insufficient Hetzner capacity: **BLOCKED**; reserve resources or host TRN separately rather than impacting PRD.
- Failed TRN migration or internal health: existing TRN migration recovery gate stops TRN and attempts rollback from the verified **TRN-only** pre-migration backup. Never restore using TST/PRD data. Follow recovery evidence; do not automatically retry.
- Failed post-deploy backup: **STOP**, do not admit trainees. Review and independently repair off-host backup permissions before continuing.
- Unexpected training data/account changes: **FAIL**, preserve current TRN database and verified backups; use approved isolated TRN recovery, not `down -v`.
- PRD incident during TRN rollout: **STOP TRN**, prioritize PRD recovery and investigate resource interference.

Each subsequent TRN release repeats the exact Test marker, approval, capacity, migration, off-host and smoke checks. **TRN is never automatically redeployed by a DEV/TST/PRD push.** When Production is live, reconsider whether TRN should track Production-stable versions; for this bite the accepted policy remains **latest TST-approved candidate**.

## J. Glossary Impact

- **TRN (Training Environment):** persistent, isolated deployed learning environment on shared Hetzner VM; not an ERS Tenant/Actor Role.
- **TST-approved release candidate:** exact latest Test Git SHA/tree with verified Test release-rehearsal and release authorization; marker validity alone is not a human approval.
- **Training Coordinator / Release Operator / Infrastructure Operator:** procedural responsibilities, not new Authentication Accounts or authorization Roles.
- **Training Tenant:** a synthetic Tenant in TRN; not the TRN environment itself.
- **TRN Migration Recovery Gate:** existing guarded migration/backup/rehearsal mechanism applied only to the TRN database and persistent volume.

No changes to Person, Membership, Actor, Journey, Entidade, OPENING_BALANCE or Tenant Support Access Lease semantics.
