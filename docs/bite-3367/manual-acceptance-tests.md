# Bite 33.6.7 — Manual Acceptance Test Suite

**Complete, self-contained procedures — isolated LOCAL and deployed Test; MT-00–MT-11**

**Feature branch:** `994-bite-3367-two-human-administrators`
**Source ZIP committed HEAD (before documentation refactor):** `072a5628eab19bf8d496bc653d7c4a38e25dfc3a`
**Source ZIP:** The attached committed-HEAD archive at the SHA above (a local download may append `(1)` or `(2)` to its filename).
**Status at preparation:** Developer reports LOCAL and feature-branch CI passing. This manual suite is **not** a report that any manual or Production test has passed.
**Purpose:** Perform and record software acceptance. This checked-in document includes initialization, terminal ownership, disposable SQLite database preparation, UI-first steps, Test alternatives, execution forms, and teardown in a single run order. It is **not** a Production change authorization.

**Companion documents (same directory):** [Implementation and Architecture](implementation-and-architecture.md) (what we built), and [Production Operational Runbook](production-operational-runbook.md) (separately approved Production enrollment). Neither document must be reconciled to execute the LOCAL sequence below.
**Supersedes:** Prior standalone downloaded manual-test editions and isolated-database preparation guides; do not interleave their steps with this document.
**Scope:** Two individually controlled human GLOBAL Application Administrators, create-only offline enrollment, independent login, mutually assisted password recovery, auditability, 1Password access, and protection of pre-existing administrators. **Gate C is deferred.**

> **START HERE — run order:** MT-00 → LOCAL preparation in §C → MT-01 → MT-02 LOCAL enrollment → restart in §D → MT-03–MT-10 → MT-11 and teardown. Keep the same isolated database throughout. For a deployed Test rehearsal, substitute the deployed Test procedure under MT-02; never mix environments. Do **not** execute Production enrollment as part of this LOCAL test.

> **IMPORTANT — which tests to do now:** For **promotion/merge of branch 994 into the approved Bite 33.6 branch 945**, complete the branch checks in **MT-00** and, where an isolated, enrolled LOCAL/Test environment is available, the human acceptance tests **MT-03 through MT-10**. Execute **MT-01 and MT-02** only if two human identities have **not** already been enrolled on the chosen disposable/Test database: enrollment is *create-only*, not a repeatable test fixture. The separate **Test deployment rehearsal**, **Production enrollment**, and **Production sign-off** remain mandatory gates before launch; they are *not* a prerequisite to the feature-branch merge. Do not enroll human administrators in Production merely to close a feature-branch manual test.

---

## Execution map — use this file in order

| Stage | Section | What you do | Environment |
|---|---|---|---|
| 1 | MT-00 | Confirm exact feature SHA, tests, and CI | LOCAL repository |
| 2 | §C.0–C.3 | Define `MT_DB` **before first use**; verify source database, stop writers, make/migrate isolated copy, start isolated ERS | LOCAL |
| 3 | MT-01 | Confirm proposed A/B logins and actor keys are unused | LOCAL isolated |
| 4 | MT-02 LOCAL | Stop backend, verify pre-enrollment backup, enroll both offline, inspect status/audit | LOCAL isolated |
| 5 | §D | Restart backend against same `MT_DB`, choose distinct A/B browser profiles | LOCAL isolated |
| 6 | MT-03–MT-10 | Independent logins, reset, grants, audits, 1Password/refusal checks; record N/A for deployed-only controls | LOCAL isolated |
| 7 | MT-11 | Final login/status, evidence, **explicit teardown and cleanup** | LOCAL isolated |
| Later | MT-02 Test plus MT-03–MT-11 | Separately rehearse against deployed Test with guarded container workflow | Deployed Test |
| Later | §Production | Authorized operational Production enrollment and acceptance (independent release gate) | Production |

**Never mix LOCAL and deployed Test/Production steps.** All shell `export` assignments are per terminal. A command naming `$MT_DB` must never be run if `printf '%s\n' "$MT_DB"` is blank or names the everyday database. MT-00–MT-11 each include an execution record; mark any unmet mandatory gate *BLOCKED*, not PASS. Retain the operational runbook as the Production-controlled reference, not as a prerequisite to execute the LOCAL sequence.

## A. Safety boundaries and execution rules

1. **Use the real UI for user behavior**. Navigate using displayed menus rather than typing internal application URLs, except for the published environment entry URL or when a reset link specifically opens the public password-reset screen. The reset link itself is confidential.
2. **Use three isolated browser profiles**, not two tabs sharing cookies: **Browser A** for Human Administrator A, **Browser B** for Human Administrator B, and **Browser C** for the unauthenticated reset recipient. Browser C can be an InPrivate/Incognito profile. Keep A and B independent throughout.
3. **Set the UI locale to `en-US`** for exact labels in this checklist. If using `pt-BR`, record actual labels and follow the same workflow. This suite does not evaluate translation parity.
4. **Never record** initial/replacement passwords, reset tokens, reset URLs containing tokens, 1Password secret values, session cookies, or bearer headers in the release ticket, screenshots, logs, terminal output, or chat. Private passwords should be at least **12 characters and no more than 72 UTF-8 bytes**, and A and B must not share one.
5. **Use Test-only identity and 1Password material for Test**. Never reuse the Production humans' initial passwords or Production database in a developer machine or Test environment.
6. **Do not change live Production roles, deactivate Production administrators, modify database triggers, or run destructive refusal tests on Production.** Negative enrollment and rollback tests belong in disposable fully migrated databases or unit/integration tests.
7. **Keep recovery mandatory**. Verified backup, off-host object, isolated restore, accepted RPO ≤ 24 hours, RTO ≤ 4 hours, and 1Password remain launch prerequisites. These tests do not replace the disaster-recovery runbook.
8. **Do not merge deferred branches `990` or `991`** for this release.

## B. Test identities, environment, and evidence form

**Identify actual people by real names in your private change record; do not substitute generic credentials such as `bootstrap-admin` for either human.** Fill the following before tests:

| Record | Value to enter in private change/release record |
|---|---|
| Test environment designation | **Choose one**: `LOCAL isolated` now, `deployed Test` later. Never mix evidence. |
| Test environment browser entry URL | `<actual HTTPS Test URL>`; LOCAL may use its configured HTTP origin |
| Feature-branch candidate commit SHA | _Record actual `git rev-parse HEAD` after the documentation patch is committed; the source ZIP SHA `072a5628...` is history only_ |
| Human A full name / Test login | `<actual person>` / `<test-login-A>` |
| Human A actor key | `<actor-key-A>` |
| Human A account ID / Actor ID | `<account-A-id>` / `<actor-A-id>` |
| Human B full name / Test login | `<actual person>` / `<test-login-B>` |
| Human B actor key | `<actor-key-B>` |
| Human B account ID / Actor ID | `<account-B-id>` / `<actor-B-id>` |
| Existing Test automation Application Administrator, if present | `<login, account ID, actor key, and role/grant state; no passwords>` |
| Test enrollment approval / operator / verified backup references | `<APPROVAL_REF>` / `<OPERATOR_REF>` / `<BACKUP_REF>` |
| Test image ID / Docker volume | `N/A — LOCAL isolated, no Docker volume` OR actual deployed Test image/volume IDs |
| Browser A / B / C profiles | `<independently named profiles>` |
| Test operator and UTC execution time | `<person>` / `<UTC timestamp>` |

**Complete the individual Execution Record immediately following every MT case (MT-00 through MT-11).** The forms are the primary test evidence. Enter the actual human operator, environment, UTC start/end times, actual Administration/Tenant context displayed, exact non-secret target login and Account ID (if applicable), observed behavior, non-secret audit event/correlation IDs (if applicable), verdict, evidence references, and defect link. **An execution record is required for PASS, FAIL, and N/A.** When a field or a whole test is not applicable, write `N/A — <specific reason>`; do not leave fields blank in the completed record. **A defect report is separate** and needed only if a failure or unexpected behavior is found; enter `None — no defect observed` when appropriate. Any FAIL is a promotion/release blocker until corrected and retested. Never enter passwords, reset tokens/URLs, session cookies, or 1Password secret values in these forms.



## MT-00 — Confirm passing branch, release artifact, and no residue

**When:** Now, before merging branch 994.
**Operator/role:** Developer/release engineer with repository and CI access. **Context:** LOCAL repository; no ERS Tenant or human Administrator session needed.

**Preconditions:** The documentation patch is applied and committed. Record that new commit SHA, verify the working tree is clean, and confirm tests/CI at that **current** SHA; the `072a5628...` source ZIP was the pre-patch baseline, not the expected post-patch HEAD.

**Steps**

1. Open Terminal in the ERS repository root.
2. Execute:
   ```bash
   git branch --show-current
   git rev-parse HEAD
   git status --short
   ```
3. Verify branch exactly `994-bite-3367-two-human-administrators`. Record the **actual** full SHA (`git rev-parse HEAD`) of the new documentation commit; it is expected to **differ from** the source ZIP SHA `072a5628...`. Verify `git status --short` is empty. Confirm the change consists only of the approved documentation refactor, and evaluate CI at the new SHA. Stop on an unauthorized code change or dirty worktree.
4. Open the feature-branch CI workflow for **this SHA**. Identify and record the actual passing job names and workflow URL; confirm there are **no skipped required tests**.
5. Verify LOCAL command results for this SHA, or execute again if results were not retained:
   ```bash
   make two-human-administrators-check
   make promotion-readiness-check
   make local-check
   cd frontend && npx playwright test && cd ..
   ```
6. From repository root run `git status --short` again. Note any generated/untracked file, and do not commit passwords, copied databases, or test outputs.
7. Execute `docker ps -a --filter 'name=ers-3367-' --format '{{.ID}} {{.Names}}'` to look for leftover **Bite 33.6.7-created** containers. Do not remove unrelated containers.

**Expected:** All checks exit 0, required CI is green for the exact commit, clean branch, and no stray 33.6.7 containers.
**PASS:** Every expected result recorded. **FAIL/block:** Wrong SHA, missing CI job, failed regression, uncommitted sensitive artifact, or leftover container that cannot safely be removed.
**Record:** commit and CI URL, command exit codes, names/IDs of any leftover 33.6.7 container, PASS/FAIL.

---

### MT-00 — Execution Record (complete after this test)

