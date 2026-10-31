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

**Entry:** If 33.6.8A is being developed on its 1019 sub-bite branch, complete Step A0 first, then complete IT-00–IT-02 on the resulting merged 998 feature revision. **Then execute Step P** to approve and verify its formal promotion to deployed Test; the Test deployment and its database-baseline restore are *not presumed complete at entry*. After Step P PASS, confirm the Test backend remains running, Test users have been warned about the rehearsal if required by the change, and no Test recovery/migration gate is armed. **Operator:** named, authorized Test operator. **Context:** Test server checkout; supply `ENV=test` to each environment-sensitive Make command (the Bash variable `ENV` need not be set), never Production. **Terminal D:** bash on the Test host, in the repository used for Test deployment. **Credentials:** approved Test off-host read authority via existing Test configuration, after Step 0 provisioning if needed; never place credentials in commands/evidence. **Variables:** none inherited from prior tests. **STOP** if the deployed revision/tree or Test receipt cannot be verified.

### Step A0 — Integrate Bite 33.6.8A into Bite 33.6.8 (ONE-TIME, BEFORE STEP P)

**Operator:** authorized repository maintainer/reviewer using the LOCAL Mac repository and GitHub UI; no Test server changes. If the 33.6.8A changes are already merged into 998, inspect the existing PR and CI evidence instead of repeating the merge. Do not promote 1019 directly to Development, Test, or Production. The intended order is **1019 → 998 → 945 → development → test**. This sub-bite is not a separate deployed Test acceptance cycle.

**Terminal A — macOS/zsh, branch 1019 working repository root:** Complete all 33.6.8A source changes and record the exact revision and its CI run. The working tree must be committed, clean, and published before opening the PR.

```zsh
: 'Terminal A (macOS/zsh, repository root) — Bite 33.6.8A verify sub-bite source'
if [[ "$(git branch --show-current)" != '1019-bite-3368a-recovery-isolation-and-data-protection' || -n "$(git status --porcelain)" ]]; then
  printf 'BLOCKED: 33.6.8A source branch is not committed and clean\n' >&2
else
  git fetch origin --prune && git rev-parse HEAD && git rev-parse 'HEAD^{tree}'
  git rev-parse origin/1019-bite-3368a-recovery-isolation-and-data-protection
  make bite3368a-isolation-check
  make bite3368a-docker-check
fi
```

**Expected:** Local HEAD matches `origin/1019-bite-3368a-recovery-isolation-and-data-protection`; both isolation checks PASS; the real Docker check has no remaining test-created container/volume/image. **BLOCKED** for missing Docker, failed cleanup, unpublished changes or CI failure. In GitHub **Actions → CI**, verify the exact 1019 HEAD passed all required jobs and record its URL; don't substitute another commit's result.

**GitHub UI:** Select **Pull requests → New pull request**, set **base** to `998-bite-3368--integrated-regression-testing-recovery-rehearsal-and-final-acceptance` and **compare** to `1019-bite-3368a-recovery-isolation-and-data-protection`. Review the diff, require authorized approvals, confirm source CI, and merge through the protected-branch procedure. Record PR URL, reviewers, merge commit and resulting 998 tree SHA. After merge, use the normal LOCAL `998` checkout to validate the merged feature as required by IT-00–IT-02, then continue to Step P1. A CI workflow is not proof that the real deployed Test recovery has passed. **BLOCKED:** missing PR approval, wrong merge target, wrong revision/tree, or any regression/required CI failure. No Test database reset occurs in Step A0.

### Step P — Formal promotion of the prerequisite helper into deployed Test (REQUIRED BEFORE STEP 0; ONE PROMOTION PER ACCEPTED REVISION)

**Purpose and execution boundary:** This is the complete procedure for the earlier instruction "promote `998 → 945 → development → test`". Do **not** assume the feature-branch commit is already on the Test server. The promotion is executed in the **Mac repository and GitHub UI** by the authorized release operator/reviewers, then **verified read-only** in Terminal D (Test Linux/Bash). It is **not** a Test-server Git-edit procedure. This section is required when the accepted Bite 33.6.8 changes are not yet deployed; if they are already deployed, inspect and record the existing PR/workflow evidence and still perform Step P5. Do not recreate merges or rerun a destructive release just to produce new evidence.

**Identity and context:** Name the developer/release operator with permission to open PRs, the authorized reviewers, and the Test environment owner who can approve a baseline restore. The application context is **GitHub repository and Test deployment**, not an ERS Tenant or Production account. No Test S3 keys, application passwords, 1Password secrets, or database files are used in this promotion procedure. **Terminal A** = macOS/zsh at the LOCAL repository root. **Terminal D** = Linux/Bash at `/opt/EnterpriseRemoteSystems/test`, *only after deployment*. **Do not run the GitHub or Mac commands on the server.** Use normal GitHub protected-branch approvals; never use force pushes, bypasses, direct Test-server edits, or copied scripts.

