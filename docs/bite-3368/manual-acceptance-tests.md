# Bite 33.6.8 — Integrated Regression, Recovery Rehearsal, and Final Acceptance — Manual Test Suite

**Issue:** #998. **Baseline:** `998-bite-3368--integrated-regression-testing-recovery-rehearsal-and-final-acceptance` at `17cedf7183834740533bd5e12d8c115b61d0f496` (patch input, NOT an expected HEAD after committing). **This manual does not authorize Production operations.**

**Sequence:** IT-00 → IT-01 → IT-02 (LOCAL) → IT-03 (isolated *deployed Test* off-host recovery) → IT-04 (existing/newly enrolled *deployed Test* humans) → IT-05 → IT-06 (Test evidence) → IT-07 (separate Production evidence/authorization review) → IT-08 (cleanup/decision). Do not jump past BLOCKED tests. A LOCAL pass supports branch promotion but cannot satisfy deployed Test or Production release gates. Each test below defines its own commands and state, and a distinct execution record. If an earlier step already succeeded, record its evidence rather than rerunning any create-only operation. All `: 'Terminal ...'` annotations are safe to paste into **interactive zsh** (ordinary leading `#` comments are not).

**Terminals:** **A** = your macOS Terminal, repo root, zsh. **D** = specifically authorized Test deployment host, in its *Test* checkout, bash. **P** = specifically authorized Production deployment host, in its *Production* checkout, bash, only after separate approval. **Browser A/B** = separate normal browser sessions for distinct human administrators. Never paste passwords, reset tokens, private keys, 1Password secrets or raw databases into test records or ChatGPT.

**Execution record for each test:** actual UTC start/end, tester/real human identity and role, environment, application context, target non-secret IDs, commands/UI observations, non-secret evidence and audit references, PASS/FAIL/BLOCKED/N/A with reason, defect link, and state handed to the next test. Do not leave an applicable failed test recorded as N/A.

## IT-00 — Exact release identity, clean worktree, toolchain, and CI (LOCAL)

**Entry:** Terminal A in the repository root. No test-created processes, containers, or databases required; use your current feature-branch HEAD *after* applying and committing the patch. CI must relate to that exact commit. **Operator:** developer; **Context:** LOCAL repository (no ERS user session). No secret credentials needed.

**Actions — Terminal A:**

```zsh
: 'Terminal A (macOS/zsh, repository root) — IT-00 verify revision and tools'
git branch --show-current
git rev-parse HEAD
git status --short
git rev-parse HEAD^{tree}
command -v python3
command -v sqlite3
command -v go
command -v node
command -v docker
python3 --version
go version
```

**Expected:** branch exactly `998-bite-3368--integrated-regression-testing-recovery-rehearsal-and-final-acceptance`; record full HEAD SHA and tree SHA; clean `git status --short` (no rows); required tools available; Go 1.26.2. On macOS, Docker Desktop must be running for Docker-based LOCAL and deployment checks; no need to start Docker solely for IT-01. If Go is older, STOP and correct toolchain before running integrated regression. The ZIP baseline SHA is NOT your commit SHA after patch application.

**Actions — Terminal A:**

```zsh
: 'Terminal A (macOS/zsh, repository root) — IT-00 run integrated and canonical checks'
if make bite3368-integrated-check && make promotion-readiness-check && make local-check; then
  printf 'PASS: IT-00 integrated, promotion-readiness and local-check all completed\n'
else
  printf 'STOP: IT-00 regression failure; record and resolve before promotion\n' >&2
fi
```

**Mandatory post-check cleanup inspection — Terminal A, even if any test command failed:**

```zsh
: 'Terminal A (macOS/zsh, repository root) — IT-00 inspect test containers and ports'
docker ps -a --format '{{.ID}} {{.Names}}' | grep -E 'ers.*(recovery-rehearsal|3368)' || true
lsof -nP -iTCP:8080 -sTCP:LISTEN || true
```

**Expected:** no IT-00-created containers remain; if any are shown, record their exact IDs, determine whether they were created by this test, and stop/remove *only those containers* using Docker Desktop or `docker rm -f <confirmed-test-container-id>`. Do not stop unrelated containers. Port 8080 is unoccupied after test services stop, or its existing intentional LOCAL owner is documented. Confirm any failed command and cleanup anomalies as BLOCKED; do not continue on a partial PASS.

**Expected:** each exits `0`; new regression prints `PASS: Bite 33.6.8 isolated SQLite...` and `NOT VERIFIED` for deployed operations. Inspect GitHub Actions for the **exact recorded HEAD SHA** and record the CI URL and all passing job names. A successful prior SHA does not count. Record any unexecuted or failed check as BLOCKED; do not assert CI PASS without inspecting the workflow run. **Exit:** repository unchanged; validation evidence recorded; no enrollment attempted.

**Execution record — IT-00:** UTC start/end: ___ / ___; operator: ___; environment/context: LOCAL/no ERS account; HEAD/tree: ___ / ___; integrated result: ___; readiness result: ___; LOCAL result: ___; CI run/job evidence: ___; unexpected containers/processes: ___; verdict + defect: ___; next-state confirmation: ___.

## IT-01 — Isolated SQLite rehearsal, negative cases, and cleanup (LOCAL)

**Entry:** IT-00 passed, Terminal A at repository root. Test tools may run, but do not use any existing normal LOCAL or deployed DB. **Operator:** developer. **Context:** offline regression. **Secrets:** none. **Variables:** none carried from IT-00.

**Actions — Terminal A:**

```zsh
: 'Terminal A (macOS/zsh, repository root) — IT-01 fully isolated rehearsal'
python3 -B scripts/ers-bite3368-integrated-rehearsal.py
```

**Expected stdout:** `PASS: Bite 33.6.8 isolated SQLite backup, restore, migration and negative-case regression`; `PASS: 76 migrations, integrity ok, foreign keys clean, test directory removed` (count tracks committed repository migrations); a `NOT VERIFIED` line for server/S3/Docker/Go/human operations. The tool creates a private temporary SQLite database, applies actual SQL migrations, copies via SQLite's consistent backup API, restores it, re-applies migrations idempotently, checks audit guards and active administrator catalog, refuses absent/corrupt backup cases, and deletes test files in both PASS and FAIL paths. **No Production or normal LOCAL database is accessed.**

**Failure branch:** If a command exits nonzero, record FAIL and preserve stderr, but do not perform destructive cleanup on unrelated files. Do not proceed to deployed acceptance. **Exit:** no test DB or Docker container from this command; independent backend recovery remains unverified.

**Execution record — IT-01:** UTC start/end: ___ / ___; operator: ___; environment/context: isolated LOCAL/no ERS account; migration count: ___; backup/restore: ___; missing/corrupt negative cases: ___; cleanup: ___; stdout reference: ___; verdict/defect: ___; exit-state: ___.

## IT-02 — Two independent human administrators and existing regression preservation (LOCAL)

**Entry:** IT-01 PASS, **Terminal A** on the Mac, at the feature-branch repository root. **Operator:** developer. **Context:** LOCAL focused regression checks, **not** human enrollment. **Secrets:** none. No prior shell variables, deployed Test login, or Docker restart is required. **Go version requirement:** 1.26.2. These checks do not touch the deployed Test or Production databases.

**Step 1 — Run the four focused checks and capture their individual outcomes.** Paste this entire command box into **Terminal A (macOS interactive zsh)** from the repository root. It runs each existing `make` target, stops running further targets if any fails, and explicitly labels the subsequent targets `SKIPPED`. Each completed target receives its own private log and SHA-256 digest. The tool prints the current Git revision/tree, whether the working tree is clean, actual `go version`, four named results, and evidence references. It does **not** fabricate a result for a skipped target.

```zsh
: 'Terminal A (macOS/zsh, repository root) — IT-02 four focused checks and evidence'
python3 -B scripts/ers-bite3368-it02-evidence.py
```