| Required field | Actual result / reference |
|---|---|
| Test ID | `MT-00` |
| Execution environment and entry URL / host | _Enter actual LOCAL or Test environment and non-secret URL/host_ |
| UTC started | _YYYY-MM-DD HH:MM:SS UTC_ |
| UTC completed | _YYYY-MM-DD HH:MM:SS UTC_ |
| Human(s) actually operating and role | _Enter names and roles (expected participants: Release engineer / developer)_ |
| Actual Administration / Tenant context shown | _Enter value actually seen (expected test context: Repository / CI (no ERS Administration session))_ |
| Exact non-secret target login(s), Account ID(s), Actor ID(s) | _Enter verified identifiers (targets: Branch `994...` and HEAD commit / CI run)_ |
| Observed behavior, including actual outcomes of critical steps | _Record results in enough detail to establish PASS/FAIL; `N/A — no authentication account targeted`_ |
| Non-secret audit event ID(s) and correlation ID(s) | _Enter actual IDs where applicable; otherwise N/A and reason_ |
| Screenshot, terminal output, CI link, or other evidence reference | _Private evidence locator; scrub tokens, secrets, and session values_ |
| Verdict | _PASS / FAIL / N/A — select one_ |
| Defect link or ID | _Enter defect reference if observed; otherwise `None — no defect observed`_ |
| N/A or blocked reason (if applicable) | _Specific reason and prerequisite / approval needed, or `N/A — test executed`_ |
| Retest details (if applicable) | _Retest UTC time, new SHA/environment, corrected defect link, outcome; otherwise N/A_ |

**Do not mark PASS if evidence is missing or a required step was not performed.** A skipped or unauthorized operation must be reported as N/A/blocked with its reason; this does not automatically satisfy a mandatory acceptance gate.


## C. LOCAL rehearsal — initialize and prepare the disposable database

**Follow this section only after MT-00 and before MT-01.** These steps are mandatory when rehearsing new enrollment in LOCAL and must be performed in order. If you previously created `isolated.db`, **do not overwrite it or repeat the copying step**; re-establish the variables below, verify its path and integrity, determine whether A/B were already enrolled, and resume at the appropriate test. An existing `pre-enrollment.db` is evidence to preserve, not a reason to reset automatically. If `$MT_DB` already exists: (1) run the initialization commands; (2) use the read-only integrity and status commands in §C.2 and MT-02; (3) check whether actor A/B have already been enrolled; (4) if enrolled, do **not** repeat MT-02 and proceed to §D after recording MT-02 as previously completed with a valid evidence reference; (5) if enrollment state is uncertain, **STOP** and investigate rather than overwriting the database.

**Terminal names:** Terminal A = setup/inspection/enrollment; Terminal B = isolated backend; Terminal C = LOCAL frontend. Each terminal is a separate shell: environment variables from Terminal A do **not** automatically carry into Terminal B or C.

**Variable initialization — first command block for Terminal A** (after confirming the repository root):

**Do not start at MT-02 or copy shell commands from a different document.** In a new terminal, environment variables such as `MT_DB` are not inherited. This section defines them before they are used; any later command referring to a `$VARIABLE` presupposes its assignment in **that same terminal**. At the top of each independent terminal, use the explicit assignments shown for that terminal; never assume `export` in Terminal A propagates to Terminal B or C.

```bash
export MT_DIR="$HOME/ers-3367-mt-072a5628"
export MT_DB="$MT_DIR/isolated.db"
export MT_BACKUP="$MT_DIR/pre-enrollment.db"
printf 'MT_DIR=%s\nMT_DB=%s\nMT_BACKUP=%s\n' "$MT_DIR" "$MT_DB" "$MT_BACKUP"
```

**Expected:** Three absolute paths under your home directory; `MT_DB` is **defined by this command** and is *not* a built-in ERS setting. It is the manual-test database path used later as `ERS_DATABASE_PATH="$MT_DB"` and `--db "$MT_DB"`. If `echo "$MT_DB"` is blank in any terminal, initialize the variable there before continuing. The `NORMAL_DB` variable is separate: it names the **source** everyday LOCAL database that will remain untouched by enrollment.

### C.0 — Safety and identity contract

- **Human operator:** The developer performing Bite 33.6.7 LOCAL acceptance. Record their actual name in the test evidence.
- **Normal LOCAL database:** The SQLite database actually used by your everyday LOCAL backend; determine its absolute path from the `DATABASE_PATH=...` startup line and paste it when prompted. **No default is assumed.**
- **Isolated database:** `$HOME/ers-3367-mt-072a5628/isolated.db` (a newly created, disposable copy).
- **Existing administrator:** An existing authorized LOCAL Application Administrator copied from the normal database, to perform MT-01 before enrolling A and B. If you cannot sign in as one, **STOP**; this procedure does not authorize E2E provisioning or a bootstrap bypass.
- **Administrators A and B:** Two new distinct LOCAL-only identities, operated independently, with different logins, actor keys, and initial passwords. Do not copy Production credentials or reuse passwords between A and B.
- **Context:** MT-01 and MT-03–MT-10 use **Global administration** (`*`); enrollment is an offline operation with no ERS browser session.
- **Prerequisites:** Go 1.26.2, Python 3, SQLite CLI, LOCAL frontend tooling, a clean branch, and permissions to create a private directory beneath your home directory. A Docker container is **not required** for this LOCAL-specific path.
- **Safety:** Never point `ERS_DATABASE_PATH` or `--db` to Test/Production or your normal database during these tests. Do not run `ERS_RESET_DATABASE=true`, `make reset-db`, or `make local-db-init` against your everyday database. Never use `docker compose down -v` as cleanup.

### C.1 — Identify the normal database and stop writers

1. From the ERS repository root, verify:

   ```bash
   git branch --show-current
   git rev-parse HEAD
   git status --short
   command -v sqlite3
   go version
   ```

   **Expected:** exact branch and SHA above, clean working tree, SQLite CLI present, Go 1.26.2.
2. Find the `DATABASE_PATH=...` line in the output of your current normal `make local-backend` process. Record that **actual** path as your normal database path.
3. Stop the normal LOCAL backend with **Ctrl+C in its own terminal**. Stop any other processes known to write to that same SQLite file. You may also stop the LOCAL frontend. Do not stop unrelated Docker containers or services.
4. In Terminal A at the repository root, confirm the `MT_*` values established above, identify the verified source path, then enter:

   ```bash
   set -o pipefail
   umask 077
   printf 'Paste the FULL absolute DATABASE_PATH printed by your everyday LOCAL backend: '
   IFS= read -r NORMAL_DB
   export NORMAL_DB
   case "$NORMAL_DB" in /*) ;; *) echo 'STOP: NORMAL_DB must be an absolute path'; exit 1 ;; esac
   export MT_DIR="$HOME/ers-3367-mt-072a5628"
   export MT_DB="$MT_DIR/isolated.db"
   export MT_BACKUP="$MT_DIR/pre-enrollment.db"
   test -f "$NORMAL_DB" || { echo 'STOP: normal LOCAL database not found'; exit 1; }
   test "$NORMAL_DB" != "$MT_DB" || { echo 'STOP: paths must differ'; exit 1; }
   lsof -nP -iTCP:8080 -sTCP:LISTEN || true
   lsof -nP "$NORMAL_DB" || true
   ```

   **STOP/VERIFY:** Enter only the full path actually recorded in step 2. Do not assume `backend/data/app.db` is the database in use. Do not proceed if an ERS backend or another writer still holds the normal database, or if the port 8080 listener would conflict with the isolated backend. A blank `lsof` response is expected after shutdown.

### C.2 — Create and migrate only the disposable copy

1. With the normal backend stopped, run the following **once**:

   ```bash
   test ! -e "$MT_DB" && test ! -e "$MT_BACKUP" || {
     echo 'STOP: an existing MT database or pre-enrollment backup was found; do not overwrite it'; exit 1;
   }
   mkdir -p -m 700 "$MT_DIR"
   sqlite3 "$NORMAL_DB" ".backup '$MT_DB'"
   chmod 600 "$MT_DB"
   DB_PATH="$MT_DB" MIGRATIONS_DIR="$PWD/backend/migrations" ./scripts/db-migrate.sh
   ```

   **Expected:** SQLite creates `isolated.db`; the migration script prints `Applying migrations to: <...>/isolated.db` and concludes `✅ Migrations applied.` It must **not** report the normal LOCAL database as its target.
2. Verify the isolated copy:

   ```bash
   test "$(sqlite3 "$MT_DB" 'PRAGMA integrity_check;')" = 'ok' || { echo 'FAIL: integrity_check'; exit 1; }
   test -z "$(sqlite3 "$MT_DB" 'PRAGMA foreign_key_check;')" || { echo 'FAIL: foreign keys'; exit 1; }
   sqlite3 "$MT_DB" 'SELECT COUNT(*) AS applied_migrations FROM schema_migrations;'
   sqlite3 "$MT_DB" "SELECT COUNT(*) FROM authz_roles WHERE code='APPLICATION_ADMIN' AND active=1 AND scope_type='APPLICATION';"
   sqlite3 "$MT_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name IN ('trg_authz_audit_logs_no_update','trg_authz_audit_logs_no_delete');"
   ```

   **Expected:** integrity `ok`; foreign-key check empty; applied migration count nonzero; active application-administrator role count `1`; required audit-trigger count `2`. Any discrepancy **blocks enrollment**.
3. Record the **isolated database path**, original database path, migration count, and verification results. Do **not** attach either SQLite database file to the test evidence or to Git.

### C.3 — Start the isolated LOCAL application for MT-01

1. In a **separate Terminal B**, enter the following from repository root (the path must match the copy from §C.2):

   ```bash
   export MT_DB="$HOME/ers-3367-mt-072a5628/isolated.db"
   test -f "$MT_DB" || { echo 'STOP: isolated database missing'; exit 1; }
   APP_ENV=local ERS_DATABASE_PATH="$MT_DB" ERS_RESET_DATABASE=false \
     ERS_PROVISION_E2E_ADMIN=false DEV_SEED_ADMIN=false \
     AUTHZ_BOOTSTRAP_ENABLED=false ERS_BACKEND_WATCH=false \
     make local-backend
   ```

   **Expected:** backend prints `DATABASE_PATH=<your isolated.db path>`, `APP_ENV=local`, and starts on port 8080. If the printed database path differs, **stop immediately**.
2. In **Terminal C** at the repository root, run `make local-frontend` (unless it is already running with its API proxy directed to port 8080). Confirm the backend URL/port is the LOCAL backend, never Test/Production.
3. Confirm that the LOCAL browser origin is the expected `http://localhost:5173` (or the explicitly configured LOCAL origin) and that the backend `DATABASE_PATH` printed in Terminal B matches `MT_DB` exactly. **Leave Terminal B running** and proceed immediately to **MT-01**. The UI collision checks, evidence record, and sign-out occur in MT-01, not here.