**Required entry evidence (record before promotion):** IT-00–IT-02 PASS for the feature revision to be promoted, including the actual CI URL and four IT-02 evidence references; current feature HEAD SHA and tree; code-review owner; authorization reference for the Test deployment's deterministic database restore; and the Test owner's decision on what Test data, previous administrator enrollments, and acceptance evidence must be preserved. A LOCAL PASS is not permission to reset Test. If the latest commits have not yet passed LOCAL and required feature CI checks, **BLOCKED**. If Test reset authorization or retention decision is missing, **BLOCKED** before the final merge to `test`.

#### Step P1 — Verify the exact published feature revision (Terminal A, macOS/zsh)

In **Terminal A**, run this box from the feature checkout **after committing all accepted changes**. No local modification, incomplete patch, or unpublished commit is eligible. This operation fetches remote *references on the Mac*; it does not deploy or reset a database.

```zsh
: 'Terminal A (macOS/zsh, feature repository root) — IT-03 Step P1 verify published source'
FEATURE_BRANCH='998-bite-3368--integrated-regression-testing-recovery-rehearsal-and-final-acceptance'
PARENT_BRANCH='945-bite-336-recovery-rehearsal-and-operational-runbook'
if [[ "$(git branch --show-current)" != "$FEATURE_BRANCH" || -n "$(git status --porcelain)" ]]; then
  printf 'BLOCKED: feature checkout must be on branch 998 with a clean committed working tree\n' >&2
elif ! git fetch origin --prune; then
  printf 'BLOCKED: origin fetch failed; cannot confirm published branch revisions\n' >&2
elif ! git show-ref --verify --quiet "refs/remotes/origin/$FEATURE_BRANCH" || ! git show-ref --verify --quiet "refs/remotes/origin/$PARENT_BRANCH" || ! git show-ref --verify --quiet refs/remotes/origin/development || ! git show-ref --verify --quiet refs/remotes/origin/test; then
  printf 'BLOCKED: one or more required remote promotion branches are absent\n' >&2
elif [[ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$FEATURE_BRANCH")" ]]; then
  printf 'BLOCKED: LOCAL HEAD is not the published origin feature revision\n' >&2
elif ! git cat-file -e "origin/$FEATURE_BRANCH:scripts/ers-bite3368-test-offhost-prereq.sh"; then
  printf 'BLOCKED: published feature revision lacks the Test prerequisite helper\n' >&2
else
  printf 'PASS: feature revision published and clean\n'
  printf 'Feature revision: '; git rev-parse HEAD
  printf 'Feature tree: '; git rev-parse 'HEAD^{tree}'
  printf 'Parent 945 revision: '; git rev-parse "origin/$PARENT_BRANCH"
  printf 'Development revision: '; git rev-parse origin/development
  printf 'Test revision BEFORE promotion: '; git rev-parse origin/test
fi
```

**Expected:** `PASS: feature revision published and clean`, real commit/tree values, and four actual remote branch revisions. Record them. **BLOCKED** for wrong branch, working-tree modifications, unpublished revision, missing helper, missing remote branch, or fetch error. **Do not** force push or manually alter the Test checkout to work around a failure. The source SHA will normally differ from the eventual merge SHA on branches 945, Development, and Test.

**GitHub UI checkpoint — source CI (same revision):** Sign in to GitHub as the authorized repository maintainer, open this repository, select **Actions → CI** (not the Deploy workflow), and locate the successful feature-branch run for the exact Step P1 revision. Open it and verify required jobs show success; record the run URL and revision. A green run for a different feature SHA does not count. An automatic `CI` *pull-request* run is not guaranteed for a PR **targeting 945**, because this repository's `ci.yml` pull-request triggers cover Development, Test, and Production; the feature-branch **push** CI result is the applicable source evidence. If it is absent or unsuccessful, **BLOCKED**.

#### Step P2 — Review and merge 998 into parent branch 945 (GitHub UI; no server operations)