**Expected:** output contains `IT-02 GO VERSION: go version go1.26.2 ...`, four lines `IT-02 RESULT 1/4` through `IT-02 RESULT 4/4`, each showing `PASS exit=0`, and four matching `IT-02 EVIDENCE REF` lines with a real log path and SHA-256 digest. The final lines show `IT-02 SUMMARY: PASS (4/4 passed)` and `IT-02 EVIDENCE INDEX: .../it02-evidence.json`. The underlying tests may print `OK`, `(cached)` and their original PASS messages; these are not the four named exit results. A missing/wrong Go version, any `FAIL`, or any `SKIPPED` result means **IT-02 BLOCKED/FAIL**; do not proceed to IT-03. Do not mark the test PASS merely because earlier versions of the combined command printed one final PASS line.

**Step 2 — Record evidence without exposing secrets.** Copy the printed `IT-02 EVIDENCE INDEX` absolute path, its Git SHA/tree, Go version, and four `RESULT`/`EVIDENCE REF` values into the IT-02 execution record below. The index is a JSON inventory of the actual exit codes and the four local log file references; it is **not** a GitHub CI run or a deployed recovery record. Logs are saved under `~/ers-bite3368-acceptance/<revision>/IT-02-.../`, **outside the Git repository**, with private permissions. Review logs for accidental sensitive output before sharing them; never commit logs, passwords, or credentials. If the tool reports `IT-02 WORKTREE: MODIFIED`, the run is valid pre-commit feedback but **not final-SHA evidence**; rerun IT-02 after committing, before final acceptance. The exact GitHub Actions CI run URL belongs to **IT-00**; reference that accepted IT-00 record instead of inventing a CI URL here.

**Expected:** four identifiable target results and four authentic evidence references, all traceable to the printed Git revision. **Exit state:** no Test/Production database change, no administrator enrollment, no Docker container created by this IT-02 runner. Preserve any failing logs for diagnosis.

**Execution record — IT-02:** UTC start/end (from evidence index): ___ / ___; operator: ___; context: LOCAL regressions; exact HEAD/tree: ___ / ___; Go version: ___; worktree CLEAN/MODIFIED: ___; `two-human-administrators-check` result/exit/log ref: ___; `production-bootstrap-reconciliation-check` result/exit/log ref: ___; `onepassword-deployment-preflight-check` result/exit/log ref: ___; `production-credential-cutover-check` result/exit/log ref: ___; `it02-evidence.json` ref: ___; IT-00 CI evidence ref: ___; verdict/defect: ___; next-state: ___.

## IT-03 — Actual off-host Test recovery rehearsal with RPO/RTO (DEPLOYED TEST ONLY)

**What is being tested and where (read before running):** There are **three different databases/workspaces**, and they must not be confused:

| State | Database/location | May this test replace it? | Purpose |
|---|---|---|---|
| IT-01, LOCAL | Temporary SQLite database created and removed by `ers-bite3368-integrated-rehearsal.py` | Yes: test-created and disposable | Regression simulation only; no real Test users |
| IT-03, Test recovery rehearsal | Private `.../test/recovery/rehearsals/rehearsal-*/` restore/boot workspace created by the recovery script | Yes: the script creates and tears down its *own* isolated recovery resources | Prove actual Test off-host backup restores and boots within RPO/RTO |
| IT-04, deployed Test | **Persistent** Docker volume `ers-tst_backend-data`, mounted at `/app/data/app.db` by `ers-tst-backend` | **NO** as part of IT-03; **no reset** in IT-04 | Test application and the two Test human administrator accounts |

The deployed **Test** environment is distinct from Production, but it is **not** an arbitrary disposable database. Its data can be deliberately restored from a deterministic baseline by the approved Test *deployment* workflow; such deployment can remove previously enrolled Test humans. IT-03 never performs that reset. IT-04 separately checks the Test accounts **after the last Test deployment**. Do not copy the LOCAL database, or enroll humans into an IT-03 isolated restore (their accounts would not become deployed Test accounts).

**Entry:** IT-00–IT-02 PASS, approved and completed deployment to `test`; Test backend remains running; Test users have been warned about the rehearsal if required by the change; no Test recovery/migration gate is armed. **Operator:** named, authorized Test operator. **Context:** Test server checkout and `ENV=test`, never Production. **Terminal D:** bash on the Test host, in the repository used for Test deployment. **Credentials:** approved Test off-host read authority via the existing environment configuration; never place credentials in commands/evidence. **Variables:** none inherited from prior tests. **STOP** if the deployed revision/tree or Test receipt cannot be verified.

### Step 1 — Establish a verified Test off-host backup (Terminal D; REQUIRED before restore)

**Why this preparation is necessary:** `IT-01` tested a disposable LOCAL SQLite file; it did not create a deployed Test backup. The Test release pipeline can restore a deterministic baseline, but that is **not** an off-host backup of the currently deployed Test database. Development and Test default to `SERVER_OFFHOST_BACKUP_ENABLED=false`, so an ordinary Test deployment may leave **no** `.offhost.json` receipt at all. This is an expected initial **BLOCKED** state, not evidence that an off-host restore was attempted. IT-03 must establish off-host evidence *before* any recovery rehearsal.

The path below deliberately separates **inventory**, **approved configuration**, **backup creation**, and **remote verification**. An approved Test recovery source may be an existing verified receipt or a freshly generated, independently verified Test receipt. If none exists, **do not use Production storage, fabricate receipts, change database volumes, reset Test, or start a local-only restore to make the test pass**.

#### Step 1A — Confirm Test identity and find existing receipts (read-only)

In **Terminal D (Linux/bash)**, in `/opt/EnterpriseRemoteSystems/test`, paste this whole command box. Do not use Terminal A on the Mac.

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-03 Step 1A'
unset TEST_RECEIPT TEST_RECEIPT_VERIFIED TEST_RECEIPT_CHOICE
export TEST_BACKUP_DIR=/opt/EnterpriseRemoteSystems/test/backups
printf 'IT-03 UTC start: '; date -u '+%Y-%m-%dT%H:%M:%SZ'
printf 'Checkout: '; pwd -P
printf 'Branch: '; git branch --show-current
printf 'Release revision/tree:\n'
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
if [[ "$(pwd -P)" != /opt/EnterpriseRemoteSystems/test || "$(git branch --show-current)" != test ]]; then
  printf 'BLOCKED: this is not the deployed Test checkout; do not run backup commands here\n' >&2
elif ! make server-ps ENV=test || ! make server-backend-health ENV=test; then
  printf 'BLOCKED: Test service identity or health could not be confirmed\n' >&2