## MT-01 — Baseline verification BEFORE creating the two new humans

**LOCAL:** Complete §C first. Use the copied LOCAL administrator in Browser C at the LOCAL frontend origin; write `LOCAL isolated` in the execution record. **Deployed Test:** use the existing approved Test Application Administrator at the verified Test URL. All identity-collision requirements are identical.

**When:** Only when rehearsing a *new* enrollment on an isolated LOCAL or Test database; skip if Test identities are already enrolled (record why). **Never re-enroll over existing Test humans.**
**Operator/role:** Existing, authorized **LOCAL or Test Application Administrator**. **Context:** Top-bar **Administration context → Global administration** (`*`), not an ordinary Tenant.

**Preconditions:** Selected LOCAL or Test backend running with a fully migrated isolated DB; approved LOCAL or Test login for the existing admin; new human A/B login and actor keys chosen (not previously used). Maintain a pre-enrollment record of any existing automation administrator.

**Steps**

1. Open **Browser C** at the known, verified entry URL for the chosen environment and sign in as the **existing authorized Application Administrator of that exact environment** (not A/B).
2. In the top bar open **Administration context**. Select **Global administration**. Check the selected context is GLOBAL and not any named Tenant.
3. From application navigation choose **Authentication**. Confirm the page heading is **Authentication Accounts**.
4. In **Actor/account filter**, type the exact proposed login of Human A. Confirm **no Authentication Account** matches. Clear the filter completely.
5. Repeat with Human B's exact login, then with each proposed **actor key**. Confirm none matches; this UI is an initial human check, **not** a substitute for create-only DB constraints.
6. Identify any existing automation Application Administrator account if shown. Record login, Account ID, and linked Actor ID/key. Do not issue a token, suspend, or modify it.
7. Sign out of Browser C. Confirm no session is left open that could be mistaken for A or B.

**Expected/PASS:** A and B logins/actor keys do not exist; existing automation administrator is unchanged; correct global context.
**FAIL/block:** Collision, wrong environment/context, unavailable Authentication screen, or a pre-existing A/B account. **Do not run enrollment on a collision.**

---

### MT-01 — Execution Record (complete after this test)

| Required field | Actual result / reference |
|---|---|
| Test ID | `MT-01` |
| Execution environment and entry URL / host | _Enter actual LOCAL or Test environment and non-secret URL/host_ |
| UTC started | _YYYY-MM-DD HH:MM:SS UTC_ |
| UTC completed | _YYYY-MM-DD HH:MM:SS UTC_ |
| Human(s) actually operating and role | _Enter names and roles (expected participants: Existing authorized Test Application Administrator)_ |
| Actual Administration / Tenant context shown | _Enter value actually seen (expected test context: Global administration (`*`) — record actually displayed)_ |
| Exact non-secret target login(s), Account ID(s), Actor ID(s) | _Enter verified identifiers (targets: Proposed A and B logins and actor keys; existing automation admin)_ |
| Observed behavior, including actual outcomes of critical steps | _Record results in enough detail to establish PASS/FAIL; A and B Account IDs: `N/A — not yet enrolled`_ |
| Non-secret audit event ID(s) and correlation ID(s) | _Enter actual IDs where applicable; otherwise N/A and reason_ |
| Screenshot, terminal output, CI link, or other evidence reference | _Private evidence locator; scrub tokens, secrets, and session values_ |
| Verdict | _PASS / FAIL / N/A — select one_ |
| Defect link or ID | _Enter defect reference if observed; otherwise `None — no defect observed`_ |
| N/A or blocked reason (if applicable) | _Specific reason and prerequisite / approval needed, or `N/A — test executed`_ |
| Retest details (if applicable) | _Retest UTC time, new SHA/environment, corrected defect link, outcome; otherwise N/A_ |

**Do not mark PASS if evidence is missing or a required step was not performed.** A skipped or unauthorized operation must be reported as N/A/blocked with its reason; this does not automatically satisfy a mandatory acceptance gate.


### LOCAL transition — stop the isolated backend before offline MT-02

**Only after recording MT-01's verdict and signing out of Browser C:** In **Terminal B**, stop the isolated backend with **Ctrl+C**. Keep the frontend running for later steps. From Terminal A confirm the exact database name and that no process is writing to it:

```bash
export MT_DB="$HOME/ers-3367-mt-072a5628/isolated.db"
printf 'OFFLINE DATABASE = %s\n' "$MT_DB"
test -f "$MT_DB" || { echo 'STOP: isolated database missing'; exit 1; }
lsof -nP -iTCP:8080 -sTCP:LISTEN || true
lsof -nP "$MT_DB" || true
```

**Expected:** No ERS backend listening on port 8080 and no process holding `isolated.db`. If a listener or writer remains, identify it and **STOP**; do not enroll while any writer is present. Do not stop unrelated processes.


## MT-02 — Isolated LOCAL / deployed Test enrollment and read-only verification

**Choose exactly one execution path for MT-02:**

- **LOCAL isolated rehearsal (what you are doing now):** Execute the complete MT-02 LOCAL Steps A and B immediately below. No Docker or deployed Test service is needed. Mark deployed Test-only image/volume/backup evidence as `N/A — LOCAL isolated`; do **not** interpret this as Test gate acceptance.
- **Deployed Test acceptance (later):** Execute the Test-specific steps in this MT-02 section, including the guarded Docker pipeline and offline inspection copy. Do not run LOCAL Go enrollment against the deployed Test data volume.

**Do not repeat enrollment** against any database where A/B already exist; if an enrollment is complete, record the prior evidence and skip directly to independent login validation.

**When:** Once, per *new isolated LOCAL or Test database*. **Not a recurring manual test.**
**Operator/role:** Named LOCAL acceptance operator for the LOCAL path; approved Test deployment operator for the deployed Test path. **Context:** Offline database maintenance in the **chosen environment**; no ERS browser user session can authorize enrollment.
**Preconditions:** MT-01 passed; environment-specific approval/operator/backup references; fully migrated selected database; two new LOCAL-only identities for LOCAL (or two Test-only identities for deployed Test). An accepted image and deployed Test volume are required for **deployed Test only**.

### MT-02 — LOCAL isolated execution (perform these steps, then complete this test's record)

#### MT-02 LOCAL — Step A: Preserve a verified pre-enrollment snapshot

1. In **Terminal A**, with the backend stopped, run:

   ```bash
   export MT_DIR="$HOME/ers-3367-mt-072a5628"
   export MT_DB="$MT_DIR/isolated.db"
   export MT_BACKUP="$MT_DIR/pre-enrollment.db"
   test -f "$MT_DB" && test ! -e "$MT_BACKUP" || { echo 'STOP: missing database or existing backup'; exit 1; }
   sqlite3 "$MT_DB" ".backup '$MT_BACKUP'"
   chmod 600 "$MT_BACKUP"
   test "$(sqlite3 "$MT_BACKUP" 'PRAGMA integrity_check;')" = 'ok' || { echo 'FAIL: backup integrity'; exit 1; }
   test -z "$(sqlite3 "$MT_BACKUP" 'PRAGMA foreign_key_check;')" || { echo 'FAIL: backup foreign keys'; exit 1; }
   shasum -a 256 "$MT_BACKUP"
   ```

2. Record the **SHA-256 digest** and full path of this verified snapshot privately. The pre-enrollment backup is local evidence and **does not constitute Production off-host backup verification**.
3. Before enrollment, record the pre-existing audit count so the test is repeatable even when the copied database contains older audit evidence:

   ```bash
   sqlite3 "$MT_DB" "SELECT COUNT(*) AS enrollment_events_before FROM authz_audit_logs WHERE operation='authentication.human_admins.offline_enroll';"
   ```

   Record the integer in the private MT-02 execution record. **Do not create additional administrators to make the count appear to be two.**

4. Enter **non-secret** operator references in Terminal A:

   ```bash
   export APPROVAL_REF='LOCAL-MT3367-ACCEPTANCE'
   export OPERATOR_REF='LOCAL-MT3367-OPERATOR'
   export BACKUP_REF="LOCAL-MT3367-BKP-$(date -u +%Y%m%dT%H%M%SZ)"
   export ACTOR_A='local-mt3367-human-a'
   export ACTOR_B='local-mt3367-human-b'
   ```

   These are LOCAL evidence identifiers; replace `OPERATOR_REF` with an approved non-secret identifier for the actual operator if applicable. Associate `BACKUP_REF` with the recorded backup path and digest. The actor keys are examples: if either is already used, choose a new unused key and record it **before** enrollment.

#### MT-02 LOCAL — Step B: Enroll two new human administrators, once and offline

1. Confirm that the isolated backend is **stopped** and `lsof` shows no process holding `$MT_DB`. Confirm `$MT_DB` points to `isolated.db`, **not** `backend/data/app.db` or any deployed database. No Production confirmation flag is used.
2. In **Terminal A**, still at repository root, run the following pipeline:

   ```bash
   set -o pipefail
   umask 077
   python3 -B scripts/ers-two-human-admin-input.py | (
     cd backend && APP_ENV=local go run ./cmd/enroll-human-admins \
       --db "$MT_DB" \
       --environment local \
       --offline-confirmed \
       --approval-reference "$APPROVAL_REF" \
       --operator-reference "$OPERATOR_REF" \
       --backup-evidence-reference "$BACKUP_REF"
   )
   ```

   Enter **two distinct LOCAL-only humans** when prompted: actor key (`$ACTOR_A` for A, `$ACTOR_B` for B), display name, unused login, and separate initial passwords. The script collects passwords privately; do not use `tee`, redirect its JSON, enable shell `set -x`, or capture passwords/reset tokens in screenshots.
3. **Expected:** command exits `0`, printing exactly two non-secret `enrolled login=... actor_key=... account_id=... actor_id=... must_change_password=true` lines. Both Account IDs and Actor IDs must differ. If it fails, **STOP**, preserve evidence, and diagnose; do **not** rerun automatically.
4. Before restarting the backend, run:

   ```bash
   python3 -B scripts/ers-two-human-admin-status.py \
     --db "$MT_DB" \
     --actor-key "$ACTOR_A" \
     --actor-key "$ACTOR_B"
   sqlite3 "$MT_DB" "SELECT COUNT(*) FROM authz_audit_logs WHERE operation='authentication.human_admins.offline_enroll';"
   ```

   **Expected:** status command exit `0`, JSON `"ready": true`, two distinct active GLOBAL AccountActors, both `"usable": true` and `"mustChangePassword": true`; exactly **two** new `authentication.human_admins.offline_enroll` audit records if this was a clean snapshot without prior manual enrollment. Where the original database already had earlier events, compare counts before/after and require an increase of exactly two.