1. In the same GitHub repository, select **Pull requests → New pull request**. Set **base** to `945-bite-336-recovery-rehearsal-and-operational-runbook` and **compare** to `998-bite-3368--integrated-regression-testing-recovery-rehearsal-and-final-acceptance`. Confirm direction in the page header. If an open PR already exists for this exact pair, use that PR instead of creating another.
2. Open **Files changed** and confirm the intended Bite 33.6.8 helper, tests, and the **repository** manual are included. Check for unintended secret, credential, raw DB, or evidence uploads. Record the PR number/URL and reviewer. The PR description must reference IT-00–IT-02 evidence, the source revision/tree, the acceptance scope, and the Test baseline-restore warning. Do not paste secret values.
3. Obtain the repository-required approvals and required checks. Only the authorized maintainer selects **Merge pull request** (or the project's approved merge method) and confirms. If GitHub shows conflicts, required-review failures, or unexpected files, **BLOCKED**; resolve through normal reviewed Git changes, not a force merge.
4. Confirm the PR shows **Merged** into branch 945. Record the resulting **945 head SHA**, PR URL, approver and actual merge time. A PR marked **Closed** without a merge is not a PASS. If already merged, use the existing merged PR and its recorded head, rather than merging again.
5. In **Actions → CI**, locate the **945 branch push** run associated with this merged revision (branch 945 is covered by the repository's push CI trigger). Open it, confirm required jobs succeeded, and record its URL and exact head SHA. If CI is absent, still running, or failed, **BLOCKED**; do not open or merge 945→Development as a substitute for the missing 945 verification.

**Expected:** a reviewed, merged PR with the accepted helper in the parent branch, **successful 945 push CI**, and no Test deployment yet. **PASS** only after the actual resulting parent SHA is recorded; otherwise **BLOCKED**.

#### Step P3 — Promote parent branch 945 to Development and verify deployed checks (GitHub UI)

1. Select **Pull requests → New pull request**; set **base** = `development`, **compare** = `945-bite-336-recovery-rehearsal-and-operational-runbook`. Use an existing matching open PR instead of creating a duplicate. Verify the PR contains the accepted Bite 33.6.8 files and does not carry unintended secrets or database artifacts.
2. Obtain the required reviews and a successful **CI** workflow for this PR (the repository does run CI for PRs targeting Development). Open the run and verify the required jobs, including the Bite 33.6.8 core regression, completed successfully. Record PR URL, CI URL and head revision.
3. After authorization, merge the PR into `development`. **This push automatically triggers** the GitHub Actions workflow **Deploy Enterprise Remote Systems** for Development; its disposable database strategy may replace Development data. Do not assume a merge alone constitutes a successful deployment.
4. In **Actions → Deploy Enterprise Remote Systems**, locate the run whose branch/environment is `development` and whose revision equals the new Development branch head. Confirm the **Quality gate**, **Validate 1Password deployment references (scratch only)**, **Deploy environment**, and **Deployed Playwright E2E** jobs all succeeded. Open **Deployment summary** and record the actual revision, source tree, and run URL. Verify the deployment uses Development rather than Test or Production. If it fails, **BLOCKED**; do not promote its unverified revision to Test.

**Expected:** merged 945→Development PR, successful PR CI and successful *Development* deployment/Playwright with matching revision/tree. Record PR, CI, deployment run and reviewer evidence. If the branch has already been merged/deployed, verify that exact accepted revision and existing job results; do not redeploy unnecessarily.

#### Step P4 — Authorize Test baseline restore, then promote Development to Test (GitHub UI)

**Mandatory before opening/merging Test:** The Test environment owner must explicitly approve the *effect* of this promotion. A **push to `test` automatically sets `test_release_rehearsal=true`**, executes `server-test-rehearsal-restore ENV=test` using the pre-release baseline, then migrations and deployed Playwright. This **replaces Test's existing application database state**; previous Test-only data and human administrator enrollments may disappear. Record the Test change/approval reference, owner, maintenance window or notification (if required), which Test data/evidence must be retained and where it is already protected, and the plan to inspect or enroll human administrators in IT-04 **after** deployment. Existing Test off-host credentials/backup infrastructure must be evaluated separately; **do not require an IT-03 off-host receipt as a prerequisite to this promotion**, because IT-03 is intended to establish the first one. If the Test owner has not approved the database restore or relevant data is not protected, **BLOCKED: DO NOT MERGE INTO `test`**.

1. With approval already recorded, in GitHub select **Pull requests → New pull request**; set **base** = `test`, **compare** = `development`. Use the existing matching PR if one is already open. Inspect **Files changed**, target, source, accepted feature content and absence of secrets.
2. Obtain required reviewers and a passing **CI** workflow for the PR targeting `test`; record its run URL and SHA. If there is a conflict, unresolved test, or missing approval, **BLOCKED**.
3. Have the authorized release operator merge **Development → Test**. This **push automatically initiates the Test release rehearsal and database baseline restore**. Do not manually rerun the deployment, restore, or Git commands on the Test host to "help" the workflow.
4. In **Actions → Deploy Enterprise Remote Systems**, locate the new **test** deployment run. Verify all required jobs succeeded: **Quality gate**, **Validate 1Password deployment references (scratch only)**, **Deploy environment**, **Deployed Playwright E2E**, and **Record successful Test release rehearsal**. Check its **Deployment summary** shows `Environment: test`, `Test release rehearsal: true`, the actual revision, and source tree. Record the PR URL, reviewer/approval, CI URL, deployment run URL, Test commit SHA/tree, and the Playwright evidence artifact reference. A passing CI run alone is **not** a successful deployed Test rehearsal.

**Expected:** reviewed and approved merge, successful Test release/deployed verification and rehearsal marker, correct source revision/tree; **BLOCKED** if reset approval or any required job/evidence is absent or unsuccessful. **Do not** promote to Production here.

#### Step P5 — Independently confirm the deployed Test checkout (Terminal D, Linux/Bash, read-only)

After Step P4 succeeded, log into the authorized **Test Linux host** and run this box in **Terminal D**. This does not provision credentials, write `.env.test`, modify Git, or touch the database; it checks that the exact helper code really reached the deployed Test checkout.

```bash
: 'Terminal D (Test Linux/bash, deployed Test checkout) — IT-03 Step P5 verify deployment'
if ! cd /opt/EnterpriseRemoteSystems/test; then
  printf 'BLOCKED: Test deployment checkout not accessible\n' >&2
elif [[ "$(pwd -P)" != /opt/EnterpriseRemoteSystems/test || "$(git branch --show-current)" != test ]]; then
  printf 'BLOCKED: not in the authorized deployed Test checkout\n' >&2
elif ! test -x scripts/ers-bite3368-test-offhost-prereq.sh; then
  printf 'BLOCKED: Test prerequisite helper missing or not executable\n' >&2
elif ! make server-ps ENV=test || ! make server-backend-health ENV=test; then
  printf 'BLOCKED: Test containers/backend are not healthy\n' >&2
else
  printf 'PASS: deployed Test checkout contains executable prerequisite helper\n'
  printf 'Deployed Test revision: '; git rev-parse HEAD
  printf 'Deployed Test tree: '; git rev-parse 'HEAD^{tree}'
  printf 'Test deploy source: GitHub Actions Deploy environment; compare revision/tree above to Step P4 summary\n'
fi
```

**Expected:** Test branch, a healthy Test backend, `PASS: deployed Test checkout contains executable prerequisite helper`, and the *same full revision and tree values* recorded in the successful Step P4 GitHub deployment summary. A different commit or tree is **BLOCKED** even when the helper exists; reconcile through the approved GitHub deployment, never `git checkout`, `git reset`, or copying scripts on the Test host. Other `git status` untracked directories such as `backups/`, `recovery/`, or `release-rehearsal-passed/` can contain operational evidence; do not delete them to make a checkout appear clean. If the Docker Compose warning mentions an existing external volume, record the actual containers' health and review the log; do not delete volumes as a cleanup attempt.

**Step P PASS:** Every promotion/approval/CI/deployment checkpoint is evidenced, Step P4 Test release rehearsal succeeded, and Step P5 revision/tree and helper/health match. **Step P BLOCKED:** Any absent approval, unsuccessful or unverified required job, incorrect branch, unknown commit/tree, or helper absent. Only after Step P PASS may the authorized operator continue with **Step 0** (one-time Test off-host provisioning) or, when already provisioned and confirmed, proceed to Step 1. Do not repeat the promotion merely because off-host configuration remains disabled; that is a separate Step 0 preflight result.

**Execution record — IT-03 Step P:** UTC start/end: ___ / ___; authorized release operator: ___; feature HEAD/tree: ___ / ___; feature CI URL: ___; 998→945 PR/reviewer/merged SHA and 945 push CI URL: ___; 945→Development PR/CI/reviewer/merged SHA: ___; Development deployment run/revision/tree: ___; Test baseline restore authorization/retention/evidence location: ___; Development→Test PR/CI/reviewer/merged SHA: ___; Test deployment run, Test revision/tree, Playwright artifact, rehearsal marker evidence: ___; Terminal D revision/tree/helper/health: ___; verdict PASS/BLOCKED and defect/approver: ___; handoff to Step 0: ___ . Keep all references non-secret and outside the repository when they include operational data.

### Step 0 — Test off-host infrastructure prerequisite (ONE-TIME PROVISIONING; not the repeatable IT-03 recovery rehearsal)

**Why this exists:** Test normally has `SERVER_OFFHOST_BACKUP_ENABLED=false`. Neither the disposable LOCAL database exercise (IT-01) nor a successful Test deployment establishes a Test S3 bucket, versioned remote storage, or Test credentials on the Linux server. The absence of a Test `.offhost.json` receipt is therefore **BLOCKED — prerequisite not provisioned**, not an off-host restore failure. **Do not invent a backup receipt, use the Production S3 key, copy a Production database, or continue to Step 2 to make the test pass.**

**Identity / context / boundaries:** A named authorized infrastructure operator and a separately identified reviewer; Test Hetzner Object Storage and `ers-test` 1Password custody only. No ERS user signs in for Step 0. Terminal D = deployed Test Linux host, **Bash**, checkout `/opt/EnterpriseRemoteSystems/test`, branch `test`. Provider setup happens in the authorized Hetzner Console/1Password UIs, not the ERS UI. **This phase is not a Docker database reset and makes no change to the live Test SQLite volume.** It does modify an external Test backup destination, a Test-only credential file, and `.env.test` after approval. These changes are separate from IT-03's repeatable backup and isolated restore rehearsal.

**Before beginning:** **Step P must be PASS** with the recorded reviewed promotion chain, approved Test baseline restore, passing Test CI/deployment/rehearsal, and matching deployed SHA/tree. The Test repository must already contain the helper through normal deployment. Never copy helper scripts or edit Git on the Test server. Then, in Terminal D:

```bash
: 'Terminal D (Test Linux/bash, Test deployment checkout) — IT-03 Step 0A confirm deployed helper'
cd /opt/EnterpriseRemoteSystems/test || exit 1
git branch --show-current
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
test -x scripts/ers-bite3368-test-offhost-prereq.sh && printf 'PASS: Test prerequisite helper deployed\n' || printf 'BLOCKED: prerequisite helper not deployed\n'
```

**Expected:** `test`, approved deployed revision/tree, `PASS: Test prerequisite helper deployed`. Otherwise **BLOCKED**; do not copy the script manually from the Mac to evade the formal deployment gate. Preserve the exact deployed revision and authorized change reference.

#### Step 0B — One-time provider-side Test bucket, versioning, policy, 1Password custody

The authorized infrastructure operator and reviewer perform these UI tasks in this order, recording **non-secret evidence references only**:

1. In the **Hetzner Console**, sign in as an authorized infrastructure administrator. Select the explicitly approved **Test** project, *not* the Production project. Prefer a **separate Hetzner project** for Test because Hetzner S3 keys are project-wide by default; otherwise require a reviewer-verified bucket policy that denies the Test key access to Production buckets. Record the Test project and change-approval reference, without access keys.
2. Open **Object Storage → Buckets**, create or select an approved **private Test-only** bucket in the selected region `fsn1`, `nbg1`, or `hel1`; use a lower-case bucket name without dots (the ERS client's virtual-host HTTPS naming is not designed for dotted bucket names). Confirm this is **not** the Production bucket. If the approved retention policy requires **Object Lock**, enable it *during bucket creation*; it cannot be added later. Record bucket name/region and non-secret evidence of privacy and retention controls.
3. Enable and independently verify **S3 bucket Versioning** through an authorized S3-compatible administrator client (Hetzner's documented versioning API/CLI procedure). Record actual `Status: Enabled` evidence. `Suspended`, no versioning proof, or missing retention authorization = **BLOCKED**. This cannot be inferred from a bucket name. The later ERS remote backup must also produce non-null, exact S3 `VersionId`s.
4. In **Hetzner Console → Object Storage → S3 credentials**, create an approved Test-specific access/secret key within the approved project and record its non-secret key reference. Never reuse Production credentials. If the project has access to Production buckets and policy isolation has not been independently verified, **BLOCKED**. Ensure the approved key policy permits the required Test bucket and exact-version object operations; Hetzner requires `s3:GetObjectVersion` where versioned reads are restricted.
5. In **1Password**, create a private Test-vault item for this **Test S3** credential, accessible to the specifically authorized Test operators and independent reviewer. Confirm the item is in an approved `ers-test` vault or equivalent approved Test custody location, *not* a Production vault. Record only the vault/item reference and the two approvals. Never enter secret values, key IDs, recovery items, or screenshots of secret fields into Git, Markdown execution evidence, CI, or chat.

**PASS for Step 0B:** Approval reference, dedicated Test bucket and region, private/versioned/retention evidence, verified Test/Production isolation, Test-only key policy, and 1Password custody reference are all recorded. **BLOCKED:** any missing prerequisite. It is not acceptable to configure a new Test backup to use the Production project/key simply because that key already works.

Official provider procedures: [Hetzner S3 credentials](https://docs.hetzner.com/storage/object-storage/faq/s3-credentials/), [Hetzner bucket Versioning](https://docs.hetzner.com/storage/object-storage/howto-protect-objects/protect-versioning/), and [Object Lock at bucket creation](https://docs.hetzner.com/storage/object-storage/faq/buckets-objects/).

#### Step 0C — Install the Test S3 credential file outside Git (ONE TIME)

In **Terminal D**, use the deployed helper. Obtain the two key strings **privately** from the authorized Test 1Password item. Do not put keys in the command line, shell history, `.env.test`, or test records. Do not use `set -x`, shell debugging, recording tools, screen sharing, or pipe this command through `tee`. The helper requires an interactive Bash terminal, asks for the Test change reference, then prompts separately for the access key and secret key **without echo**, and installs an owner-root, mode-600, Test-specific file under a root-owned, mode-711 Test-only secrets directory. It **refuses to overwrite** an existing credential file; rotation must be a separately approved operation.

```bash
: 'Terminal D (Test Linux/bash, Test deployment checkout) — IT-03 Step 0C install Test S3 credentials'
cd /opt/EnterpriseRemoteSystems/test || exit 1
./scripts/ers-bite3368-test-offhost-prereq.sh install-credentials
```

**Expected:** `PASS: new Test-only credential file installed outside Git ...` and `STOP: complete configuration and run preflight`. File path: `/opt/EnterpriseRemoteSystems/test-secrets/aws-credentials-test`; profile: `ers-test-backup`. The helper never outputs key values. If it reports `BLOCKED` (including an existing file), **do not delete or overwrite an existing credential**; proceed to Step 0E to inspect existing configuration or obtain an authorized rotation procedure. For a new installation, securely clear the 1Password clipboard after use. The protected file is never added to Git. The dedicated Test secrets directory uses root ownership and mode `711` (traverse-only, no listing): this permits the unprivileged Test deployment operator to detect the credential file for the existing Docker mount helper while the root-owned, mode-`600` file cannot be read by that operator. Do **not** change the permissions of the existing shared Production secrets directory.

#### Step 0D — Write the non-secret Test S3 configuration (ONE TIME)

After Step 0B approval and a confirmed Test-only credential file, run the configuration helper **in Terminal D**. It requires the actual approved change reference, region, dedicated Test bucket and prefix, and an explicit typed Test isolation/versioning confirmation. It preserves unrelated `.env.test` settings, replaces only the eight Test S3 settings, makes a private **pre-change `.env.test` rollback copy** outside Git, and writes the resulting `.env.test` with mode 600. That rollback copy may contain unrelated application secrets: do not display, share, or commit it.

```bash
: 'Terminal D (Test Linux/bash, Test deployment checkout) — IT-03 Step 0D configure approved Test S3'
cd /opt/EnterpriseRemoteSystems/test || exit 1
./scripts/ers-bite3368-test-offhost-prereq.sh configure
```

**Expected:** `PASS: Test off-host configuration updated under <actual approval reference>` and `PRIVATE ROLLBACK COPY: /opt/EnterpriseRemoteSystems/test-secrets/...bak`. Record only the approval reference and a protected, non-secret evidence pointer; **do not expose the rollback file**. The resulting `.env.test` contains:

```text
SERVER_OFFHOST_BACKUP_ENABLED=true
SERVER_OFFHOST_BACKUP_TRANSPORT=s3
SERVER_OFFHOST_BACKUP_S3_ENDPOINT=https://<region>.your-objectstorage.com
SERVER_OFFHOST_BACKUP_S3_REGION=<approved region>
SERVER_OFFHOST_BACKUP_S3_BUCKET=<approved Test-only bucket>
SERVER_OFFHOST_BACKUP_S3_PREFIX=<approved Test-only prefix>
AWS_SHARED_CREDENTIALS_FILE=/opt/EnterpriseRemoteSystems/test-secrets/aws-credentials-test
AWS_PROFILE=ers-test-backup
```

The `<...>` values above are documentation placeholders, **not** values to paste. The helper derives the HTTPS endpoint from the approved region and requests the actual bucket/prefix interactively. `.env.test` must retain `APP_ENV=test`. Do not set `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in `.env.test` and do not use Production values. A failure means **BLOCKED**; preserve the pre-change backup for authorized rollback, but do not perform an unreviewed restoration of `.env.test`.

#### Step 0E — Validate the real Test host, credentials and compiled Go backup tool (read-only)

Run this **after** Step 0C/0D (or immediately, if the infrastructure was provisioned previously and has not changed). The helper checks the exact Test checkout, `APP_ENV=test`, eight non-secret S3 settings, HTTPS region/endpoint matching, root ownership/strict modes of the separate credential file, and the existing **compiled Go** `check-config --runtime-files` command inside the Test backend image. It does **not** upload objects, create a local backup, stop containers, expose keys, or change the Test database.

```bash
: 'Terminal D (Test Linux/bash, Test deployment checkout) — IT-03 Step 0E verify prerequisite'
cd /opt/EnterpriseRemoteSystems/test || exit 1
./scripts/ers-bite3368-test-offhost-prereq.sh preflight
```

**Expected:** `PASS: IT-03 Test configuration, external credential location, and host permissions verified`, `Off-host backup configuration valid for test: enabled`, `PASS: IT-03 Test Go off-host configuration and credentials profile validated`, and `READY FOR AUTHORIZED TEST BACKUP (NOT YET A BACKUP OR REMOTE RESTORE PASS)`. Any nonzero result, missing Docker image, missing profile, wrong path, insecure permissions, or secret-file mismatch is **BLOCKED**; do not run Step 1C. Never interpret configuration validation alone as proof of bucket connectivity or versioning. Step 1C + Step 1D will independently prove real Test remote replication and exact-version retrieval.

**Step 0 execution record (mandatory):** UTC start/end ___; Test server branch/HEAD/tree ___; real infrastructure operator/reviewer ___ / ___; approved Test change reference ___; Hetzner Test project/bucket/region (non-secret) ___; privacy/Versioning/Object Lock or retention evidence reference ___; Test-versus-Production isolation/policy evidence reference ___; separate Test key policy evidence ref ___; authorized 1Password vault/item *reference only* ___; credential install EXISTING/NEW ___; config update EXISTING/NEW ___; protected `.env.test` rollback reference (no contents) ___; preflight result/Go exit code ___; verdict **PASS/BLOCKED** ___; evidence location ___; Test database unchanged confirmation ___; next state `IT-03 Step 1A` only if PASS.

**Repeatability:** Step 0B/0C/0D are **one-time infrastructure changes** and should not be repeated just because IT-03 is rerun. On later rehearsals, verify their existing approval and execute Step 0E, then repeat **Step 1A → 1D → Step 2 → Step 3** for the approved Test recovery point. Only authorized credential rotation, storage-policy changes or a newly provisioned Test host justify repeating a corresponding Step 0 change. Cleanup must not delete Test storage credentials, Test remote backup versions, required receipts/evidence, or the running Test database.

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

### Bite 33.6.8A — Recovery Isolation and Data Protection acceptance (before IT-03 Step 2)

**Scope and gating:** This is a required safety check for the *same* IT-03 recovered-database rehearsal, not an additional database restore. The 33.6.8A patch must first pass LOCAL/CI review and be formally promoted under IT-03 Step P; do **not** copy scripts onto the Test host or run a recovery before Test deployment includes the accepted revision. IT-03 Step 1's genuine Test off-host receipt and authorization are still required. **Production operations are prohibited.**

**Isolated execution contract:** The recovery runner now uses the *already-built* backend image directly, not `docker compose run backend`. Both migration/verification and boot containers use read-only root filesystems, no network, and only explicitly authorized private rehearsal bind mounts. They must have **zero named Docker volumes**, especially no `ers-tst_backend-data`. The API's `DATABASE_PATH` **and** `DB_PATH` and the post-boot integrity queries point to the private recovered database. A healthy live Test database cannot substitute for a damaged restored database. The script disposes generated `.db`, `-wal`, `-shm`, and journal copies on success and failure; it preserves the restricted non-secret evidence report and cleanup marker. Cleanup targets only the named rehearsal container and that invocation's unique workspace; never prune Docker or remove unrelated containers/volumes.

**LOCAL prerequisite — Terminal A (macOS/zsh, repository root):** Operator is the developer on the accepted Bite 33.6.8A source revision, with Docker Desktop running. No ERS login, Test S3 access, or real backup file is used. Run the following **before** accepting the A sub-bite and promoting to the Test environment:

```zsh
: 'Terminal A (macOS/zsh, repository root) — Bite 33.6.8A isolated Docker regression'
make bite3368a-isolation-check
make bite3368a-docker-check
```

**Expected:** The offline tests report success. The Docker test builds an image from the current backend source, creates its own temporary workspace and decoy volume, verifies a migrated and healthy recovered database, then proves a deliberately corrupted recovered database **cannot** become healthy or inherit the decoy volume. The final line reports `PASS: Docker real-image isolation, recovered DB integrity, invalid DB refusal, and decoy volume preservation.` The test removes only its own image, containers, volume, and workspace, even after failure. **BLOCKED** if Docker is unavailable, any image cannot build, the database test fails, or cleanup fails; do not substitute a mocked PASS for an actual Docker PASS. Keep the actual full output or non-secret reference in the IT-03 record. Docker images and resources belong to LOCAL, not the Test deployment.

**DEPLOYED TEST prerequisite — Terminal D (Linux Bash):** The normal IT-03 Step P and Step 1 must be PASS, and the deployed `test` checkout must contain `scripts/ers-recovery-isolated-container.sh` from the approved revision. No extra Test server Git edits or manual image builds are permitted. The first actual `make server-recovery-rehearsal ENV=test` call in IT-03 Step 2 automatically verifies the container's Docker image, effective mounts, network isolation, root filesystem, and exact database path **before** its health check. A mismatch is **BLOCKED**, with the private recovery workspace cleaned up; never bypass these checks.

**IT-03 Step 3 acceptance extension:** In addition to the pre-existing checks, the rehearsal evidence must contain `.recovery.isolation.docker_effective_mounts_verified == true`, `.recovery.isolation.named_volumes_present == false`, `.recovery.isolation.network_disabled == true`, `.recovery.isolation.backend_database_path == "/rehearsal-data/app.db"`, `.recovery.isolation.database_checked_path == "/rehearsal-data/app.db"`, `.recovery.isolation.private_database_copies_disposed == true`, and `.recovery.isolation.rehearsal_container_removed == true`. The run's `cleanup.txt` must exist and record `PASS: rehearsal container removed and private SQLite copies disposed`; no `.db`/SQLite journal copies may remain beneath that invocation's private workspace. Any deviation is **BLOCKED**; retain non-secret diagnostics and do not proceed to IT-04. Record the exact report path/hash, cleanup marker path, Docker isolation outcome, and LOCAL Docker regression evidence in the IT-03 execution record.

**Note on scope:** 33.6.8A does not change RPO/RTO calculation or establish Test S3 provisioning; those remain the existing IT-03 prerequisites and the later 33.6.8B/C work. A LOCAL Docker PASS does not replace a real off-host Test restore.

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
(
  set -euo pipefail
  printf 'Paste the absolute Evidence: report path from Step 2: '
  IFS= read -r TEST_REPORT
  if [[ "$TEST_REPORT" != /opt/EnterpriseRemoteSystems/test/recovery/rehearsals/rehearsal-*/rehearsal.json || ! -f "$TEST_REPORT" ]]; then
    printf 'BLOCKED: report must be inside the managed Test rehearsal workspace\n' >&2
    exit 1
  fi
  if ! jq -e '.status == "passed" and .environment == "test" and .objectives.rpo_met == true and .objectives.rto_met == true and .recovery.isolated_backend_health == "passed" and .recovery.post_boot_integrity_check == "ok" and .recovery.post_boot_foreign_key_check == "clean" and .recovery.isolation.docker_effective_mounts_verified == true and .recovery.isolation.named_volumes_present == false and .recovery.isolation.network_disabled == true and .recovery.isolation.backend_database_path == "/rehearsal-data/app.db" and .recovery.isolation.database_checked_path == "/rehearsal-data/app.db" and .recovery.isolation.private_database_copies_disposed == true and .recovery.isolation.rehearsal_container_removed == true' "$TEST_REPORT" >/dev/null; then
    printf 'BLOCKED: recovered database, Docker isolation, objectives, or cleanup evidence failed\n' >&2
    exit 1
  fi
  TEST_RUN_DIR="$(dirname "$TEST_REPORT")"
  if [[ ! -f "$TEST_RUN_DIR/cleanup.txt" ]] || ! grep -Fxq 'PASS: rehearsal container removed and private SQLite copies disposed' "$TEST_RUN_DIR/cleanup.txt"; then
    printf 'BLOCKED: this run has no verified cleanup marker\n' >&2
    exit 1
  fi
  TEST_LEFTOVERS="$(find "$TEST_RUN_DIR" -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.db-journal' \) -print)" || {
    printf 'BLOCKED: cannot inspect the full private recovery workspace\n' >&2
    exit 1
  }
  if [[ -n "$TEST_LEFTOVERS" ]]; then
    printf 'BLOCKED: recovered database copies remain in this run\n' >&2
    exit 1
  fi
  printf 'PASS: recovered Test database verified; no persistent Test volume mounted; SQLite copies disposed\n'
  sha256sum "$TEST_REPORT"
  jq -r '"RPO seconds: \(.objectives.rpo_seconds); RTO seconds: \(.objectives.rto_seconds)"' "$TEST_REPORT"
  make server-ps ENV=test
  make server-backend-health ENV=test
  printf 'Rehearsal-created containers still present (expected none):\n'
  docker ps -a --format '{{.ID}} {{.Names}}' | grep -E 'ers.*(recovery-rehearsal|3368)' || true
  date -u '+IT-03 UTC end: %Y-%m-%dT%H:%M:%SZ'
)
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