else
  TEST_RECEIPT_CANDIDATES=()
  if [[ -d "$TEST_BACKUP_DIR" ]]; then
    # Bash 3.2-compatible receipt inventory: glob sorts timestamped names in ascending order.
    # Prepend each regular, non-symlink file so the newest named receipt is listed first.
    for TEST_CANDIDATE in "$TEST_BACKUP_DIR"/app-*.db.offhost.json; do
      if [[ -f "$TEST_CANDIDATE" && ! -L "$TEST_CANDIDATE" ]]; then
        TEST_RECEIPT_CANDIDATES=("$TEST_CANDIDATE" "${TEST_RECEIPT_CANDIDATES[@]}")
      fi
    done
  else
    printf 'No Test backups directory yet; an authorized first backup will create it\n'
  fi
  printf 'Managed Test off-host receipts found: %d\n' "${#TEST_RECEIPT_CANDIDATES[@]}"
  for (( i=0; i<${#TEST_RECEIPT_CANDIDATES[@]}; i++ )); do
    printf '  %d) %s\n' "$((i+1))" "${TEST_RECEIPT_CANDIDATES[i]}"
  done
fi
```

**Execution portability:** Commands on the deployed Test server run under Linux Bash. The LOCAL regression harness also executes these shell blocks under the installed macOS Bash (often version 3.2); receipt discovery therefore avoids Linux-only `sort -z` and Bash 4-only `mapfile`. The test harness resolves temporary checkout paths to their physical location (macOS can alias `/var` to `/private/var`).

**Expected:** Test branch, the authorized deployed Test revision/tree and healthy `ers-tst-backend`. Either receipt candidates are listed or `Managed Test off-host receipts found: 0`. The backup directory may legitimately be absent before the first backup. Verify the printed revision/tree against the release approved for this test. **STOP** for a wrong checkout or unhealthy backend. If a suitable receipt exists, **skip Steps 1B and 1C** and continue to Step 1D; otherwise proceed to Step 1B. No backup or restore occurs in Step 1A.

#### Step 1B — Establish approved Test-only off-host configuration (only when no receipt exists)

**Operator and approval gate:** A named Test operator must obtain approval to create a verified backup of the currently deployed Test database and replicate it to the approved, access-controlled **Test-only** remote backup destination. Record the approval reference, Test S3 bucket/prefix, authorized credential custody reference, and expected recovery point (non-secret details only). **If any are missing, record `IT-03 BLOCKED — off-host Test backup destination/authorization missing` and stop.** Do not use Production credentials or alter Production storage.

In the same **Terminal D** shell, check the deployed Test off-host status. This command reads the existing Test configuration via the compiled server utility; it does not print credentials or make backups.

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-03 Step 1B status'
if [[ "$(pwd -P)" == /opt/EnterpriseRemoteSystems/test && "$(git branch --show-current)" == test ]]; then
  ERS_BACKUP_ENV_DIR=/opt/EnterpriseRemoteSystems/test \
  ERS_BACKUP_ENV_FILE=.env.test \
  ERS_BACKUP_COMPOSE_PROJECT=ers-tst \
    ./scripts/run-backup-go-tool.sh ers-offhost-backup status \
    --environment test --env-file /opt/EnterpriseRemoteSystems/test/.env.test
else
  printf 'BLOCKED: Test checkout identity mismatch\n' >&2
fi
```

**Expected:** Exactly `enabled` or `disabled` from the utility (a preceding Docker Compose command line may also appear). On error, record `BLOCKED` and investigate the non-secret diagnostic. `disabled` means **do not run Step 1C yet**: the default Test configuration cannot create an acceptable remote receipt.

If disabled, an **authorized Test operator** must configure the Test environment file `/opt/EnterpriseRemoteSystems/test/.env.test` using an approved private, versioned Test backup destination and credentials already provisioned through the organization's secret-management process. Required Test S3 keys are shown below; the values must be the **actual approved Test values**, not examples copied from Production:

```text
SERVER_OFFHOST_BACKUP_ENABLED=true
SERVER_OFFHOST_BACKUP_TRANSPORT=s3
SERVER_OFFHOST_BACKUP_S3_ENDPOINT=<approved Test HTTPS endpoint>
SERVER_OFFHOST_BACKUP_S3_REGION=<approved Test region>
SERVER_OFFHOST_BACKUP_S3_BUCKET=<approved Test bucket>
SERVER_OFFHOST_BACKUP_S3_PREFIX=<approved Test-only object prefix>
AWS_SHARED_CREDENTIALS_FILE=<absolute path to approved Test credentials file outside Git>
AWS_PROFILE=<approved Test credentials profile>
```

The endpoint, bucket, and prefix identify storage; the actual secret key belongs **only** in the protected credentials file, not `.env.test`, terminal output, test evidence, Git, or chat. The Test bucket must support exact-version recovery, and the Test credentials must have the necessary scoped permissions. Use the approved host configuration/credential installation procedure; if the destination, access control, or credentials have not been provisioned, leave IT-03 **BLOCKED** instead of improvising storage. A configuration edit is an **authorized Test operational change**, not a repository patch; preserve any previous configuration through the approved secret-safe change-control mechanism. No backend or volume reset is required merely to enable this backup utility.

After authorized configuration exists (or if the first status already said `enabled`), check the real runtime configuration and credential-file availability:

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-03 Step 1B validate configuration'
if [[ "$(pwd -P)" == /opt/EnterpriseRemoteSystems/test && "$(git branch --show-current)" == test ]]; then
  ERS_BACKUP_ENV_DIR=/opt/EnterpriseRemoteSystems/test \
  ERS_BACKUP_ENV_FILE=.env.test \
  ERS_BACKUP_COMPOSE_PROJECT=ers-tst \
    ./scripts/run-backup-go-tool.sh ers-offhost-backup check-config \
    --environment test --env-file /opt/EnterpriseRemoteSystems/test/.env.test --runtime-files
else
  printf 'BLOCKED: Test checkout identity mismatch\n' >&2
fi
```

**Expected:** `Off-host backup configuration valid for test: enabled`. `disabled`, unavailable files, unavailable Docker, or any nonzero result means **BLOCKED**. Successful configuration validation is not yet proof that a remote copy exists.

#### Step 1C — Create a verified on-host Test backup and its off-host replica (only when no receipt exists)

**This is an intentional write to Test backup storage and the approved remote Test destination.** It uses SQLite's consistent online backup API and does **not** replace the deployed database or stop its containers. The existing `server-backup` target also applies the configured **local backup retention policy**, so obtain the required authorization before executing it. Preserve all evidence required by retention and previous rehearsals. Do not execute repeatedly after a failure without investigating what was already created.

With Test backup approval recorded, a healthy deployed Test backend, and Step 1B showing `enabled`, execute in **Terminal D**. The command independently rechecks the off-host status and asks for the actual non-secret approval reference **before** creating any backup:

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-03 Step 1C create Test off-host backup'
if [[ "$(pwd -P)" != /opt/EnterpriseRemoteSystems/test || "$(git branch --show-current)" != test ]]; then
  printf 'BLOCKED: cannot create a backup from a non-Test checkout\n' >&2
elif ! make server-ps ENV=test || ! make server-backend-health ENV=test; then
  printf 'BLOCKED: Test backend not healthy; do not attempt backup\n' >&2
else
  if ! TEST_OFFHOST_STATUS="$(
    ERS_BACKUP_ENV_DIR=/opt/EnterpriseRemoteSystems/test \
    ERS_BACKUP_ENV_FILE=.env.test \
    ERS_BACKUP_COMPOSE_PROJECT=ers-tst \
      ./scripts/run-backup-go-tool.sh ers-offhost-backup status \
      --environment test --env-file /opt/EnterpriseRemoteSystems/test/.env.test
  )"; then
    printf 'BLOCKED: Test off-host status probe failed; do not start a backup\n' >&2
  elif [[ "$TEST_OFFHOST_STATUS" != enabled ]]; then
    printf 'BLOCKED: Test off-host backup status is not enabled; return to Step 1B\n' >&2
  else
    printf 'Enter the authorized Test backup change/approval reference (empty to stop): '
    IFS= read -r TEST_BACKUP_APPROVAL
    if [[ -z "${TEST_BACKUP_APPROVAL//[[:space:]]/}" ]]; then
      printf 'BLOCKED: no Test backup authorization reference supplied; no backup started\n' >&2
    elif make server-backup ENV=test; then
      printf 'PASS: Test backup command completed under approval %s; independently verify its off-host receipt in Step 1D\n' "$TEST_BACKUP_APPROVAL"
    else
      printf 'BLOCKED: backup/replication failed; preserve output and inspect local backups before any retry\n' >&2
    fi
  fi
fi
```

**Expected:** `Verified backup: .../test/backups/app-...db`, a manifest path, and successful off-host replication/verification and receipt creation. Do **not** regard a message such as `Off-host backup is disabled for test; verified local backup retained` as PASS: it is **BLOCKED** for IT-03 even if `make server-backup` exits zero. If no receipt appears afterward, remain BLOCKED and inspect the off-host configuration and backup output. A local `.db` alone never satisfies IT-03.

#### Step 1D — Select and independently verify an existing or newly created remote receipt

In **Terminal D**, after Step 1A found a suitable receipt **or** Step 1C completed successfully, run this block. Type the printed receipt number (e.g. `1`) corresponding to the authorized Test recovery point; enter `0` to stop. Do not type a filename, password, or secret. A new backup must have an actual receipt on disk to be selectable.

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-03 Step 1D'
unset TEST_RECEIPT TEST_RECEIPT_VERIFIED TEST_RECEIPT_CHOICE
export TEST_BACKUP_DIR=/opt/EnterpriseRemoteSystems/test/backups
if [[ "$(pwd -P)" != /opt/EnterpriseRemoteSystems/test || "$(git branch --show-current)" != test ]]; then
  printf 'BLOCKED: not the deployed Test checkout\n' >&2
elif [[ ! -d "$TEST_BACKUP_DIR" ]]; then
  printf 'BLOCKED: managed Test backup directory missing\n' >&2
else
  TEST_RECEIPT_CANDIDATES=()
  # Use portable Bash globbing rather than GNU sort -z or Bash 4's mapfile.
  for TEST_CANDIDATE in "$TEST_BACKUP_DIR"/app-*.db.offhost.json; do
    if [[ -f "$TEST_CANDIDATE" && ! -L "$TEST_CANDIDATE" ]]; then
      TEST_RECEIPT_CANDIDATES=("$TEST_CANDIDATE" "${TEST_RECEIPT_CANDIDATES[@]}")
    fi
  done
  if (( ${#TEST_RECEIPT_CANDIDATES[@]} == 0 )); then
    printf 'BLOCKED: no Test .offhost.json receipts found in %s; return to Step 1B\n' "$TEST_BACKUP_DIR" >&2
  else
    printf 'Available Test receipt candidates (newest filename first):\n'
    for (( i=0; i<${#TEST_RECEIPT_CANDIDATES[@]}; i++ )); do
      printf '  %d) %s\n' "$((i+1))" "${TEST_RECEIPT_CANDIDATES[i]}"
    done
    printf 'Type the receipt number corresponding to the approved Test recovery point (0 to stop), then press Enter: '
    IFS= read -r TEST_RECEIPT_CHOICE
    if [[ "$TEST_RECEIPT_CHOICE" =~ ^[1-9][0-9]*$ ]] && (( TEST_RECEIPT_CHOICE <= ${#TEST_RECEIPT_CANDIDATES[@]} )); then
      TEST_RECEIPT="${TEST_RECEIPT_CANDIDATES[TEST_RECEIPT_CHOICE-1]}"
      if make server-offhost-backup-verify ENV=test BACKUP_FILE="${TEST_RECEIPT%.offhost.json}"; then
        export TEST_RECEIPT TEST_RECEIPT_VERIFIED=1
        printf 'PASS: verified Test off-host receipt: %s\n' "$(basename "$TEST_RECEIPT")"
      else
        unset TEST_RECEIPT TEST_RECEIPT_VERIFIED
        printf 'BLOCKED: remote Test replica verification failed; preserve output and investigate\n' >&2
      fi
    else
      printf 'BLOCKED: no valid receipt number selected; no recovery was started\n' >&2
    fi
  fi
fi
```

**PASS for Step 1:** Only after `PASS: verified Test off-host receipt: ...` from Step 1D, and after confirming the remote receipt's recovery point is within the approved RPO budget. Record the approval reference, actual backup timestamp, remote transport/destination identification (non-secret), exact-version verification evidence, and any newly created local backup/manifest paths. The `TEST_RECEIPT` and `TEST_RECEIPT_VERIFIED=1` variables must remain set **in the same Terminal D shell** for Step 2. **BLOCKED:** missing approval, disabled Test off-host protection, missing remote credential files, local-only backup, absent receipt, failed remote verification, or mismatched Test release. Do not start Step 2 while BLOCKED.

### Step 2 — Rehearse an off-host restore into the *isolated* Test recovery workspace (Terminal D)

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-03 Step 2'
if [[ "${TEST_RECEIPT_VERIFIED:-}" == 1 && -n "${TEST_RECEIPT:-}" && -f "$TEST_RECEIPT" ]]; then
  make server-recovery-rehearsal ENV=test RECOVERY_REHEARSAL_RECEIPT_FILE="$TEST_RECEIPT"
else
  printf 'STOP: Step 1 did not establish a verified Test receipt\n' >&2
fi
```

**Expected:** Exit status `0`, `Recovery rehearsal passed.`, an `Evidence:` report path, actual off-host source, isolated restored-backend health, and objective checks `RPO <= 86400 seconds` and `RTO <= 14400 seconds`. If a step fails, record BLOCKED and preserve its non-secret error/report. **Do not** invoke `server-restore-apply`, `server-test-rehearsal-restore`, `server-test-down`, or any database reset here. The live Test database must be unchanged.

### Step 3 — Inspect evidence and verify the live Test service remains available (Terminal D)

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-03 Step 3'
printf 'Paste the absolute Evidence: report path from Step 2: '
IFS= read -r TEST_REPORT
if [[ -f "$TEST_REPORT" ]] && jq -e '.status == "passed" and .environment == "test" and .objectives.rpo_met == true and .objectives.rto_met == true and .recovery.isolated_backend_health == "passed" and .recovery.post_boot_integrity_check == "ok" and .recovery.post_boot_foreign_key_check == "clean"' "$TEST_REPORT" >/dev/null; then
  printf 'PASS: Test off-host rehearsal, isolated boot and objectives\n'
  sha256sum "$TEST_REPORT"
else
  printf 'STOP: report missing or failed one or more required checks\n' >&2
fi
make server-ps ENV=test
make server-backend-health ENV=test
docker ps -a --format '{{.ID}} {{.Names}}' | grep -E 'ers.*(recovery-rehearsal|3368)' || true
date -u '+IT-03 UTC end: %Y-%m-%dT%H:%M:%SZ'
```

**Expected:** `PASS` and a 64-digit SHA-256 digest, with the original `ers-tst-backend` still running/healthy; no rehearsal-created containers remain. Record the actual RPO/RTO seconds from the report, not just the booleans. Inspect `docker ps -a --format '{{.ID}} {{.Names}}'` for only *this run's* recovery-rehearsal containers; if any remain, identify and investigate them without touching unrelated containers. Store the non-secret report only in approved restricted Test evidence. **Exit state:** original Test backend/data continue unchanged, rehearsal artifacts/evidence retained as required, IT-04 may start. **PASS:** all checks plus cleanup verified. **BLOCKED:** failed restore, objectives, health, receipt, mismatched release, or unclear cleanup.

**Execution record — IT-03:** UTC start/end: ___/___; authorized operator: ___; backup approval/configuration/destination evidence: ___; backup creation result and local retention impact: ___; environment/URL: Test/___; Test revision/tree: ___/___; managed receipt basename and independent verification/object-version ref: ___; report path/hash: ___/___; RPO seconds/limit: ___/86400; RTO seconds/limit: ___/14400; isolated backend integrity/health: ___; original live Test backend remained running: ___; container cleanup: ___; PASS/FAIL/BLOCKED with evidence/defect: ___; next-state: ___.

## IT-04 — Deployed Test human administrator enrollment (if needed), independent logins, mutual recovery, and audit (UI FIRST AFTER ENROLLMENT)

**Why this is different from IT-01 and IT-03:** This test verifies **actual human accounts on the deployed Test application**, not on a disposable LOCAL file or isolated restore. The two approved Test humans, if absent, must be enrolled **once** into the persistent Test database volume `ers-tst_backend-data` during an authorized Test maintenance window. Accounts enrolled into this Test volume can disappear if the separately approved deployment pipeline later restores the deterministic Test baseline. **Do not automatically rerun enrollment:** recheck the deployed database state after each such deployment.

**Entry:** IT-03 PASS; deployed Test is healthy; its latest deployment SHA/tree and Test URL recorded; two named, distinct real human administrators A and B have agreed to participate; an approved **Test-only** change/maintenance window and operator are available if enrollment is required. **Environment:** TEST only, GLOBAL Administration (no Tenant actor). **Terminal D:** Test Linux host/bash and repository root for offline steps. **Browser A/B:** separate profiles for the *two different people*. **Passwords:** supplied interactively and privately, never as flags, environment variables, screenshots, log files, or chat text. **Do not presume** either human already exists. The operator must select either Path E (both already enrolled) or Path N (neither enrolled). A partial/mismatched state is BLOCKED, never an automatic repair.

### Step 1 — Identify release, Test image/volume and prospective humans (Terminal D)

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-04 Step 1'
date -u '+IT-04 UTC start: %Y-%m-%dT%H:%M:%SZ'
printf 'Test checkout: '; pwd
printf 'Test revision: '; git rev-parse HEAD
printf 'Test tree: '; git rev-parse 'HEAD^{tree}'
make server-ps ENV=test
export TEST_VOLUME='ers-tst_backend-data'
export TEST_IMAGE="$(docker inspect ers-tst-backend --format '{{.Image}}')"
docker volume inspect "$TEST_VOLUME" --format 'Test volume: {{.Name}}'
docker image inspect "$TEST_IMAGE" --format 'Backend image: {{.Id}}'
printf 'Enter Human A approved TEST login: '; IFS= read -r TEST_LOGIN_A
printf 'Enter Human A approved TEST actor key: '; IFS= read -r TEST_ACTOR_A
printf 'Enter Human B approved TEST login: '; IFS= read -r TEST_LOGIN_B
printf 'Enter Human B approved TEST actor key: '; IFS= read -r TEST_ACTOR_B
export TEST_LOGIN_A TEST_ACTOR_A TEST_LOGIN_B TEST_ACTOR_B
if [[ -n "$TEST_LOGIN_A" && -n "$TEST_LOGIN_B" && -n "$TEST_ACTOR_A" && -n "$TEST_ACTOR_B" && "$TEST_LOGIN_A" != "$TEST_LOGIN_B" && "$TEST_ACTOR_A" != "$TEST_ACTOR_B" ]]; then
  printf 'PASS: two distinct proposed Test human identifiers recorded\n'
else
  printf 'STOP: missing or identical Test human identifiers\n' >&2
fi
```

**Expected:** deployed Test container `ers-tst-backend` running, the exact approved Test release/tree, `ers-tst_backend-data` volume, backend image ID, and `PASS: two distinct...`. Human A and B logins/keys are **Test-only** and already approved, not invented example identities. If the live deployment is unexpectedly unavailable, stop; do not initialize a new database or use Production. This command does not enroll anyone.

### Step 2 — Create and verify a consistent *inspection/rollback* backup while Test is running (Terminal D)

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-04 Step 2'
make server-backup ENV=test
printf 'Enter the absolute path of the NEW Test backup printed by the backup command: '
IFS= read -r TEST_BACKUP
if [[ "$TEST_BACKUP" == /opt/EnterpriseRemoteSystems/test/backups/app-*.db && -f "$TEST_BACKUP" && -f "$TEST_BACKUP.manifest.json" ]]; then
  make server-backup-verify ENV=test BACKUP_FILE="$TEST_BACKUP"
else
  printf 'STOP: exact managed Test backup and manifest not identified\n' >&2
fi
```

**Expected:** actual new `app-*.db` backup and matching manifest; `make server-backup-verify` exits zero. Store the full backup path in **Terminal D's session only** and in restricted Test operational evidence. The backup is a **snapshot of the running Test database**, not the disposable LOCAL rehearsal database. If the backup cannot be independently verified, STOP; do not stop Test or enroll anyone. Retain the backup as the maintenance rollback point; no automatic restore is authorized by this test.

### Step 3 — Determine actual Test enrollment state from the read-only backup (Terminal D)

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-04 Step 3'
python3 - "$TEST_BACKUP" "$TEST_LOGIN_A" "$TEST_ACTOR_A" "$TEST_LOGIN_B" "$TEST_ACTOR_B" <<'PY'
import sqlite3, sys
from pathlib import Path
from urllib.parse import quote
path, login_a, actor_a, login_b, actor_b = sys.argv[1:]
if not Path(path).is_file():
    raise SystemExit('STOP: Test backup missing')
uri = 'file:' + quote(str(Path(path).resolve()), safe='/') + '?mode=ro'
con = sqlite3.connect(uri, uri=True)
try:
    def count(table, col, val):
        return con.execute(f'SELECT COUNT(*) FROM {table} WHERE {col}=? COLLATE NOCASE', (val,)).fetchone()[0]
    counts = [count('auth_user_accounts', 'login', login_a), count('authz_actors', 'actor_key', actor_a),
              count('auth_user_accounts', 'login', login_b), count('authz_actors', 'actor_key', actor_b)]
    print('Test identity counts [A login, A actor, B login, B actor]:', *counts)
    if counts == [0, 0, 0, 0]:
        print('PATH N: neither Test human exists; guarded enrollment may be authorized')
    elif counts == [1, 1, 1, 1]:
        pairs = []
        for key in (actor_a, actor_b):
            pairs.append(con.execute('SELECT u.login FROM authz_actors a JOIN auth_account_actors aa ON aa.actor_id=a.id JOIN auth_user_accounts u ON u.id=aa.account_id WHERE a.actor_key=? COLLATE NOCASE AND aa.scope_type=?', (key, 'GLOBAL')).fetchall())
        if len(pairs[0]) == len(pairs[1]) == 1 and pairs[0][0][0].lower() == login_a.lower() and pairs[1][0][0].lower() == login_b.lower():
            print('PATH E: both Test human keys map to their expected distinct logins; verify grants next')
        else:
            raise SystemExit('STOP: account/actor association mismatch; do not enroll')
    else:
        raise SystemExit('STOP: partial or colliding Test identity state; do not enroll')
finally:
    con.close()
PY
```

**Expected exactly one path:** **PATH E** (both existing identities) or **PATH N** (all four absent). Any `STOP`, database error, or nonzero command is BLOCKED. Do not use a partial match to infer completion. The contents of the backup are sensitive: do not share or commit it. The counting script performs read-only inspection and does **not** modify Test.

**PATH E:** Run the repository status checker on this same Test backup before proceeding. It must report `"ready": true`, two distinct usable GLOBAL accounts with the approved logins/keys. If not, STOP. If ready, **skip Steps 4–7** and proceed directly to Step 8. The two humans may already have changed their initial passwords; `mustChangePassword` need not still be true.

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-04 Path E'
python3 -B scripts/ers-two-human-admin-status.py --db "$TEST_BACKUP" \
  --actor-key "$TEST_ACTOR_A" --actor-key "$TEST_ACTOR_B"
```

**PATH N:** Steps 4–7 are *mandatory* and must occur only after named Test change approval. **No Test enrollment is permitted without approval or if another process is writing the database.**

### Step 4 — PATH N only: capture approval and verify the offline maintenance boundary (Terminal D)

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-04 Step 4, PATH N ONLY'
printf 'Enter approved Test change reference (non-secret): '; IFS= read -r TEST_APPROVAL_REF
printf 'Enter named Test operator reference (non-secret): '; IFS= read -r TEST_OPERATOR_REF
printf 'Enter verified Test backup/off-host evidence reference (non-secret): '; IFS= read -r TEST_BACKUP_REF
export TEST_APPROVAL_REF TEST_OPERATOR_REF TEST_BACKUP_REF
if [[ -n "$TEST_APPROVAL_REF" && -n "$TEST_OPERATOR_REF" && -n "$TEST_BACKUP_REF" ]]; then
  printf 'PASS: Test change, operator and backup evidence references provided\n'
else
  printf 'STOP: Test enrollment is not authorized without all three references\n' >&2
fi
```

**Before stopping Test:** Independently check that the recorded approval authorizes **enrollment of two Test human GLOBAL Application Administrators**, the maintenance window is active, the backup is verified, off-host protections and restore evidence are available, the Test migration gate is not armed, and users know the Test UI will be unavailable. The command checks nonempty references **only**; it cannot verify their legitimacy. Missing evidence = BLOCKED. Record the image and volume from Step 1. Do not change Production or issue reset tokens here.

### Step 5 — PATH N only: stop Test database writers without deleting volumes (Terminal D)

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-04 Step 5, PATH N ONLY'
make server-test-down
printf 'Expected no Test backend container and no containers using Test DB volume:\n'
docker ps --format '{{.Names}}' | grep -x 'ers-tst-backend' || true
docker ps --filter "volume=$TEST_VOLUME" --format '{{.ID}} {{.Names}}'
```

**Expected:** `make server-test-down` exits `0`; both inspection queries return **no rows**. If any process/container still accesses the Test volume, STOP and investigate. `server-test-down` does **not** remove the persistent Test volume. Never run `server-test-down-volumes`, `docker volume rm`, or Test baseline restore to perform enrollment. **Exit:** authorized Test downtime, backed-up persistent Test database with all writers stopped.

### Step 6 — PATH N only: invoke create-only enrollment **exactly once** (Terminal D)

Before entering this command, verify that **Steps 1–5 all passed**, the authorized A/B humans are ready to privately enter distinct temporary passwords, and `/app/enroll-human-admins` exists in the exact image recorded in Step 1. At the input helper's **Actor key** and **Login** prompts enter the *exact* `TEST_ACTOR_A`, `TEST_LOGIN_A`, `TEST_ACTOR_B`, and `TEST_LOGIN_B` from Step 1; enter approved human display names and distinct private temporary passwords. Do not substitute different identifiers. Do not run if there has been any partial enrollment, unexpected container, or uncertain database state. **Never retry automatically** if the result is ambiguous.

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-04 Step 6, PATH N ONLY'
if [[ -n "${TEST_APPROVAL_REF:-}" && -n "${TEST_OPERATOR_REF:-}" && -n "${TEST_BACKUP_REF:-}" && -n "${TEST_IMAGE:-}" && "${TEST_VOLUME:-}" == 'ers-tst_backend-data' ]]; then
  ( set -euo pipefail
    python3 scripts/ers-two-human-admin-input.py | docker run \
      --name "ers-3368-test-enroll-$$" --rm -i --network none \
      --mount "type=volume,src=${TEST_VOLUME},dst=/app/data" \
      --env APP_ENV=test --entrypoint /app/enroll-human-admins "$TEST_IMAGE" \
      --db /app/data/app.db --environment test --offline-confirmed \
      --approval-reference "$TEST_APPROVAL_REF" \
      --operator-reference "$TEST_OPERATOR_REF" \
      --backup-evidence-reference "$TEST_BACKUP_REF"
  )
else
  printf 'STOP: required Test enrollment evidence, image or volume absent\n' >&2
fi
```

**Expected on success:** **exactly two** `enrolled login=... actor_key=... account_id=... actor_id=... must_change_password=true` lines for the two approved Test humans. Passwords must not appear in stdout, logs, evidence or shell history. Confirm the named Test enrollment container has been removed with `docker ps -a --filter 'name=ers-3368-test-enroll-'`. If enrollment fails, **do not rerun the command**: retain the Test backup and the stopped-writer state, record error, investigate with authorized read-only tools, and mark BLOCKED. No E2E provisioner or bootstrap bypass may be used. This is the *only* create operation in IT-04.

### Step 7 — PATH N only: verify canonical grants from a private offline snapshot (Terminal D)

This verification runs while the Test backend is still stopped. It creates a **temporary inspection copy** from the deployed Test volume; it does not point the Test application at that copy. It must print `"ready": true` for A and B before Test is restarted. For this new enrollment both `mustChangePassword` values must be `true`. A second failed status check is not permission to rerun enrollment.

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-04 Step 7, PATH N ONLY'
( set -euo pipefail
  STATUS_DIR="$(mktemp -d /tmp/ers-3368-test-status.XXXXXXXX)"
  chmod 700 "$STATUS_DIR"
  trap 'rm -f "$STATUS_DIR/app.db"; rmdir "$STATUS_DIR"' EXIT
  docker run --rm --network none \
    --mount "type=volume,src=${TEST_VOLUME},dst=/app/data,readonly" \
    --mount "type=bind,src=${STATUS_DIR},dst=/out" \
    --env "HOST_UID=$(id -u)" --env "HOST_GID=$(id -g)" \
    --entrypoint /bin/sh "$TEST_IMAGE" -ec \
      'umask 077; sqlite3 /app/data/app.db ".backup /out/app.db"; chown "$HOST_UID:$HOST_GID" /out/app.db'
  STATUS_JSON="$(python3 -B scripts/ers-two-human-admin-status.py --db "$STATUS_DIR/app.db" \
    --actor-key "$TEST_ACTOR_A" --actor-key "$TEST_ACTOR_B")"
  printf '%s\n' "$STATUS_JSON"
  printf '%s\n' "$STATUS_JSON" | jq -e \
    --arg a "$TEST_LOGIN_A" --arg b "$TEST_LOGIN_B" \
    '.ready == true and (.administrators | length == 2) and
     .administrators[0].usable == true and .administrators[1].usable == true and
     .administrators[0].mustChangePassword == true and .administrators[1].mustChangePassword == true and
     .administrators[0].login == ($a | ascii_downcase) and
     .administrators[1].login == ($b | ascii_downcase) and
     .administrators[0].accountId != .administrators[1].accountId and
     .administrators[0].actorId != .administrators[1].actorId' >/dev/null
  printf 'PASS: two new Test GLOBAL human administrators with intended logins and distinct identities\n'
)
```

**Expected:** `"ready": true`, two independent usable account IDs/actor IDs, distinct Test logins, `mustChangePassword: true` for each before first login, and no security-suspended account. Verify and record the two `authentication.human_admins.offline_enroll` audit records using authorized non-secret audit inspection if applicable. The snapshot is automatically removed even if status verification fails; store no database copies or passwords in evidence. If any check fails, STOP: do not claim accepted enrollment. Verify Docker has no leftover `ers-3368-test-enroll-*` or `ers-3368-test-status-*` test containers; do not delete any unrelated container.

### Step 8 — Return to Test service and execute human-facing acceptance (Terminal D, Browsers A/B)

For **PATH N**, only after Step 7 PASS, restart Test and confirm health:

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-04 Step 8 PATH N restart'
make server-test-up
make server-ps ENV=test
make server-backend-health ENV=test
```

**Expected:** `ers-tst-backend` running/healthy and normal Test frontend available over its approved HTTPS origin. **PATH E** must *not* stop/restart a healthy Test environment; instead confirm its existing backend remains healthy with the same commands' read-only `server-ps` and health checks:

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-04 Step 8 PATH E health only'
make server-ps ENV=test
make server-backend-health ENV=test
```

Now the two **actual human operators** execute the following UI steps in order, using separate browser profiles and never sharing credentials:

1. **Human A, Browser A, Test HTTPS URL:** Sign in with A's own Test login. If this is the first login, complete the required **Change password** screen with an A-only private password; sign in again if instructed. Confirm **Global administration** context and open **Administration → Authentication Accounts**. Record only A's login and non-secret Account/Actor IDs. **PASS** only if A can independently access GLOBAL Administration (not as a Tenant Actor).
2. **Human B, Browser B, same Test HTTPS URL:** Independently sign in with B's different Test login. If first login, complete **Change password** with B-only password. Confirm **Global administration** and open **Administration → Authentication Accounts**. Confirm B's Account ID and Actor ID differ from A's. **PASS** only if neither profile borrows the other's cookies or credentials.
3. **A recovers B:** Ensure B has an active authenticated session. In Browser A navigate **Administration → Authentication Accounts**, locate **B's exact login**, verify its Account ID, and select **Issue reset token**. Deliver the token/link privately to B without saving it in evidence. B opens the application's **Reset password** screen in a **third unauthenticated browser profile**, enters B's own new password and completes the reset. Refresh B's *old* authenticated Browser B tab: it must require sign-in. Verify B's old password fails and B's new password works; reuse the same reset token/link only to confirm it is rejected. Record non-secret action/audit reference. **Never screenshot or log the token.**
4. **B recovers A:** Repeat Step 3 in reverse, with B issuing a reset token for **A's exact Account ID**. A resets in a third unauthenticated browser profile. A's former Browser A session must be invalidated, A's old password must fail, A's new password must work, and token reuse must fail.
5. **Audit and canonical scope:** In **Administration → Audit Logs**, locate the available issuance and recovery audit evidence and confirm the authenticated issuer is the correct A or B. If the UI cannot show the event type, obtain an **approved read-only audit inspection** of a safe Test snapshot with a named operator; do not claim an event without evidence. In **Administration → Authorization** verify both humans' active GLOBAL `APPLICATION_ADMIN` grants scoped to `*`, with no Tenant actor/Person binding, and that previously existing automation administrator access was not silently revoked.

**PASS:** Both independent Test humans can authenticate in GLOBAL context, recover each other, single-use tokens are rejected on reuse, sessions are invalidated, authorization and audit evidence are correct, and Test services recover cleanly. **FAIL/BLOCKED:** unauthorized Test enrollment, partial identities, incorrect grants, bad recovery/audit/session results, or wrong Test deployment. **Exit state:** Two Test human administrators operational (each with their own updated password), no Test maintenance containers, no unexpected Test data reset, non-secret evidence retained for IT-05. **Note:** The Test deployment workflow may restore its baseline on a later release; retest account existence after any new Test promotion.

**IT-04 completion timestamp — Terminal D after the browser steps:**

```bash
: 'Terminal D (Test Linux host/bash, Test deployment repository root) — IT-04 completion time'
date -u '+IT-04 UTC end: %Y-%m-%dT%H:%M:%SZ'
```

**Execution record — IT-04:** UTC start/end: ___/___; Test operator/change approval/window: ___; environment/URL/release/tree: ___; Test image/volume: ___; path selected (E existing / N newly enrolled): ___; backup/manifest/off-host refs: ___; actor keys and logins (non-secret): ___; offline status/recorded distinct account+actor IDs: ___; independent A/B GLOBAL sign-in: ___/___; A→B, B→A reset/token/session results: ___/___; audit/canonical grant refs: ___; original automation access preserved: ___; Docker/test-copy cleanup: ___; PASS/FAIL/BLOCKED evidence+defect: ___; exit-state handed to IT-05: ___.

## IT-05 — Individually verified 1Password custody and legacy-source reconciliation (DEPLOYED TEST)

**Entry:** IT-04 PASS. A/B have **different** 1Password identities with independent MFA, a current approved **Test** vault/item access matrix, a named authorized reviewer, and an approved Test service-account permissions reviewer. No Test-vault or Production secret values may enter evidence. **Operator:** A then B, independently, and authorized 1Password reviewer. **Context:** external 1Password Test organization, not an ERS Tenant. **Terminal:** none.

**Actions:**

1. Reviewer reads and records the approved Test access matrix revision, two person identities and exact approved vault/item *names*. If not available, mark BLOCKED, do not guess names or substitute a shared vault login.
2. Human A independently signs in to the 1Password Test organization and completes A's own MFA. Open each required Test vault and named item. Verify authorized access without revealing secret fields, exporting values, or screenshotting passwords. Reviewer records A's effective access and a non-secret review reference. A then locks/signs out.
3. Human B repeats Step 2 using B's **different** identity and MFA. Record separate access review reference. Shared credentials or shared MFA fail.
4. Authorized 1Password reviewer inspects effective **Test deployment service-account** permissions using the organization-approved permissions view. Confirm only the approved Test/shared deployment vaults; no Production or human-only emergency recovery vaults. Record permission-review ID. Human vault access does not prove service-account isolation.
5. Reviewer resolves the existing LastPass-versus-1Password recovery documentation references by recording the approved operational custody decision and the exact 1Password sources that provide the launch-required materials. Do not treat `make owner-unavailable-recovery-readiness-check` as 1Password proof; do not add Gate C custodians. Record the resolution reference.
6. Ensure all sessions are locked; store only names, identities, timestamps and review identifiers in the access evidence.

**Expected:** both humans independently reach their approved Test items; deployment service account remains least-privileged; legacy documentation discrepancy has an explicit resolution record. Missing permissions view, unresolved discrepancy, or inaccessible required items means **BLOCKED/FAIL**, not N/A. **Exit:** no ERS or 1Password account grants changed by this verification.

**Execution record — IT-05:** UTC start/end: ___ / ___; operator/reviewer: ___; approved Test matrix ref: ___; Human A vault review: ___; Human B vault review: ___; Test service-account isolation ref: ___; legacy custody-resolution ref: ___; environment: Test; observed result/defect: ___; exit-state: ___.

## IT-06 — Assemble and validate deployed Test final-acceptance evidence

**Entry:** IT-00–IT-05 PASS and separately reviewed originals exist. **Operator:** Test release reviewer. **Context:** LOCAL evidence working directory; *not* a Test or Production database. **Terminal:** A, macOS/zsh, repository root. No secret values. The Test server `rehearsal.json` must have been transferred to the approved evidence directory by the authorized operator, separate from Git. Do not invent approvals to fill a template.

**Actions — Terminal A:**

```zsh
: 'Terminal A (macOS/zsh, repository root) — IT-06 create local non-secret evidence draft'
export ERS3368_EVIDENCE_DIR="$HOME/ers-3368-final-test-evidence"
if [[ -e "$ERS3368_EVIDENCE_DIR" ]]; then
  printf 'STOP: evidence directory exists; inspect before proceeding, never overwrite prior evidence\n'
else
  umask 077
  mkdir -m 700 "$ERS3368_EVIDENCE_DIR"
  cp docs/bite-3368/final-acceptance-template.json "$ERS3368_EVIDENCE_DIR/acceptance.json"
  chmod 600 "$ERS3368_EVIDENCE_DIR/acceptance.json"
  printf 'PASS: created private evidence draft at %s\n' "$ERS3368_EVIDENCE_DIR"
fi
```

**Expected:** new private draft; if existing, preserve and inspect rather than overwriting. Place a copy of the actual server `rehearsal.json` in that directory **only if it is confirmed non-secret**; do not copy the database. Open the draft in your editor and replace **every** `REPLACE_` field with the real Test evidence reference. Set `environment` to `test`, `release.revision` and `tree_sha` to the exact Test deployed revision/tree from IT-03, and change `ci_status`/`integrated_regression` to `passed` **only after actual verification**. Enter A and B's real non-secret identities and separately reviewed first-login/recovery/audit refs, independently reviewed 1Password evidence, backup and off-host receipt refs, authorized change approval, migration gate and Test smoke refs. Record **the organization's actual approval** accepting simultaneous unavailability of both humans; set the boolean to `true` only when that acceptance reference is verified.

**Actions — Terminal A:**

```zsh
: 'Terminal A (macOS/zsh, repository root) — IT-06 compute report digest and verify evidence'
export ERS3368_EVIDENCE_DIR="$HOME/ers-3368-final-test-evidence"
if [[ ! -f "$ERS3368_EVIDENCE_DIR/rehearsal.json" ]]; then
  printf 'STOP: actual Test rehearsal.json not copied to private evidence directory\n'
else
  shasum -a 256 "$ERS3368_EVIDENCE_DIR/rehearsal.json"
  printf 'Record the 64-digit hash in acceptance.json recovery.sha256 before verification\n'
  printf 'Enter the actual full Test deployment Git revision from IT-03: '
  IFS= read -r TEST_RELEASE_SHA
  python3 -B scripts/verify-bite3368-final-acceptance.py \
    --file "$ERS3368_EVIDENCE_DIR/acceptance.json" \
    --expected-revision "$TEST_RELEASE_SHA" \
    --environment test
fi
```

**Expected:** `PASS: Bite 33.6.8 evidence consistency (test, ...)` and `REVIEW REQUIRED:`; any `BLOCKED` means do not proceed until evidence is corrected and independently reviewed. The script checks hashes and consistency only; the reviewer must still compare the original CI, S3, 1Password, approvals, and Test records. **Exit:** evidence stored privately, no database writes, Test release ready for a separate go/no-go decision **only if** reviewer approval is documented.

**Execution record — IT-06:** UTC start/end: ___ / ___; reviewer: ___; environment/context: Test evidence reviewed on LOCAL; Test revision/tree: ___ / ___; report SHA: ___; verifier output ref: ___; independent record review decision/ref: ___; result/defect: ___; exit-state: ___.

## IT-07 — Production evidence and authorization gate (SEPARATELY APPROVED; NOT PART OF LOCAL/TEST EXECUTION)

**This test is a review of Production acceptance evidence, NOT a command to carry out enrollment, restore, or deployment.** If Production operations have not independently been authorized and completed, record `BLOCKED — Production acceptance outstanding` without performing them. The dedicated Production operational procedure is still mandatory for actual operational work, but it is not a prerequisite for running IT-03/IT-04 in deployed Test.

**Entry:** IT-06 PASS and independently approved. **Operator:** authorized Production change owner plus two independently authorized Production Human Administrators, with separately reviewed Production 1Password and S3 evidence. **Context:** Production GLOBAL Administration and Production recovery environment. **Terminal:** P only under approved maintenance window. **No Production action is authorized by this test document.**

**Actions:**

1. Review the **actual approved** Production change, its maintenance window, recovery owner, rollback decision, off-host receipt and backup verification, last accepted Test evidence, and exact promoted Production SHA/tree. If any are missing, record BLOCKED; do not stop Production or provision an E2E/bootstrap account.
2. **Review** actual Production human enrollment and acceptance evidence (if the independently authorized enrollment occurred): signed approval, verified backup, stopped-writer evidence, exactly two distinct independent GLOBAL AccountActor bindings, first-password change, A/B mutual recovery, token/session checks, immutable audit IDs and no accidental automation-admin revocation. If humans have not been enrolled or any proof is absent, record BLOCKED. **Do not enroll administrators as part of this review.**
3. Independently verify each Production human's individual approved 1Password access and effective Production service-account isolation; explicitly reconcile the legacy LastPass recovery references. Record review IDs. Do not treat Test findings as Production acceptance.
4. **Review** the completed, separately authorized **non-destructive** Production off-host recovery rehearsal report. Accept only actual `status=passed`, Production environment, matching Production SHA/tree, off-host source, health/integrity evidence, RPO ≤24h and RTO ≤4h. Do not weaken thresholds. Record the restricted `rehearsal.json` evidence reference and SHA-256. **Do not initiate a Production rehearsal from this review test.**
5. In an authorized verification session, populate **a separate Production copy** of `docs/bite-3368/final-acceptance-template.json` with Production-specific references. Run the exact same verifier as IT-06 but with `--environment production` and the full Production SHA. The verifier has no remote access and does not approve a release on behalf of the reviewer.
6. Approver records explicit GO/NO-GO decision and the accepted residual risk of concurrent human administrator unavailability. Until this is completed, mark **IT-07 BLOCKED — not yet performed**, not PASS or LOCAL N/A.

**Expected:** a separate Production approval and verified operational evidence. **Exit:** no test-related changes to Production except the independently authorized approved operations; any unsuccessful rehearsal or mismatch blocks final release acceptance.

**Execution record — IT-07:** UTC start/end: ___ / ___; authorized Production operator/reviewer: ___; approval/window: ___; Production release/tree: ___ / ___; backup/S3/rehearsal report and SHA: ___; A/B human acceptance: ___; individual 1Password custody reviews: ___; verification output ref: ___; risk acceptance: ___; signed GO/NO-GO ref: ___; verdict/defect: ___.

## IT-08 — Cleanup, reconciliation, and final decision

**Entry:** all applicable previous tests recorded. **Operator:** test owner/release reviewer. **Context:** LOCAL repository and separate authorized Test/Production review; no live database changes authorized. **Terminal:** A on macOS/zsh. Browser A/B may remain signed in only if approved by the relevant operational owner.

**Actions — Terminal A:**

```zsh
: 'Terminal A (macOS/zsh, repository root) — IT-08 check for test-created Docker leftovers and ports'
docker ps -a --format '{{.Names}}' | grep -E 'ers.*(recovery-rehearsal|3368)' || true
lsof -nP -iTCP:8080 -sTCP:LISTEN || true
```

**Expected:** no unexpected container names or listening test processes **after** test services are intentionally stopped. If a test-created container remains, record the exact container ID/name and remove **only that specific test-created container** after confirming its origin; never use `docker system prune`, `docker compose down -v`, or remove unrelated containers. If port 8080 is your intentionally running normal LOCAL backend, record that fact; do not kill it for cleanup.

**Actions — Terminal A:**

```zsh
: 'Terminal A (macOS/zsh, repository root) — IT-08 final repository and evidence status'
git status --short
git rev-parse HEAD
printf 'Confirm evidence remains in its private authorized location; do not commit secret materials.\n'
```

**Expected:** code branch clean after committing changes (if not, reconcile the differences); final SHA is recorded. Confirm 9 separate execution records and original signed references; Test results must not be asserted as Production results. **Exit/decision:** branch may be proposed for merge only after LOCAL+CI PASS and no unresolved blockers; **Production GO** requires actual deployed Test and Production evidence and independently authorized approval. No manual execution here is a substitute for the authorized deployment workflow.

**Execution record — IT-08:** UTC start/end: ___ / ___; operator: ___; environment/context: ___; final SHA: ___; stopped/remaining test process and Docker IDs: ___; port 8080 explanation: ___; evidence archive location/reference: ___; unresolved defects: ___; LOCAL/CI verdict: ___; Test gate verdict: ___; Production gate verdict: ___; final decision/reviewer: ___.

## Validation limits and promotion blockers

- Python/SQLite simulation is a **LOCAL regression**, not proof of actual off-host recovery or real administrator/vault operability.
- Missing Test or Production approvals, unavailable reviewer, failed or stale/mismatched SHA evidence, ambiguous LastPass/1Password custody, failed restore/backend boot, RPO/RTO exceedance, incomplete A/B mutual recovery, or a nonzero required test is **BLOCKED** until corrected and retested.
- The evidence checker checks **consistency** of supplied non-secret references and SHA-linked report; it does not independently validate the external providers, authenticated human actions, or approval system.
- For an implementation change: verify exact patch SHA, run `git apply --check`, apply, `git diff --check`, and perform canonical `make local-check` and CI. These are standard patch validation steps and are not a substitute for per-test instructions above.

**Glossary impact:** see [Implementation and Architecture](implementation-and-architecture.md).