5. In the MT-02 execution record write **`LOCAL isolated — non-Docker alternative`** as the environment. Docker image/volume and deployed Test backup steps are **`N/A — this is LOCAL; the deployed Test gate remains pending`**. Record the isolated path, actual operator, backup checksum/reference, Account/Actor IDs, and verdict. **Do not claim the deployed Test-environment Gate 2 passed based only on LOCAL testing.**


**LOCAL PASS criteria:** Pre-enrollment backup exists and passes integrity/foreign-key checks; offline enrollment commits exactly two independently identified GLOBAL accounts; status shows both usable with mandatory password change pending; audit count increases by exactly two; backend was stopped during writes. **Stop on any deviation.** The backend restart for browser tests is in §D immediately after this test's execution record.

### MT-02 — Deployed Test execution (different environment; do not run for LOCAL)

**Steps**

1. Sign out Test users or notify them of a planned maintenance window. **Verify the deployment host is Test, not Production.** Record Test browser origin, deploy SHA, image ID, and inspected volume name.
2. In repository root on the authorized deployment host, set **non-secret references only** using these *Test-only* non-secret references:
   ```bash
   export APPROVAL_REF='CHG-<approved-Test-change-id>'
   export OPERATOR_REF='<named-Test-operator-id>'
   export BACKUP_REF='BKP-<verified-Test-backup-reference>'
   export ACTOR_A='<new-Test-human-A-actor-key>'
   export ACTOR_B='<new-Test-human-B-actor-key>'
   ```
3. **Check the actual Test deployment volume name** before using the value in commands; the previously documented default is `ers-tst_backend-data`. If it differs, use the inspected value and record why. Then:
   ```bash
   export ENVIRONMENT=test
   export PRODUCTION_CONFIRMATION=''
   export DB_VOLUME=ers-tst_backend-data
   export IMAGE="$(docker inspect ers-tst-backend --format '{{.Image}}')"
   docker volume inspect "$DB_VOLUME"
   docker image inspect "$IMAGE" --format '{{.Id}}'
   ```
4. Back up and verify **while Test is still running**, using the existing targets:
   ```bash
   make server-backup ENV=test
   make server-backup-verify ENV=test BACKUP_FILE='<actual absolute Test backup path from previous output>'
   ```
   Inspect the evidence and ensure `BACKUP_REF` actually refers to this verified backup. **If any command fails, STOP.**
5. Shut down Test without deleting volumes:
   ```bash
   make server-test-down
   docker ps --filter "volume=$DB_VOLUME" --format '{{.ID}} {{.Names}}'
   ```
   Expected: **no running container** using that volume. Independently ensure no host-side SQLite process or one-off recovery task is writing to it. If unsure, STOP.
6. Perform exactly **one** enrollment using these commands, **only after** the Test volume is confirmed isolated, Test backup verified, and variables set in step 2–3. Run from the authorized Test deployment host in a Bash shell (if needed first enter `bash`), with no shell tracing and no redirected credential JSON:

```bash
# Test environment only; never point DB_VOLUME or IMAGE to Production.
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
  --backup-evidence-reference "$BACKUP_REF"

# Teardown: --rm removes a successful/failed run container; trap is a fallback.
docker ps -a --filter "name=$ENROLL_CONTAINER" --format '{{.Names}}'
# Expected: NO lines (if any line appears: FAIL, remove ONLY that test container).
```

   Enter administrator 1 = Test Human A and administrator 2 = Test Human B. The two initial passwords must be distinct. **Never rerun automatically.** If the command or any input fails, stop and investigate using non-secret evidence.
7. Confirm the pipeline exit code is `0`; record exactly two success records containing non-secret login, actor key, Account ID, and Actor ID. The two Account IDs differ, and the two Actor IDs differ. **Never automatically rerun enrollment.**
8. While Test is still offline, create a **private, consistent** copy of its volume database, then inspect it. Do not use the earlier pre-enrollment backup as the status copy.

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
```

   Verify `ready=true`, two `usable=true` results, distinct Account/Actor IDs, and two `mustChangePassword=true` flags before their first sign-in. If any result fails, STOP without declaring enrollment successful.
9. Remove the **verified, test-created** private inspection copy on the Test host before restart. Confirm that `$STATUS_DIR` equals the previously recorded scratch directory created in step 8 and is **not** a deployment/data-volume path:
   ```bash
   test -f "$STATUS_DIR/app.db" || { echo 'STOP: expected status copy missing'; exit 1; }
   rm -f "$STATUS_DIR/app.db"
   rmdir "$STATUS_DIR"
   ```
   Follow the organization's secure storage/deletion policy for sensitive test copies. Restart Test:
   ```bash
   make server-test-up
   make server-ps ENV=test
   ```
10. Confirm Test is healthy at its known browser entry URL and the **only** 33.6.7-created enrollment container has been removed. Do not delete the Test data volume.


**STOP** if Test backup, image ID, DB volume, or offline status cannot be verified; do not proceed to Production or silently substitute LOCAL evidence.

**Expected/PASS:** A and B created atomically, separate canonical accounts, no live database writer during enrollment, correct pre-login password-change flags, verified backup, successful restart.
**FAIL/block:** Backup or isolation failure, nonzero enrollment, unexpected third account, duplicate IDs, absent audit, wrong volume/image/environment, exposed credentials, or startup failure. **A failed enrollment requires investigation before any retry.**
**Record:** approval/operator/backup references, image/volume, non-secret enrollment output, status results, downtime, cleanup, and PASS/FAIL.

---

### MT-02 — Execution Record (complete after this test)

| Required field | Actual result / reference |
|---|---|
| Test ID | `MT-02` |
| Execution environment and entry URL / host | _Enter actual LOCAL or Test environment and non-secret URL/host_ |
| UTC started | _YYYY-MM-DD HH:MM:SS UTC_ |
| UTC completed | _YYYY-MM-DD HH:MM:SS UTC_ |
| Human(s) actually operating and role | _Enter names and roles (expected participants: Approved Test enrollment operator)_ |
| Actual Administration / Tenant context shown | _Enter value actually seen (expected test context: Offline LOCAL/Test maintenance (no ERS UI Administration session))_ |
| Exact non-secret target login(s), Account ID(s), Actor ID(s) | _Enter verified identifiers (targets: New A and B logins, Account IDs, Actor IDs; approval/backup references)_ |
| Observed behavior, including actual outcomes of critical steps | _Record results in enough detail to establish PASS/FAIL; Enrollment and status results; Test image/volume; cleanup evidence_ |
| Non-secret audit event ID(s) and correlation ID(s) | _Enter actual IDs where applicable; otherwise N/A and reason_ |
| Screenshot, terminal output, CI link, or other evidence reference | _Private evidence locator; scrub tokens, secrets, and session values_ |
| Verdict | _PASS / FAIL / N/A — select one_ |
| Defect link or ID | _Enter defect reference if observed; otherwise `None — no defect observed`_ |
| N/A or blocked reason (if applicable) | _Specific reason and prerequisite / approval needed, or `N/A — test executed`_ |
| Retest details (if applicable) | _Retest UTC time, new SHA/environment, corrected defect link, outcome; otherwise N/A_ |

**Do not mark PASS if evidence is missing or a required step was not performed.** A skipped or unauthorized operation must be reported as N/A/blocked with its reason; this does not automatically satisfy a mandatory acceptance gate.


## D. LOCAL restart — Restart and run the human browser acceptance tests

1. Restart the isolated backend in **Terminal B** with the **same** §C.3 `APP_ENV=local ERS_DATABASE_PATH="$MT_DB" ... make local-backend` command. Confirm the printed `DATABASE_PATH` is unchanged.
2. Keep the frontend on the LOCAL origin. Use three independent browser profiles as instructed in the test cases below (A for Human A, B for Human B, C for the unauthenticated reset recipient). Avoid browser/profile contamination from the earlier existing-admin sign-in.
3. Have A and B independently execute MT-03–MT-10 with their own LOCAL-only identities. Complete each individual execution record, including actual Global administration context, evidence references, and PASS/FAIL. If a case requires a deployed Test control unavailable in LOCAL, mark **N/A with the specific reason**; do not mark PASS without executing it.
4. Verify no Production/remote environment was accessed, no normal LOCAL database was modified by these acceptance operations, and all non-secret audit and recovery checks meet the test cases below's criteria.



## MT-03 — Human A's own first login and mandatory password change

**Operator/role:** **Actual Human Application Administrator A for the selected LOCAL/Test environment**, not the enrollment operator and not the existing automation admin. **Context:** GLOBAL `*`. **Browser:** A only.
**Preconditions:** A's account newly enrolled in the selected **LOCAL isolated or deployed Test** environment, `mustChangePassword=true`; selected backend healthy; A alone holds A's initial credential.

**Steps**

1. Open a **new, empty Browser A profile** (do not use Browser C from MT-01). Open the entry URL of the **environment selected and recorded for this execution** (LOCAL or deployed Test; never Production for these steps).
2. On **Sign in**, enter **A's own login** into **Login** and A's **initial password** into **Password**. Select **Sign in**.
3. Confirm the application routes to **Change password** before offering normal navigation.
4. On **Change password**, enter A's initial password in **Current password**; a new *private, unique* A password in **New password**; and the identical new password in **Confirm password**. Select **Change password**.
5. Confirm the application returns to **Sign in** after the change (the prior session is ended).
6. Sign in with **A's new password**. Confirm ordinary administration navigation is now available.
7. Open top-bar **Administration context** and select **Global administration** (`*`). Choose **Authentication** and verify **Authentication Accounts** loads. Choose **Authorization** and verify **Application Authorization** loads and shows an authenticated actor with `APPLICATION_ADMIN` in the Roles display.
8. In a separate, unauthenticated browser profile (not Browser A), attempt a sign-in using A's **initial** password. Confirm sign-in is rejected; do not make repeated attempts that could lock the account. Close that profile.

**Expected/PASS:** Initial credential forces change; change ends the old session; new password works, old password does not; GLOBAL Administration works with A's own session.
**FAIL/block:** Any access without the required password change, failed logout, usable old password, Tenant-only actor context, HTTP 500, or inability to reach Authentication/Authorization.
**Record:** A login/Account ID/Actor ID, timestamp, screen/context verification, outcome (no passwords).

---

### MT-03 — Execution Record (complete after this test)

| Required field | Actual result / reference |
|---|---|
| Test ID | `MT-03` |
| Execution environment and entry URL / host | _Enter actual LOCAL or Test environment and non-secret URL/host_ |
| UTC started | _YYYY-MM-DD HH:MM:SS UTC_ |
| UTC completed | _YYYY-MM-DD HH:MM:SS UTC_ |
| Human(s) actually operating and role | _Enter names and roles (expected participants: Actual Human A)_ |
| Actual Administration / Tenant context shown | _Enter value actually seen (expected test context: Global administration (`*`) — record actually displayed)_ |
| Exact non-secret target login(s), Account ID(s), Actor ID(s) | _Enter verified identifiers (targets: A login, Account ID, Actor ID)_ |
| Observed behavior, including actual outcomes of critical steps | _Record results in enough detail to establish PASS/FAIL; Forced password change; old vs new password outcomes (never record passwords)_ |
| Non-secret audit event ID(s) and correlation ID(s) | _Enter actual IDs where applicable; otherwise N/A and reason_ |
| Screenshot, terminal output, CI link, or other evidence reference | _Private evidence locator; scrub tokens, secrets, and session values_ |
| Verdict | _PASS / FAIL / N/A — select one_ |
| Defect link or ID | _Enter defect reference if observed; otherwise `None — no defect observed`_ |
| N/A or blocked reason (if applicable) | _Specific reason and prerequisite / approval needed, or `N/A — test executed`_ |
| Retest details (if applicable) | _Retest UTC time, new SHA/environment, corrected defect link, outcome; otherwise N/A_ |

**Do not mark PASS if evidence is missing or a required step was not performed.** A skipped or unauthorized operation must be reported as N/A/blocked with its reason; this does not automatically satisfy a mandatory acceptance gate.


## MT-04 — Human B's own first login, independent of A

**Operator/role:** **Actual Human Application Administrator B for the selected LOCAL/Test environment**. **Context:** GLOBAL `*`. **Browser:** B only.
**Preconditions:** MT-03 passed, A remains signed in Browser A; B's new Test account still has `mustChangePassword=true`.

**Steps**

1. Open a **different normal browser profile B**, with no shared cookies or password-manager login from A.
2. Open the Test entry URL and sign in with **B's own initial login/password**.
3. Confirm mandatory **Change password** appears. Enter B's initial password in **Current password** and a **different new private password** in **New password** and **Confirm password**. Submit.
4. Confirm return to **Sign in**. Sign in with B's new password.
5. Open **Administration context** and select **Global administration** (`*`). From the app's navigation choose **Authentication** and **Authorization**; verify both load and show B's authorized global actor.
6. Return to Browser A, refresh **Authentication Accounts**, and verify A **remains independently signed in**. Return to Browser B and refresh; B must remain signed in.
7. From **Authentication Accounts**, use **Actor/account filter** to locate A and then B separately. Confirm distinct Account IDs and distinct GLOBAL Actor IDs/keys. Clear the filter between searches.
8. Optionally verify B's initial password is rejected using a third *unauthenticated* browser profile, avoiding changes to A or B's authenticated sessions.

**Expected/PASS:** B completes forced change with B's own identity, independently manages GLOBAL Administration, A and B sessions coexist, and A/B identifiers differ.
**FAIL/block:** Shared cookies/account, one administrator requiring the other's session, duplicate ID, Tenant-only access, or old B password still valid.

---

### MT-04 — Execution Record (complete after this test)

| Required field | Actual result / reference |
|---|---|
| Test ID | `MT-04` |
| Execution environment and entry URL / host | _Enter actual LOCAL or Test environment and non-secret URL/host_ |
| UTC started | _YYYY-MM-DD HH:MM:SS UTC_ |
| UTC completed | _YYYY-MM-DD HH:MM:SS UTC_ |
| Human(s) actually operating and role | _Enter names and roles (expected participants: Actual Human B)_ |
| Actual Administration / Tenant context shown | _Enter value actually seen (expected test context: Global administration (`*`) — record actually displayed)_ |
| Exact non-secret target login(s), Account ID(s), Actor ID(s) | _Enter verified identifiers (targets: B login/Account ID/Actor ID; A session independent)_ |
| Observed behavior, including actual outcomes of critical steps | _Record results in enough detail to establish PASS/FAIL; Independent logins and forced change outcomes_ |
| Non-secret audit event ID(s) and correlation ID(s) | _Enter actual IDs where applicable; otherwise N/A and reason_ |
| Screenshot, terminal output, CI link, or other evidence reference | _Private evidence locator; scrub tokens, secrets, and session values_ |
| Verdict | _PASS / FAIL / N/A — select one_ |
| Defect link or ID | _Enter defect reference if observed; otherwise `None — no defect observed`_ |
| N/A or blocked reason (if applicable) | _Specific reason and prerequisite / approval needed, or `N/A — test executed`_ |
| Retest details (if applicable) | _Retest UTC time, new SHA/environment, corrected defect link, outcome; otherwise N/A_ |

**Do not mark PASS if evidence is missing or a required step was not performed.** A skipped or unauthorized operation must be reported as N/A/blocked with its reason; this does not automatically satisfy a mandatory acceptance gate.


## MT-05 — Canonical GLOBAL AccountActor binding and self-suspension safeguard

**Operator/role:** First A in Browser A, then B in Browser B. **Context:** GLOBAL `*`; **do not select Tenant A, B, or `default` as an ordinary tenant**.
**Preconditions:** MT-03 and MT-04 passed.

**Steps**

1. In Browser A choose **Authentication**. In **Actor/account filter**, enter A's exact login.
2. In A's matching Authentication Account card, locate **Account identity boundary**. Verify: **Person binding** says none; **Tenant Actor bindings** says none; **Global Actor bindings** indicates exactly **1**.
3. Under **Actors**, verify A's linked Actor is **Application-wide** and its **Actor ID** and **Actor Key** match the enrollment output. Record the non-secret ID/key. Verify **Account active** and the absence of **Password change required**.
4. In A's account card find **Security suspend**. Because this is A's currently authenticated account, the button must be **disabled**. **Do not try to bypass it.**
5. Clear the filter. Enter B's login; verify the equivalent single GLOBAL binding/no Person/no Tenant bindings and the exact B Actor ID/key.
6. Using application navigation choose **Authorization**. In **Authenticated authorization context**, set **Selected Tenant ID** to `*` if not already shown. Verify the authenticated actor summary shows A's actor key, **scope `APPLICATION`**, and **Roles** containing `APPLICATION_ADMIN`.
7. In the actor search/filter, find A and B by actor key. Inspect each active actor's listed role grants. Confirm each has an active `APPLICATION_ADMIN` grant for tenant `*`. **Do not click revoke, deactivate, or grant.**
8. Repeat steps 1–7 in Browser B for B's own authenticated context and **disabled** self-suspension control.

**Expected/PASS:** Both account boundaries are canonical GLOBAL-only, each has `APPLICATION_ADMIN` for `*`, and neither human can security-suspend their own current account through the UI.
**FAIL/block:** Missing grant, mixed Tenant/GLOBAL bindings, Person binding, wrong actor key, cross-account identity confusion, or working self-suspend control.

---

### MT-05 — Execution Record (complete after this test)

| Required field | Actual result / reference |
|---|---|
| Test ID | `MT-05` |
| Execution environment and entry URL / host | _Enter actual LOCAL or Test environment and non-secret URL/host_ |
| UTC started | _YYYY-MM-DD HH:MM:SS UTC_ |
| UTC completed | _YYYY-MM-DD HH:MM:SS UTC_ |
| Human(s) actually operating and role | _Enter names and roles (expected participants: Actual Human A, then Human B)_ |
| Actual Administration / Tenant context shown | _Enter value actually seen (expected test context: Global administration (`*`) — record both actually displayed)_ |
| Exact non-secret target login(s), Account ID(s), Actor ID(s) | _Enter verified identifiers (targets: Both Account IDs, GLOBAL Actor IDs/keys, grant IDs)_ |
| Observed behavior, including actual outcomes of critical steps | _Record results in enough detail to establish PASS/FAIL; Self-suspend disabled and canonical binding/grant observations_ |
| Non-secret audit event ID(s) and correlation ID(s) | _Enter actual IDs where applicable; otherwise N/A and reason_ |
| Screenshot, terminal output, CI link, or other evidence reference | _Private evidence locator; scrub tokens, secrets, and session values_ |
| Verdict | _PASS / FAIL / N/A — select one_ |
| Defect link or ID | _Enter defect reference if observed; otherwise `None — no defect observed`_ |
| N/A or blocked reason (if applicable) | _Specific reason and prerequisite / approval needed, or `N/A — test executed`_ |
| Retest details (if applicable) | _Retest UTC time, new SHA/environment, corrected defect link, outcome; otherwise N/A_ |

**Do not mark PASS if evidence is missing or a required step was not performed.** A skipped or unauthorized operation must be reported as N/A/blocked with its reason; this does not automatically satisfy a mandatory acceptance gate.


## MT-06 — Human A issues a single-use password reset for B

**Operator/role:** Issuer **Human A** using Browser A; recipient **Human B** using Browser C for reset. **Context:** A in GLOBAL Administration `*`; B's public reset screen is unauthenticated.
**Preconditions:** Both humans completed first password changes; B is signed in Browser B with B's current password. Browser C has **no B session**. Have a private approved short-lived channel for the reset token. **Do not put token in a ticket.**

**Steps**

1. In Browser B verify B can currently open **Authentication Accounts**, and leave that authenticated tab open for subsequent revocation verification.
2. In Browser A choose **Authentication**, then **Authentication Accounts**. In **Actor/account filter**, enter **B's exact login**.
3. Verify the **matching card's login and Account ID** are B's, **not A's**. Do not act if ambiguous.
4. On B's matching card, select **Issue reset token** **once**. A section **One-time reset token for [B login]** should appear, with an expiry and **Open reset page** link.
5. Privately give **only B** the token or one-time reset URL. Do not screenshot it, copy it into a persistent note, or include it in a browser recording.
6. In **Browser C**, open the provided reset link. Confirm the public page heading is **Reset password**; the token field should be prefilled when opened from a link. If exchanging just the token, navigate from the sign-in screen via **Reset password** and paste the token into the field. Use B's *new*, private replacement password in **New password** and **Confirm password**. Select **Reset password** **once**.
7. Confirm the UI returns to **Sign in** with a reset-success indication for B's login.
8. Return to **Browser B** and refresh the previously authenticated Authentication Accounts page. Verify B's old session can no longer access the protected page and B must sign in again.
9. In Browser B sign in with B's **previous** password (the one used before step 6). Verify rejection. Sign in with B's **replacement** password, confirm GLOBAL Administration opens again.
10. In Browser C, without saving the token in evidence, attempt to submit **the same consumed token** with a *different* new password via the public Reset password form. Confirm the app rejects it. Verify B's replacement password from step 6 still works. Then clear Browser C's token-bearing tab/history/clipboard using the approved secure process.
11. In Browser A refresh Authentication Accounts; confirm **A remains authenticated** and did not lose A's own session.

**Expected/PASS:** A can authorize issuance for B; one successful redemption only; B's prior session invalidated; old B password rejected; new B password effective; A unaffected.
**FAIL/block:** HTTP 500, reset for wrong Account ID, reusable token, B session remains usable, previous B password works, A unexpectedly revoked, or token appears in evidence.
**Record:** issuer A actor key, B Account ID, time, issuance/consumption audit event IDs (obtained in MT-08), PASS/FAIL. **Never record token.**

---

### MT-06 — Execution Record (complete after this test)

| Required field | Actual result / reference |
|---|---|
| Test ID | `MT-06` |
| Execution environment and entry URL / host | _Enter actual LOCAL or Test environment and non-secret URL/host_ |
| UTC started | _YYYY-MM-DD HH:MM:SS UTC_ |
| UTC completed | _YYYY-MM-DD HH:MM:SS UTC_ |
| Human(s) actually operating and role | _Enter names and roles (expected participants: Issuer Human A; recipient Human B)_ |
| Actual Administration / Tenant context shown | _Enter value actually seen (expected test context: A GLOBAL (`*`); B public reset context; record actual)_ |
| Exact non-secret target login(s), Account ID(s), Actor ID(s) | _Enter verified identifiers (targets: Target B login/Account ID; issuer A Actor ID/key)_ |
| Observed behavior, including actual outcomes of critical steps | _Record results in enough detail to establish PASS/FAIL; Issue and consumption event IDs; single-use and session revocation observations_ |
| Non-secret audit event ID(s) and correlation ID(s) | _Enter actual IDs where applicable; otherwise N/A and reason_ |
| Screenshot, terminal output, CI link, or other evidence reference | _Private evidence locator; scrub tokens, secrets, and session values_ |
| Verdict | _PASS / FAIL / N/A — select one_ |
| Defect link or ID | _Enter defect reference if observed; otherwise `None — no defect observed`_ |
| N/A or blocked reason (if applicable) | _Specific reason and prerequisite / approval needed, or `N/A — test executed`_ |
| Retest details (if applicable) | _Retest UTC time, new SHA/environment, corrected defect link, outcome; otherwise N/A_ |

**Do not mark PASS if evidence is missing or a required step was not performed.** A skipped or unauthorized operation must be reported as N/A/blocked with its reason; this does not automatically satisfy a mandatory acceptance gate.


## MT-07 — Human B performs the reverse reset for A

**Operator/role:** Issuer **Human B** in Browser B; recipient **Human A** in Browser C. **Context:** GLOBAL Administration `*` for B.
**Preconditions:** MT-06 passed; A remains signed in Browser A; B has B's recovered password.

**Steps**

1. In Browser A verify A's authenticated Administration page works and leave the session active.
2. In Browser B choose **Authentication**, filter **Authentication Accounts** by **A's exact login**, and verify A's exact Account ID in the matching card.
3. Select **Issue reset token** **once** on **A's card**, not B's.
4. Transfer the newly issued token privately to **A**. In Browser C, use **Reset password** with that token and A's new private replacement password. Submit once. Confirm success and return to Sign in.
5. Refresh Browser A's previously authenticated Administration page; confirm the earlier A session is rejected. Confirm A's former password no longer works and A's recovered password does.
6. Try to redeem the **same** A reset token again in Browser C and confirm refusal. Confirm A's successfully recovered password continues working.
7. Return to Browser B and refresh the protected Administration page; B must remain authenticated.
8. Dispose of the token, browser tab/history, and clipboard copy. Do not record the secret.

**Expected/PASS:** Recovery works in *both* directions with identical single-use, session-revocation, and issuer-attribution guarantees.
**FAIL/block:** B cannot assist A, incorrect account target, token reuse, A's old session remains, or B loses their session.

---

### MT-07 — Execution Record (complete after this test)

| Required field | Actual result / reference |
|---|---|
| Test ID | `MT-07` |
| Execution environment and entry URL / host | _Enter actual LOCAL or Test environment and non-secret URL/host_ |
| UTC started | _YYYY-MM-DD HH:MM:SS UTC_ |
| UTC completed | _YYYY-MM-DD HH:MM:SS UTC_ |
| Human(s) actually operating and role | _Enter names and roles (expected participants: Issuer Human B; recipient Human A)_ |
| Actual Administration / Tenant context shown | _Enter value actually seen (expected test context: B GLOBAL (`*`); A public reset context; record actual)_ |
| Exact non-secret target login(s), Account ID(s), Actor ID(s) | _Enter verified identifiers (targets: Target A login/Account ID; issuer B Actor ID/key)_ |
| Observed behavior, including actual outcomes of critical steps | _Record results in enough detail to establish PASS/FAIL; Issue and consumption event IDs; single-use and session revocation observations_ |
| Non-secret audit event ID(s) and correlation ID(s) | _Enter actual IDs where applicable; otherwise N/A and reason_ |
| Screenshot, terminal output, CI link, or other evidence reference | _Private evidence locator; scrub tokens, secrets, and session values_ |
| Verdict | _PASS / FAIL / N/A — select one_ |
| Defect link or ID | _Enter defect reference if observed; otherwise `None — no defect observed`_ |
| N/A or blocked reason (if applicable) | _Specific reason and prerequisite / approval needed, or `N/A — test executed`_ |
| Retest details (if applicable) | _Retest UTC time, new SHA/environment, corrected defect link, outcome; otherwise N/A_ |

**Do not mark PASS if evidence is missing or a required step was not performed.** A skipped or unauthorized operation must be reported as N/A/blocked with its reason; this does not automatically satisfy a mandatory acceptance gate.


## MT-08 — Audit evidence: offline enrollment, issuer attribution, consumption

**Operator/role:** Existing LOCAL/Test Application Administrator or Human A/B with audit-read authorization. **Context:** GLOBAL `*`.
**Preconditions:** MT-02, MT-06, MT-07 completed. Have non-secret A/B Account IDs and Actor IDs.

**UI-first steps**

1. Sign in as Human A or B and select **Global administration** in the context selector.
2. Navigate using app navigation to **Audit logs** (page heading **Audit Log Viewer**).
3. In **Authenticated authorization context**, set **Selected Tenant ID** to `*` if it is not already `*`.
4. Under **Sensitive event filters**, leave **Operation** at **All sensitive and authorization events**: the current dropdown does **not** contain dedicated menu entries for the new human-enrollment/password-consumption operation names. Set **Target ID** to **B's Account ID**, select the form's filter/apply control, and examine the recent entries (newest first). Record the visible `authentication.password_reset_tokens.issue` and `authentication.password_reset_tokens.consume` event IDs/timestamps if returned.
5. Repeat with **A's Account ID**. Record the same evidence from reverse recovery. If the event list limit/time window does not show all events, do not incorrectly mark them absent; use the **read-only offline-copy inspection below**.
6. Where displayed, verify issuance events refer to the authenticated **issuing** administrator (A issued B; B issued A) and consumption events target the **recipient Account ID**. Consumption is attributed to a public reset-token holder, **not falsely recorded as the issuing human**.

**Read-only copy inspection (only if the UI cannot expose all evidence; recommended at Gate 2):**

7. Create a **private, SQLite-consistent inspection copy** of the selected environment database. For **LOCAL**, in Terminal A run the following while `MT_DB` still points to the isolated database:

   ```bash
   export MT_DIR="$HOME/ers-3367-mt-072a5628"
   export MT_DB="$MT_DIR/isolated.db"
   test -f "$MT_DB" || { echo 'STOP: isolated DB missing'; exit 1; }
   STATUS_DIR="$(mktemp -d "$MT_DIR/audit.XXXXXXXX")"
   chmod 0700 "$STATUS_DIR"
   sqlite3 "$MT_DB" ".backup '$STATUS_DIR/app.db'"
   chmod 0600 "$STATUS_DIR/app.db"
   test "$(sqlite3 "$STATUS_DIR/app.db" 'PRAGMA integrity_check;')" = 'ok' || { echo 'FAIL: invalid inspection copy'; exit 1; }
   ```

   For **deployed Test**, use the exact mounted-volume offline-copy Docker commands included in MT-02, taking a **fresh copy after the recovery tests** (the pre-login copy is stale). Never query, copy, or share the Production live SQLite/WAL files through an unsafe path. All copies require `0600` file and `0700` directory permissions.
8. From the same host with `sqlite3` installed, enter:
   ```bash
   sqlite3 -readonly -header -column "$STATUS_DIR/app.db" "
   SELECT id, occurred_at, account_id, actor_id, actor_scope,
          correlation_id, operation, target_type, target_id, decision, reason
   FROM authz_audit_logs
   WHERE operation IN (
     'authentication.human_admins.offline_enroll',
     'authentication.password_reset_tokens.issue',
     'authentication.password_reset_tokens.consume'
   )
   ORDER BY occurred_at DESC
   LIMIT 60;
   "
   ```
   **No `UPDATE`, `DELETE`, `INSERT`, or trigger changes.** Inspect only data belonging to the Test rehearsal.
9. Confirm **two** `authentication.human_admins.offline_enroll` records, each targeting one enrolled Account ID and attributed to **offline operator evidence** (not a fabricated logged-in session); and a pair of issuance/consumption events for each completed mutual recovery. Compare the recorded approval/operator/backup references to the change ticket.
10. Verify issuer audit attribution (A issued B; B issued A); consumption events target the correct account and carry a nonempty correlation ID. No raw password or secret token may be present in audit output. Record only event IDs and non-secret fields; delete the temporary inspection copy after recording the non-secret evidence: `rm -f "$STATUS_DIR/app.db"; rmdir "$STATUS_DIR"` (only if `STATUS_DIR` is the verified test-specific scratch directory).

**Expected/PASS:** Correct two enrollment events, both distinct grant/identity targets, valid mutual-reset audit records, accurate issuer/recipient attribution, and no secret disclosure.
**FAIL/block:** Missing audit, forged issuer identity, empty audit correlation where required, unexpected account target, or secret leakage. If the UI did not show all records but the approved read-only query did, record **UI limitation** separately rather than marking audit persistence failed.

---

### MT-08 — Execution Record (complete after this test)

| Required field | Actual result / reference |
|---|---|
| Test ID | `MT-08` |
| Execution environment and entry URL / host | _Enter actual LOCAL or Test environment and non-secret URL/host_ |
| UTC started | _YYYY-MM-DD HH:MM:SS UTC_ |
| UTC completed | _YYYY-MM-DD HH:MM:SS UTC_ |
| Human(s) actually operating and role | _Enter names and roles (expected participants: Human with audit-read authorization)_ |
| Actual Administration / Tenant context shown | _Enter value actually seen (expected test context: Global administration (`*`) and approved read-only LOCAL/Test DB copy)_ |
| Exact non-secret target login(s), Account ID(s), Actor ID(s) | _Enter verified identifiers (targets: A and B Account IDs / enrollment audit targets)_ |
| Observed behavior, including actual outcomes of critical steps | _Record results in enough detail to establish PASS/FAIL; Enrollment, reset issuance/consumption event IDs; correlation IDs (non-secret)_ |
| Non-secret audit event ID(s) and correlation ID(s) | _Enter actual IDs where applicable; otherwise N/A and reason_ |
| Screenshot, terminal output, CI link, or other evidence reference | _Private evidence locator; scrub tokens, secrets, and session values_ |
| Verdict | _PASS / FAIL / N/A — select one_ |
| Defect link or ID | _Enter defect reference if observed; otherwise `None — no defect observed`_ |
| N/A or blocked reason (if applicable) | _Specific reason and prerequisite / approval needed, or `N/A — test executed`_ |
| Retest details (if applicable) | _Retest UTC time, new SHA/environment, corrected defect link, outcome; otherwise N/A_ |

**Do not mark PASS if evidence is missing or a required step was not performed.** A skipped or unauthorized operation must be reported as N/A/blocked with its reason; this does not automatically satisfy a mandatory acceptance gate.


## MT-09 — Independent 1Password access, no shared credentials

**Operator/role:** Actual **Human A** and then actual **Human B**, each separately. **Context:** Authorized deployed Test 1Password vault(s); Production vault(s) later at the Production gate. **LOCAL-only note:** This test is not satisfied merely by a LOCAL SQLite rehearsal; record `N/A — deployed Test 1Password acceptance pending` until both authorized humans have actually verified their Test vault access. Do not use Production credentials for a LOCAL rehearsal.
**Preconditions:** The approved access matrix specifies environment vault name(s), allowed item identifier(s), allowed deployment service-account scope, and which administrator has which access.

**Steps**

1. Human A opens **1Password** and signs in with **A's own 1Password identity/MFA**. Do not use B's login, shared human credential, or an automation service-account token.
2. A selects the exact approved **Test** vault; locates the item by its recorded name; confirms it is accessible and sufficient for A's assigned operational recovery duty. **Do not copy or show secret values in evidence.**
3. Record A's 1Password identity (non-secret identifier), vault/item names, timestamp, and access result. Sign out/lock A's vault.
4. Human B independently opens 1Password with B's **own identity/MFA**; repeats the same documented access verification for B's assigned Test vault items. Record result; sign out/lock.
5. The deployment operator cross-checks the environment-specific deployment service-account permissions against the approved scope. A Test deployment credential must **not** grant Production secrets access by accident.
6. Confirm that any older **LastPass** references in the recovery runbook/ops configuration have a documented accepted disposition. **Do not claim 1Password readiness merely from passing a LastPass-oriented check.**
7. Later at the authorized Production gate, repeat under Production vaults with separate Production access records—**do not test Production by copying secrets into Test or LOCAL**.

**Expected/PASS:** Both humans can independently access their approved material without sharing their identity, secrets or MFA; environment separation preserved.
**FAIL/block:** One human depends on the other's credentials; missing material; excessive scope; expired service access; or unresolved LastPass/1Password documentation/process conflict.

---

### MT-09 — Execution Record (complete after this test)

| Required field | Actual result / reference |
|---|---|
| Test ID | `MT-09` |
| Execution environment and entry URL / host | _Enter actual LOCAL or Test environment and non-secret URL/host_ |
| UTC started | _YYYY-MM-DD HH:MM:SS UTC_ |
| UTC completed | _YYYY-MM-DD HH:MM:SS UTC_ |
| Human(s) actually operating and role | _Enter names and roles (expected participants: Actual Human A and Human B individually)_ |
| Actual Administration / Tenant context shown | _Enter value actually seen (expected test context: 1Password Test vaults; no ERS Tenant context)_ |
| Exact non-secret target login(s), Account ID(s), Actor ID(s) | _Enter verified identifiers (targets: A/B 1Password identities, approved Test vault/item identifiers)_ |
| Observed behavior, including actual outcomes of critical steps | _Record results in enough detail to establish PASS/FAIL; Independent access verification; environment separation evidence (no secrets)_ |
| Non-secret audit event ID(s) and correlation ID(s) | _Enter actual IDs where applicable; otherwise N/A and reason_ |
| Screenshot, terminal output, CI link, or other evidence reference | _Private evidence locator; scrub tokens, secrets, and session values_ |
| Verdict | _PASS / FAIL / N/A — select one_ |
| Defect link or ID | _Enter defect reference if observed; otherwise `None — no defect observed`_ |
| N/A or blocked reason (if applicable) | _Specific reason and prerequisite / approval needed, or `N/A — test executed`_ |
| Retest details (if applicable) | _Retest UTC time, new SHA/environment, corrected defect link, outcome; otherwise N/A_ |

**Do not mark PASS if evidence is missing or a required step was not performed.** A skipped or unauthorized operation must be reported as N/A/blocked with its reason; this does not automatically satisfy a mandatory acceptance gate.


## MT-10 — Preserve existing automation administrator and refuse unsafe self-action

**Operator/role:** Human A and/or an existing authorized LOCAL or Test Application Administrator. **Context:** GLOBAL `*` in the chosen test environment.
**Preconditions:** MT-01 captured any existing Test automation administrator login/Account ID/Actor key, and MT-05 already checked disabled self-security-suspension.

**Steps**

1. In Browser A open **Authentication Accounts** under GLOBAL Administration. Clear the filter, then search the **pre-existing** automation administrator login from the chosen LOCAL/Test environment. Confirm the account still exists with its original Account ID, active status, and canonical Actor binding. **Do not suspend or issue a reset token for it.**
2. Open **Authorization**, filter by that existing actor key, and confirm the original authorization grant(s) have not disappeared or been replaced by A/B's grants. Record IDs and role scopes.
3. Return to A's own Authentication Account card and verify the **Security suspend** action remains disabled for the signed-in Account. Repeat in B's own profile for B. **Do not attempt role revocation or deactivation against live Test or Production to prove final-admin safety.**
4. On disposable LOCAL/Test databases only, confirm the passing Go regression suite includes duplicate login/actor refusal, create-only replay refusal, forced second-audit failure atomic rollback, and final-administrator protection. The intentionally induced database errors in those passing tests are expected negative-case evidence.
5. Compare the chosen LOCAL/Test before/after baseline. Any pre-existing automation administrator must retain its original Account ID, Actor ID, and authorization grants.

**Expected/PASS:** Existing automation admin preserved, A/B self-suspend disabled, unsafe operations refused by passing regressions.
**FAIL/block:** Existing admin changed or disabled, new A/B account linked to automation actor, self-suspend enabled, or any failed final-admin regression.

---

### MT-10 — Execution Record (complete after this test)

| Required field | Actual result / reference |
|---|---|
| Test ID | `MT-10` |
| Execution environment and entry URL / host | _Enter actual LOCAL or Test environment and non-secret URL/host_ |
| UTC started | _YYYY-MM-DD HH:MM:SS UTC_ |
| UTC completed | _YYYY-MM-DD HH:MM:SS UTC_ |
| Human(s) actually operating and role | _Enter names and roles (expected participants: Human A and/or existing Test Application Administrator)_ |
| Actual Administration / Tenant context shown | _Enter value actually seen (expected test context: Global administration (`*`) — record actually displayed)_ |
| Exact non-secret target login(s), Account ID(s), Actor ID(s) | _Enter verified identifiers (targets: Existing automation admin ID/key; A/B accounts as applicable)_ |
| Observed behavior, including actual outcomes of critical steps | _Record results in enough detail to establish PASS/FAIL; Preserved actor/grant and disabled self-suspend evidence_ |
| Non-secret audit event ID(s) and correlation ID(s) | _Enter actual IDs where applicable; otherwise N/A and reason_ |
| Screenshot, terminal output, CI link, or other evidence reference | _Private evidence locator; scrub tokens, secrets, and session values_ |
| Verdict | _PASS / FAIL / N/A — select one_ |
| Defect link or ID | _Enter defect reference if observed; otherwise `None — no defect observed`_ |
| N/A or blocked reason (if applicable) | _Specific reason and prerequisite / approval needed, or `N/A — test executed`_ |
| Retest details (if applicable) | _Retest UTC time, new SHA/environment, corrected defect link, outcome; otherwise N/A_ |

**Do not mark PASS if evidence is missing or a required step was not performed.** A skipped or unauthorized operation must be reported as N/A/blocked with its reason; this does not automatically satisfy a mandatory acceptance gate.


## MT-11 — Repeatable release-state verification, cleanup, and sign-off

**Operator/role:** LOCAL test operator or deployed Test release operator plus both human administrators. **Context:** GLOBAL `*` in the chosen LOCAL isolated or deployed Test environment; no Production database modifications.

**Steps**

1. After MT-03–MT-10, confirm Human A and Human B can **separately sign in again** with their latest changed/recovered passwords, without issuing additional reset tokens. Each must open **Authentication** and **Authorization** under GLOBAL `*`.
2. Create a **fresh** private, SQLite-consistent inspection copy after all password changes. In **LOCAL Terminal A**, confirm `MT_DB`, `ACTOR_A`, and `ACTOR_B` (set during MT-02) are defined, then run:
   ```bash
   export MT_DIR="$HOME/ers-3367-mt-072a5628"
   export MT_DB="$MT_DIR/isolated.db"
   # Actor keys must equal the two actual values recorded at MT-02; never guess or reset to examples.
   # If this is a new terminal, explicitly export the exact non-secret keys from the MT-02 record first.
   : "${ACTOR_A:?STOP: set ACTOR_A to the exact MT-02 actor key}"
   : "${ACTOR_B:?STOP: set ACTOR_B to the exact MT-02 actor key}"
   test "$ACTOR_A" != "$ACTOR_B" || { echo 'STOP: actor keys must differ'; exit 1; }
   STATUS_DIR="$(mktemp -d "$MT_DIR/final-status.XXXXXXXX")"
   chmod 0700 "$STATUS_DIR"
   sqlite3 "$MT_DB" ".backup '$STATUS_DIR/app.db'"
   chmod 0600 "$STATUS_DIR/app.db"
   python3 -B scripts/ers-two-human-admin-status.py \
     --db "$STATUS_DIR/app.db" --actor-key "$ACTOR_A" --actor-key "$ACTOR_B"
   rm -f "$STATUS_DIR/app.db"
   rmdir "$STATUS_DIR"
   ```
   For **deployed Test**, use the complete, earlier MT-02 offline-copy procedure with a **new** private copy; do not reuse the pre-login snapshot.
   **Create a fresh consistent copy after the password changes.** Verify `ready=true`, `usable=true` twice, distinct IDs, and now `mustChangePassword=false` for both. Delete the copied DB and temporary directory securely after recording the non-secret result. Do not reuse the pre-login snapshot.
3. With the Test service restored, run:
   ```bash
   docker ps -a --filter 'name=ers-3367-' --format '{{.ID}} {{.Names}}'
   ```
   Expected: **no rows** for test-created enrollment/status containers. If a named test container remains, stop/remove only that **recorded container ID**, not unrelated containers or deployment services.
4. If a **temporary** Test/LOCAL backend was created solely for this test and is no longer needed, stop that exact container/process and verify port 8080 is free:
   ```bash
   lsof -nP -iTCP:8080 -sTCP:LISTEN
   ```
   Expected: no listener **only if** the temporary test backend is supposed to be stopped. If the shared Test deployment intentionally remains running, its port listener is expected and **must not be killed**.
5. Confirm private temporary SQLite files and token-bearing Browser C tabs/history/clipboard are cleaned according to policy. Confirm no credentials, token values, or Production secrets entered logs, screenshots or Git.
6. Record all case verdicts, Test deployment SHA/image ID, backup verification, restore/rehearsal references, 1Password access evidence, unresolved discrepancies, and both human sign-offs.

**Expected/PASS:** Both humans usable with no forced password change pending; test artifacts cleaned; deployment remains healthy; release evidence complete.
**FAIL/block:** Any administrator unusable, missing required evidence, leftover Test container/secret, or cleanup that could destroy unrelated operational state.

---

### MT-11 — Required LOCAL cleanup / teardown (complete before recording PASS)

1. After both administrators have completed MT-11 independent re-login/status checks, stop **Terminal B** backend (Ctrl+C). Stop Terminal C frontend (Ctrl+C) if created exclusively for this rehearsal. Confirm `lsof -nP -iTCP:8080 -sTCP:LISTEN` shows no leftover ERS listener (also inspect 5173 if you stopped the frontend). Do not kill unrelated listeners.
2. No Docker container was created by this LOCAL procedure; nevertheless, if Docker is running, check `docker ps -a --filter 'name=ers-3367-' --format '{{.ID}} {{.Names}}'`. Only remove an **identified, test-created** ERS 33.6.7 container left behind from another test; leave unrelated containers alone.
3. Preserve the isolated DB while testing or investigating failures. Once complete, record final test verdicts and the evidence references **without copying the SQLite database into Git, tickets, or chat**.
4. When you explicitly decide to discard the isolated data, run from the repository root:

   ```bash
   MT_DIR="$HOME/ers-3367-mt-072a5628"
   test "$MT_DIR" = "$HOME/ers-3367-mt-072a5628" || { echo 'STOP: unexpected directory'; exit 1; }
   ls -la "$MT_DIR"
   # ONLY after confirming no test process still uses this database and you no longer need evidence:
   rm -f "$MT_DIR/isolated.db" "$MT_DIR/isolated.db-wal" "$MT_DIR/isolated.db-shm" "$MT_DIR/isolated.db-journal"
   rm -f "$MT_DIR/pre-enrollment.db" "$MT_DIR/pre-enrollment.db-wal" "$MT_DIR/pre-enrollment.db-shm" "$MT_DIR/pre-enrollment.db-journal"
   rmdir "$MT_DIR"
   ```

   This removes **only** the specifically named disposable test files; never run these commands against the normal LOCAL database. Follow your organization's secure storage/deletion practice when disposing of credential-bearing SQLite copies.
5. Restore normal LOCAL operation using your ordinary `make local-backend` process **without** the temporary `ERS_DATABASE_PATH` override. Verify its startup `DATABASE_PATH` once more matches your original normal LOCAL database.



### MT-11 — Execution Record (complete after this test)

| Required field | Actual result / reference |
|---|---|
| Test ID | `MT-11` |
| Execution environment and entry URL / host | _Enter actual LOCAL or Test environment and non-secret URL/host_ |
| UTC started | _YYYY-MM-DD HH:MM:SS UTC_ |
| UTC completed | _YYYY-MM-DD HH:MM:SS UTC_ |
| Human(s) actually operating and role | _Enter names and roles (expected participants: Test release operator; both humans individually)_ |
| Actual Administration / Tenant context shown | _Enter value actually seen (expected test context: selected LOCAL/Test Global administration (`*`) and cleanup host)_ |
| Exact non-secret target login(s), Account ID(s), Actor ID(s) | _Enter verified identifiers (targets: A/B Account IDs; Test image/container/volume IDs)_ |
| Observed behavior, including actual outcomes of critical steps | _Record results in enough detail to establish PASS/FAIL; Independent final login, status, cleanup, and sign-off evidence_ |
| Non-secret audit event ID(s) and correlation ID(s) | _Enter actual IDs where applicable; otherwise N/A and reason_ |
| Screenshot, terminal output, CI link, or other evidence reference | _Private evidence locator; scrub tokens, secrets, and session values_ |
| Verdict | _PASS / FAIL / N/A — select one_ |
| Defect link or ID | _Enter defect reference if observed; otherwise `None — no defect observed`_ |
| N/A or blocked reason (if applicable) | _Specific reason and prerequisite / approval needed, or `N/A — test executed`_ |
| Retest details (if applicable) | _Retest UTC time, new SHA/environment, corrected defect link, outcome; otherwise N/A_ |

**Do not mark PASS if evidence is missing or a required step was not performed.** A skipped or unauthorized operation must be reported as N/A/blocked with its reason; this does not automatically satisfy a mandatory acceptance gate.


## E. Production acceptance — separate gate, not a feature-branch manual test

**Production enrollment is not a LOCAL manual test. Use a separately approved Production maintenance procedure and change record. Do not execute this section until branch 994 has been merged through the approved Bite 33.6 hierarchy and the exact accepted software has been promoted to Test and subsequently approved for Production.** Use the [Production Operational Runbook](production-operational-runbook.md) for the complete guarded Production steps, not an invented shortcut.

**Required Production operator checks before enrollment ([Production Operational Runbook](production-operational-runbook.md) Gate 3):** named change approval; accepted release/image ID; two distinct human administrators; individually verified Production 1Password access; verified Production backup and **Hetzner S3** off-host evidence; independent isolated-restore/rehearsal evidence; migration integrity; RPO ≤ 24 hours and RTO ≤ 4 hours; documented risk acceptance; resolved LastPass/1Password references; stopped Production writers; inspected correct Production volume; explicit Production enrollment confirmation. Enrollment is once, offline, create-only and transactional. **Never run E2E provisioning or bypass bootstrap controls in Production.**

**Human acceptance after Production restarts:** Re-execute **MT-03 through MT-09** with the *two actual Production human identities* and individual approved Production browsers; use Production-only passwords and 1Password items. Repeat the read-only verification and audit checks without copying a Production database to an untrusted LOCAL host. **Do not repeat MT-02** on already enrolled Production identities. A/B mutual resets are real credential-changing operations and require an approved Production acceptance window and coordination; if not authorized, record this Production test as blocked and do not claim acceptance. Verify pre-existing Production automation administrator access remains unchanged. Obtain operational sign-off and record the accepted simultaneous-administrator-unavailability risk.

---

## F. Promotion decision / checklist

**Source of truth:** Complete all twelve MT execution forms above, including N/A reasons. This summary is a sign-off index only and is **not a substitute for each test execution record**. Where MT-01/MT-02 are N/A because Test enrollment has already occurred, cite earlier enrollment evidence. Where a later mandatory release-gate test is pending, label it **BLOCKED / NOT YET ACCEPTED** rather than PASS.

Mark after execution:

- [ ] MT-00 — branch `994` at **actual documentation-commit SHA**, LOCAL and CI accepted (source ZIP baseline: `072a5628…`).
- [ ] MT-01 — no Test identity/actor collision (or **N/A: already enrolled**, with evidence).
- [ ] MT-02 — one-time isolated Test enrollment/verification (or **N/A: already enrolled**, with evidence).
- [ ] MT-03 — Human A forced change and independent GLOBAL sign-in.
- [ ] MT-04 — Human B forced change and independent GLOBAL sign-in.
- [ ] MT-05 — canonical grants and self-suspend safeguards.
- [ ] MT-06 — A issues/reset for B; single-use and session revocation.
- [ ] MT-07 — B issues/reset for A; single-use and session revocation.
- [ ] MT-08 — accurate enrollment/issuance/consumption audit, read-only evidence.
- [ ] MT-09 — A/B individual 1Password authorization and environment isolation.
- [ ] MT-10 — existing automation admin preserved; negative regression evidence.
- [ ] MT-11 — independent re-login, latest status, and Docker/secret cleanup.
- [ ] **Branch promotion:** review all applicable manual results; merge to `945` only under approved branch hierarchy. No unfinished Gate C branches.
- [ ] **Test-to-Production gate:** [Production Operational Runbook](production-operational-runbook.md) Gates 2 and 3 approved at exact promoted SHA, with complete backup/off-host/restore evidence.
- [ ] **Production launch gate:** [Production Operational Runbook](production-operational-runbook.md) Gate 4 completed by actual A and B, Production mutual recovery verified if authorized, 1Password verified, accepted risk signed, remaining defects closed.

**Promotion-blocking conditions:** inconsistent branch/SHA or CI; inability to enroll two distinct accounts atomically; any non-canonical or Tenant-scoped administrator identity; skipped forced password change; one administrator cannot operate independently; reset token reuse, non-revoked sessions or wrong-account resets; missing or incorrect audit; existing automation admin changed; inadequate 1Password access; missing verified backup/restore evidence; unauthorized Production test; incomplete Docker cleanup; secret disclosure; or any unresolved FAIL.

## G. Glossary impact

**None.** This file is a manual acceptance checklist; it does not change Bite 33.6.7's agreed domain model. Retain the **ADD** definitions in [Implementation and Architecture](implementation-and-architecture.md) for **Mutual Administrator Account Recovery**, **Two-Human Administrator Launch Model**, and the deferred **Offline Emergency Administrator Recovery**.
