# Bite 33.6.7 — Manual Acceptance Test Suite

**Manual revision marker: MT3367-ONE-PATH-20261027-ZSH-SAFE-LABELS**
**Revision:** replacement for previous copy-based and partial-rebuild MT manuals; branch `994-bite-3367-two-human-administrators`, source HEAD `13bca9059e477e4a3eba96b5d778091d8cee9f5e`
**Issue:** #945 — Two Human Application Administrators
**Owner:** named ERS test operator; the two enrolled humans perform their own interactive account tests
**Primary execution path:** a **fresh disposable LOCAL SQLite database** on macOS, with no existing ERS Application Administrator credential required.
**Secondary path:** a separately approved deployed Test rehearsal, with its own enrollment and access evidence. **Production is not a test target.**
**Other documents:** [Implementation and Architecture](implementation-and-architecture.md) (technical rationale); [Production Operational Runbook](production-operational-runbook.md) (actual approved Production operations). Neither must be consulted for *LOCAL manual execution*.

## Read this once: test contract and boundaries

**Command block convention (interactive macOS/zsh safe):** Every executable command is in a `zsh` fenced command box whose **first line is a quoted terminal-identification annotation**, such as `: '# Terminal A (macOS/zsh, repository root) - MT-00'`. The `:` built-in does nothing; the quoted `# Terminal ...` identifies where to paste the commands. This form works even when interactive zsh has not enabled `INTERACTIVE_COMMENTS`. Copy the entire block, including its first line, into the named terminal only. Do **not** replace the first line with an unquoted `# Terminal ...`, because interactive zsh may interpret it as a command. Blocks labeled `text` show **expected output** and must **not** be run. Terminal A is the repository-root operator window; Terminal B hosts the backend; Terminal C hosts the frontend. Commands are not supplied separately in chat.

**The *only* LOCAL test manual is this file at `docs/bite-3367/manual-acceptance-tests.md`, bearing revision marker `MT3367-ONE-PATH-20261027-ZSH-SAFE-LABELS`.** Earlier copies titled `Part 1C: Create and migrate the disposable copy`, any commands containing `NORMAL_DB`, and the `~/ers-3367-mt-072a5628` location are **superseded and must not be followed**. The rebuilt procedure has **no copy-from-normal-database step**. After applying the documentation patch, verify the revision marker in MT-00 before executing MT-01. Do not mix documents or chat snippets. This file replaces them. Each MT case below contains its own starting state, non-secret variable definitions when commands use variables, actions, precise outputs, completion state, blocking conditions, and execution record. The transition audit at the end verifies the *whole sequence*. A skipped mandatory test is **BLOCKED**; an explicitly inapplicable subcheck is **N/A with reason**, not PASS.

**One LOCAL run and one database:** `~/ers-3367-acceptance-13bca905/isolated.db` (shown below as `$MT_DB`). This is **new and disposable**; do **not** copy, reset, or migrate your everyday LOCAL database. This path is intentionally new to avoid the previously used `ers-3367-mt-072a5628` directory. If the new path already exists, **STOP and inspect it**—never overwrite or blindly rerun enrollment. No E2E provisioner, bootstrap access, Production database, or Production password is used.

**Fixed non-secret LOCAL identifiers (no interactive identity-variable prompts, no cross-terminal state):**

| Identity | Login | Actor key | Display name |
|---|---|---|---|
| Human A (LOCAL rehearsal) | `ers3367.a@local.invalid` | `ers3367-local-human-a` | `ERS 33.6.7 LOCAL Human A` |
| Human B (LOCAL rehearsal) | `ers3367.b@local.invalid` | `ers3367-local-human-b` | `ERS 33.6.7 LOCAL Human B` |

These identifiers are exclusively for the **isolated LOCAL** rehearsal. In MT-02 type them **exactly** when the credential input program prompts. Initial passwords are two distinct, private 12–72-byte values and are never put into this document, shell variables, logs, Git, tickets, or screenshots. Each human controls their own credential. Real Test/Production identities require separately approved identifiers; never reuse these LOCAL logins as real addresses.

**Terminals and browsers:** **Open Terminal A (your macOS Terminal/zsh window) at the ERS repository root before MT-00. Run *every* MT-00, MT-01 and MT-02 command in Terminal A.** Do not use Terminal B or Terminal C during database preparation or offline enrollment. Terminal A = the one macOS Terminal/zsh window at the repository root for short commands; Terminal B = dedicated backend window **only from MT-03 onward**; Terminal C = dedicated frontend window **only from MT-03 onward**. Browser A and Browser B must use **different browser profiles** (not just two tabs of one profile), each operated by its respective human. Browser C is a distinct unauthenticated profile for one-time resets. Set locale to `en-US` when checking labels. The browser LOCAL entry URL is `http://localhost:5173`; deployed Test and Production always use HTTPS.

**No destructive surprises:** `rm`, schema alteration, `ERS_RESET_DATABASE=true`, Production confirmation, Docker-volume deletion, and `git reset --hard` are **never** part of routine tests. MT-11 explicitly distinguishes stopping processes from optional later disposal of the dedicated database. Never stop or remove unrelated Docker containers or port listeners. During token tests never photograph, transmit via chat, record, or persist token values.

**Known limits of the delivery-time verification:** Source inspection, static shell checks, a full fresh-SQL-migration execution and a schema-level rollback/replay/status *simulation* were run. An actual Go 1.26.2 LOCAL binary, actual zsh-on-macOS, browser UI, 1Password accounts, Docker Test deployment, and Production recovery **were not executable in the authoring container**. These are **not** reported as passed by this document; the named human operators must execute/record them.

### Sequence and state contract (do not jump forward)

| Test | Entry condition | Exit condition needed by next case |
|---|---|---|
| MT-00 | Repository checkout available | Correct branch and passing checks recorded; no acceptance DB touched |
| MT-01 | Test backend stopped, fresh path absent | 76 migrations and clean catalog; 0 accounts / collisions; database offline |
| MT-02 | MT-01 PASS, backend stopped | One atomic enrollment; two usable GLOBAL accounts, first password changes pending; backend stopped |
| MT-03 | MT-02 PASS | Backend and frontend confirmed on isolated DB; A changed password and reauthenticated |
| MT-04 | MT-03 PASS | B changed password and reauthenticated in separate profile; A still signed in |
| MT-05 | MT-04 PASS | Canonical grants confirmed; A/B sessions remain usable |
| MT-06 | MT-05 PASS | A issued token to B; B redeemed once; B reauthenticated; A unaffected |
| MT-07 | MT-06 PASS | B issued token to A; A redeemed once; A reauthenticated; B unaffected |
| MT-08 | MT-07 PASS | Audit evidence verified on fresh read-only snapshot; both sessions usable |
| MT-09 | MT-08 PASS | LOCAL subcheck N/A with reason; Test vault acceptance only after actual human verification |
| MT-10 | MT-09 recorded | Existing-admin preservation subcheck N/A if clean DB; A/B self-action constraints verified |
| MT-11 | MT-10 recorded | Independent final checks; evidence signed; only test-created processes stopped; data retained until explicit disposal |

**State recovery rule:** If a test FAILS, stop at that test and preserve the database and evidence. Do not skip ahead or re-enroll. In particular, after an uncertain MT-02 result, inspect the existing accounts with the read-only status tool; do not repeat the create-only command. If you have previously enrolled A/B on this exact disposable DB, MT-01/02 **must not be replayed**: cite that earlier successful evidence and resume at MT-03. For a fresh full run create a *new, separately named* disposable directory under an approved procedure; do not delete evidence merely to make the test pass.

**Acceptance record timestamps:** At the start and end of **each MT case**, execute the timestamp command block located **within that test** in Terminal A; copy the printed UTC value into its execution record. Do not estimate timestamps or depend on another test's shell state.

---

## MT-00 — Branch, test baseline, toolchain and LOCAL isolation

**Operator:** named LOCAL test operator (not an authenticated ERS user). **Context:** repository and host; Administration context N/A. **Initial process state:** do not start anything in this test. **Database:** no test DB is created in MT-00. **Credentials:** none. **Shell variables:** no prior variables required.

**Start timestamp — Terminal A:** Record the following UTC value before beginning MT-00.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-00 START UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

1. In **Terminal A**, open the repository root. Verify you are reading the *new* on-disk manual (not an older downloaded copy), then check the branch. Run:

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-00 command block'
   if grep -Fq "**Manual revision marker: MT3367-ONE-PATH-20261027-ZSH-SAFE-LABELS**" docs/bite-3367/manual-acceptance-tests.md; then
     echo "PASS: authoritative manual revision MT3367-ONE-PATH-20261027-ZSH-SAFE-LABELS"
   else
     echo "STOP: outdated manual. Do not execute MT-01. Apply the replacement documentation patch first."
   fi
   pwd
   git branch --show-current
   git rev-parse HEAD
   git status --short
   ```

   **Expected:** `PASS: authoritative manual revision MT3367-ONE-PATH-20261027-ZSH-SAFE-LABELS`, and current branch is `994-bite-3367-two-human-administrators`. If `STOP` prints, **end MT-00 here** (do not continue to MT-01); before this documentation patch is committed, HEAD is `13bca9059e477e4a3eba96b5d778091d8cee9f5e`. After committing this patch, HEAD necessarily changes: record the new SHA and confirm CI for **that** SHA. `git status --short` must be empty for clean-run acceptance. Do not reset work to force cleanliness.

2. Verify required LOCAL programs (do not install anything in this test):

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-00 command block'
   for name in zsh python3 sqlite3 go node npm lsof; do
     if command -v "$name" >/dev/null 2>&1; then
       printf 'PASS: %s available\n' "$name"
     else
       printf 'FAIL: %s unavailable\n' "$name"
     fi
   done
   go version
   ```

   **Expected:** seven `PASS` messages and Go **1.26.2 or the repository-compatible version**. If any program is missing, mark MT-00 BLOCKED; do not improvise a SQLite substitute on your Mac.

3. In Terminal A run standard regression gates from the exact checked-out commit; do not run this on Production:

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-00 command block'
   make two-human-administrators-check
   make promotion-readiness-check
   make local-check
   ```

   **Expected:** all exit 0. Record the actual commit SHA and corresponding **CI job URL / green result**. If a gate fails, stop before MT-01; save non-secret log excerpts.

4. Inspect port 8080 before MT-01 (do not stop anything automatically):

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-00 command block'
   lsof -nP -iTCP:8080 -sTCP:LISTEN
   ```

   **Expected:** no rows. If another backend listens, identify it and stop it through its own terminal first; repeat until no rows. Do not kill unrelated services. Record any findings.

5. **Terminal A — optional read-only Docker inventory.** Do not start Docker merely for this test. Execute this command block only as written; it does not stop or remove containers.

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-00 optional Docker inventory'
   if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
     MT_CONTAINERS="$(docker ps -a --filter 'name=ers-3367-' --format '{{.ID}} {{.Names}}')"
     if [ -n "$MT_CONTAINERS" ]; then
       printf '%s\n' "$MT_CONTAINERS"
       echo 'STOP: ERS 33.6.7 containers present; investigate ownership before MT-01'
     else
       echo 'PASS: no ERS 33.6.7 test containers present'
     fi
   else
     echo 'N/A: Docker unavailable or stopped; no Docker containers are required for LOCAL MT-00'
   fi
   ```

   **Expected:** `PASS: no ERS 33.6.7 test containers present`, or explicit `N/A` if Docker is unavailable/stopped. If `STOP` appears, resolve ownership and repeat the check before MT-01. Never stop unrelated containers.

**Exit state:** no backend listening on 8080; repository baseline, toolchain and green tests/CI recorded. **PASS:** all checks met. **BLOCKED/FAIL:** missing tool, wrong branch, unexplained dirty tree, failed gate, unknown process, or unverified CI. **No test data or cleanup created by MT-00.**

**End timestamp — Terminal A:** After completing MT-00 actions and checking the exit state, record this UTC value.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-00 END UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

### MT-00 — Individual execution record (complete immediately after test)

| Required evidence field | Actual value (fill in; do not leave blank) |
|---|---|
| Test ID / environment | `MT-00` / `LOCAL isolated` or explicit separately approved Test |
| UTC start / UTC end (from this test’s Terminal A timestamp blocks) | _Start: ... / End: ..._ |
| Actual operator/human and role | _Non-secret identity; A/B/operator as applicable_ |
| Administration / Tenant context actually shown | _GLOBAL `*`, unauthenticated, offline N/A, 1Password, etc. — record observed_ |
| Exact non-secret A/B login, Account IDs, Actor IDs, or affected resource | _Values; or N/A with reason_ |
| Process state and DB path BEFORE / AFTER | _Expected vs observed listener, database, session and shell-state transition_ |
| Actual terminal/UI outputs, including failures | _Record exact relevant PASS/FAIL strings and UI behavior_ |
| Non-secret audit event ID / correlation | _Actual event ID / correlation, or N/A and reason; never token_ |
| Screenshot, CI, log or private evidence reference | _Exact private locator; redact credentials and tokens_ |
| Verdict (PASS / FAIL / BLOCKED / N/A) | _Choose one; N/A reason is mandatory_ |
| Defect link / fix SHA / retest time | _Actual reference or None — no defect observed_ |

**A case is not PASS until its exit state and evidence have been confirmed.**

## MT-01 — Prepare and verify the completely isolated, clean LOCAL database

**Operator:** named LOCAL test operator. **Context:** offline LOCAL database maintenance; no ERS UI or admin login. **Starting state:** MT-00 PASS, no backend writer/listener on 8080, repository root open in Terminal A. **Credentials:** no ERS password or existing admin is needed. **Shell variables:** initialized *below in this test*; no previous exports assumed. **Database:** a new file at `~/ers-3367-acceptance-13bca905/isolated.db`, never your normal `backend/data/app.db`.

**Terminal assignment for the entire test:** Terminal A only, in the ERS repository root, macOS **zsh**. **Terminal B and Terminal C must remain unused and the backend/frontend stopped throughout MT-01.** The four blocks below are independent: each defines its own database path. **Execute steps 1, 2, 3, 4 in order, exactly once; do not skip any step.** Do not use the obsolete `Part 1C` instruction that copies `$NORMAL_DB`.

**Start timestamp — Terminal A:** Record the following UTC value before beginning MT-01.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-01 START UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

1. **Terminal A — preflight: check the directory and stopped backend.** Copy the complete block (including parentheses). The parentheses create a short-lived subprocess: an `exit 1` stops this block **without closing Terminal A**. If `STOP` prints, **do not execute step 2**.

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-01 command block'
   (
     set -e
     MT_DIR="$HOME/ers-3367-acceptance-13bca905"
     MT_DB="$MT_DIR/isolated.db"
     printf 'TEST DIRECTORY: %s\nTEST DATABASE: %s\n' "$MT_DIR" "$MT_DB"
     if [ -e "$MT_DIR" ]; then
       echo 'STOP: acceptance directory already exists; preserve it and inspect its state.'
       exit 1
     fi
     if lsof -nP -iTCP:8080 -sTCP:LISTEN | grep -q .; then
       echo 'STOP: port 8080 has a listener. Identify its owner; do not stop unrelated services.'
       exit 1
     fi
     echo 'PASS: new acceptance directory available; no backend listener on 8080'
   )
   ```

   **Expected:** the directory and database paths both end in `ers-3367-acceptance-13bca905` / `isolated.db`, followed by **exactly** `PASS: new acceptance directory available; no backend listener on 8080`. An existing test directory is not a failure of your normal LOCAL database; it means **this one-time test has been started before**. Do not erase it, copy from it, or rerun migrations/enrollment. Preserve it for state inspection.

2. **Terminal A — create the fresh database from the repository's SQL migrations, never by copying another database.** Run **only after step 1 PASS**; this block refuses an existing directory *again* to prevent an accidental rerun. It requires no `MT_BACKUP`, `NORMAL_DB`, ERS administrator login, or second terminal.

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-01 command block'
   (
     set -e
     umask 077
     MT_DIR="$HOME/ers-3367-acceptance-13bca905"
     MT_DB="$MT_DIR/isolated.db"
     if [ -e "$MT_DIR" ]; then
       echo 'STOP: directory exists. Do not rerun initial database creation.'
       exit 1
     fi
     mkdir -m 700 "$MT_DIR"
     DB_PATH="$MT_DB" MIGRATIONS_DIR="$PWD/backend/migrations" ./scripts/db-migrate.sh
     if [ ! -s "$MT_DB" ]; then
       echo 'FAIL: expected migrated isolated database was not created.'
       exit 1
     fi
     chmod 600 "$MT_DB"
     printf 'PASS: migrated disposable database created at %s\n' "$MT_DB"
   )
   ```

   **Expected:** the migration script displays `Applying migrations to: <your home>/ers-3367-acceptance-13bca905/isolated.db` and `✅ Migrations applied.`, then prints `PASS: migrated disposable database created at .../isolated.db`. The migrations are allowed to print a long list of tables. **If a command fails or a different database path appears, stop MT-01 and preserve the test directory for diagnosis.** Do not rerun the create-once step.

3. **Terminal A — print and assert every database result.** This is an independent block with no reliance on an exported variable from step 1 or step 2.

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-01 command block'
   (
     set -e
     MT_DB="$HOME/ers-3367-acceptance-13bca905/isolated.db"
     if [ ! -s "$MT_DB" ]; then
       echo 'STOP: migrated test database missing or empty'
       exit 1
     fi
     INTEGRITY="$(sqlite3 -bail "$MT_DB" 'PRAGMA integrity_check;')"
     FK="$(sqlite3 -bail "$MT_DB" 'PRAGMA foreign_key_check;')"
     MIGRATIONS="$(sqlite3 -bail "$MT_DB" 'SELECT COUNT(*) FROM schema_migrations;')"
     ROLE="$(sqlite3 -bail "$MT_DB" "SELECT COUNT(*) FROM authz_roles WHERE code='APPLICATION_ADMIN' AND active=1 AND scope_type='APPLICATION';")"
     TRIGGERS="$(sqlite3 -bail "$MT_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name IN ('trg_authz_audit_logs_no_update','trg_authz_audit_logs_no_delete');")"
     ACCOUNTS="$(sqlite3 -bail "$MT_DB" 'SELECT COUNT(*) FROM auth_user_accounts;')"
     ACTORS="$(sqlite3 -bail "$MT_DB" 'SELECT COUNT(*) FROM authz_actors;')"
     printf 'integrity_check=%s\nforeign_key_check=%s\napplied_migrations=%s\napplication_admin_roles=%s\naudit_triggers=%s\naccounts=%s\nactors=%s\n' "$INTEGRITY" "${FK:-<empty>}" "$MIGRATIONS" "$ROLE" "$TRIGGERS" "$ACCOUNTS" "$ACTORS"
     if [ "$INTEGRITY" != ok ] || [ -n "$FK" ] || [ "$MIGRATIONS" != 76 ] || [ "$ROLE" != 1 ] || [ "$TRIGGERS" != 2 ] || [ "$ACCOUNTS" != 0 ] || [ "$ACTORS" != 0 ]; then
       echo 'FAIL: migrated database baseline does not meet the expected values'
       exit 1
     fi
     echo 'PASS: integrity, foreign keys, 76 migrations, role, triggers, zero accounts/actors'
   )
   ```

   **Expected terminal output** (after the exact output lines, with no silently successful checks):

   ```text
   integrity_check=ok
   foreign_key_check=<empty>
   applied_migrations=76
   application_admin_roles=1
   audit_triggers=2
   accounts=0
   actors=0
   PASS: integrity, foreign keys, 76 migrations, role, triggers, zero accounts/actors
   ```

   **Do not proceed on `FAIL` or a nonzero exit status.** An empty foreign-key result is shown explicitly as `<empty>` instead of a blank line.

4. **Terminal A — mandatory read-only collision check for the four fixed test identities.** No administrator UI login or interactive shell-variable prompts are necessary. Keep the backend stopped.

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-01 command block'
   export MT_DB="$HOME/ers-3367-acceptance-13bca905/isolated.db"
   python3 - <<'PYSQL'
   import sqlite3, os
   from pathlib import Path
   from urllib.parse import quote
   p=Path(os.environ['MT_DB']).resolve(strict=True)
   assert p==Path.home()/'ers-3367-acceptance-13bca905'/'isolated.db', 'STOP: wrong DB path'
   uri='file:'+quote(str(p),safe='/')+'?mode=ro'
   expected=[('A login','auth_user_accounts','login','ers3367.a@local.invalid'),
             ('B login','auth_user_accounts','login','ers3367.b@local.invalid'),
             ('A actor key','authz_actors','actor_key','ers3367-local-human-a'),
             ('B actor key','authz_actors','actor_key','ers3367-local-human-b')]
   with sqlite3.connect(uri,uri=True) as conn:
       for label,table,column,value in expected:
           n=conn.execute(f'SELECT COUNT(*) FROM {table} WHERE {column}=? COLLATE NOCASE',(value,)).fetchone()[0]
           print(f'{label}: matches={n}')
           if n: raise SystemExit('FAIL: existing identity collision; STOP before MT-02')
       print('PASS: all four proposed identifiers unused')
   PYSQL
   ```

   **Expected:** `A login: matches=0`, `B login: matches=0`, `A actor key: matches=0`, `B actor key: matches=0`, followed by `PASS: all four proposed identifiers unused`. The Python process must exit with status 0. Any collision, missing table, bad path, or read-only open failure **blocks MT-02**. No identity input from earlier terminals is assumed.

5. Capture non-secret output location, actual database path, UTC start/end, migration count, role and trigger counts in the MT-01 record. **Do not attach the SQLite file or password material.** Keep the backend stopped.

**Exit state to MT-02:** migrated, offline, zero-account disposable database; four proposed keys/logins unused. **PASS:** each explicit expected PASS printed. **FAIL/BLOCK:** existing test directory, bad migration/integrity, identity collision, nonempty account baseline, database writer, or wrong DB path. **Recovery:** inspect/preserve the directory; do not overwrite. No application credentials needed.

**End timestamp — Terminal A:** After completing MT-01 actions and checking the exit state, record this UTC value.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-01 END UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

### MT-01 — Individual execution record (complete immediately after test)

| Required evidence field | Actual value (fill in; do not leave blank) |
|---|---|
| Test ID / environment | `MT-01` / `LOCAL isolated` or explicit separately approved Test |
| UTC start / UTC end (from this test’s Terminal A timestamp blocks) | _Start: ... / End: ..._ |
| Actual operator/human and role | _Non-secret identity; A/B/operator as applicable_ |
| Administration / Tenant context actually shown | _GLOBAL `*`, unauthenticated, offline N/A, 1Password, etc. — record observed_ |
| Exact non-secret A/B login, Account IDs, Actor IDs, or affected resource | _Values; or N/A with reason_ |
| Process state and DB path BEFORE / AFTER | _Expected vs observed listener, database, session and shell-state transition_ |
| Actual terminal/UI outputs, including failures | _Record exact relevant PASS/FAIL strings and UI behavior_ |
| Non-secret audit event ID / correlation | _Actual event ID / correlation, or N/A and reason; never token_ |
| Screenshot, CI, log or private evidence reference | _Exact private locator; redact credentials and tokens_ |
| Verdict (PASS / FAIL / BLOCKED / N/A) | _Choose one; N/A reason is mandatory_ |
| Defect link / fix SHA / retest time | _Actual reference or None — no defect observed_ |

**A case is not PASS until its exit state and evidence have been confirmed.**

## MT-02 — Create-only atomic offline enrollment and immediate verification (LOCAL Path L)

**Operator:** named LOCAL enrollment operator, recording a LOCAL test approval reference. **Context:** offline LOCAL; no ERS UI. **Starting state:** MT-01 PASS, same `~/ers-3367-acceptance-13bca905/isolated.db`, exactly 0 accounts, backend and frontend stopped. **Credentials:** A and B separately choose distinct temporary passwords during the protected prompt; no pre-existing admin credentials. **Shell variables:** all initialized below in this test. **Important:** this test is **one-time** on this database.

**Start timestamp — Terminal A:** Record the following UTC value before beginning MT-02.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-02 START UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

1. **Terminal A — confirm the exact MT-01 output state before enrollment.** This is a safe read-only check. If it prints `STOP`, do **not** execute steps 2 or 3.

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-02 command block'
   (
     set -e
     MT_DIR="$HOME/ers-3367-acceptance-13bca905"
     MT_DB="$MT_DIR/isolated.db"
     MT_BACKUP="$MT_DIR/pre-enrollment.db"
     printf 'Enrollment environment: LOCAL\nDatabase: %s\n' "$MT_DB"
     if [ ! -s "$MT_DB" ]; then
       echo 'STOP: isolated database missing or empty'
       exit 1
     fi
     if [ -e "$MT_BACKUP" ]; then
       echo 'STOP: prior pre-enrollment backup exists; enrollment state may already have changed'
       exit 1
     fi
     if lsof -nP "$MT_DB" | grep -q .; then
       echo 'STOP: database has open file handles; stop only the test-owned writer'
       exit 1
     fi
     if lsof -nP -iTCP:8080 -sTCP:LISTEN | grep -q .; then
       echo 'STOP: port 8080 has a listener; identify it without killing unrelated processes'
       exit 1
     fi
     COUNT="$(sqlite3 -bail "$MT_DB" 'SELECT COUNT(*) FROM auth_user_accounts;')"
     printf 'account_count_before=%s\n' "$COUNT"
     if [ "$COUNT" != 0 ]; then
       echo 'STOP: database already contains accounts; never repeat create-only enrollment'
       exit 1
     fi
     echo 'PASS: stopped backend, zero accounts and no prior backup; enrollment preconditions met'
   )
   ```

   **Expected:** `Enrollment environment: LOCAL`, correct database path, `account_count_before=0`, then `PASS: stopped backend, zero accounts and no prior backup; enrollment preconditions met`. No output from `lsof` is expected. If `STOP` appears, preserve the data and investigate; do not execute enrollment automatically.

2. **Terminal A — take a non-overwriting pre-enrollment backup and verify the exact result.** Execute this block **only after step 1 PASS**.

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-02 command block'
   (
     set -e
     umask 077
     MT_DIR="$HOME/ers-3367-acceptance-13bca905"
     MT_DB="$MT_DIR/isolated.db"
     MT_BACKUP="$MT_DIR/pre-enrollment.db"
     if [ -e "$MT_BACKUP" ]; then
       echo 'STOP: backup already exists; do not overwrite or rerun enrollment'
       exit 1
     fi
     if [ ! -s "$MT_DB" ]; then
       echo 'STOP: source database missing'
       exit 1
     fi
     sqlite3 -bail "$MT_DB" ".backup '$MT_BACKUP'"
     chmod 600 "$MT_BACKUP"
     INTEGRITY="$(sqlite3 -bail "$MT_BACKUP" 'PRAGMA integrity_check;')"
     FK="$(sqlite3 -bail "$MT_BACKUP" 'PRAGMA foreign_key_check;')"
     printf 'backup_integrity_check=%s\nbackup_foreign_key_check=%s\n' "$INTEGRITY" "${FK:-<empty>}"
     if [ "$INTEGRITY" != ok ] || [ -n "$FK" ]; then
       echo 'FAIL: backup integrity or foreign key check'
       exit 1
     fi
     shasum -a 256 "$MT_BACKUP"
     echo 'PASS: private pre-enrollment backup verified; ready for exactly one enrollment'
   )
   ```

   **Expected:** `backup_integrity_check=ok`, `backup_foreign_key_check=<empty>`, a SHA-256 digest for the `pre-enrollment.db` file, and `PASS: private pre-enrollment backup verified; ready for exactly one enrollment`. **If STOP or FAIL appears, do not execute step 3.** This is a LOCAL snapshot, not a Production off-host backup. Record the digest privately in the MT-02 execution record.

3. Exactly **once**, run the guarded Go enrollment program. In Terminal A execute the following **as one pipeline** (not in a second terminal). This does not print or save passwords:

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-02 command block'
   set -o pipefail
   umask 077
   export MT_DB="$HOME/ers-3367-acceptance-13bca905/isolated.db"
   export APPROVAL_REF='LOCAL-MT3367-13BCA905'
   export OPERATOR_REF='LOCAL-MT3367-OPERATOR'
   export BACKUP_REF='LOCAL-MT3367-PREENROLL'
   python3 -B scripts/ers-two-human-admin-input.py | (
     cd backend && APP_ENV=local go run ./cmd/enroll-human-admins \
       --db "$MT_DB" --environment local --offline-confirmed \
       --approval-reference "$APPROVAL_REF" \
       --operator-reference "$OPERATOR_REF" \
       --backup-evidence-reference "$BACKUP_REF"
   )
   ```

   The private prompt **must** be answered in this order, using the exact values:

   | Prompt | First human | Second human |
   |---|---|---|
   | Actor key | `ers3367-local-human-a` | `ers3367-local-human-b` |
   | Display name | `ERS 33.6.7 LOCAL Human A` | `ERS 33.6.7 LOCAL Human B` |
   | Login | `ers3367.a@local.invalid` | `ers3367.b@local.invalid` |
   | Initial password and repeat | Human A enters their own unique secret twice | Human B enters a different unique secret twice |

   **Expected terminal output after prompts:** **exactly two** non-secret lines beginning `enrolled login=... actor_key=... account_id=... actor_id=... must_change_password=true`, once for A and once for B. IDs must differ. **No credential text** may appear. A nonzero exit code, absence of exactly two lines, or uncertainty is **BLOCKED**: do not run the command again; continue only with the read-only inspection in step 4 to determine what committed.

4. **Terminal A — read-only enrollment verification, including a decisive STOP on any failure.** This is safe even if Step 3's output was uncertain. **Do not re-run Step 3.** Execute the entire command box, from its opening `(` to its closing `)`, in Terminal A at the repository root. The commands run inside a subshell so a failure stops this check without closing your interactive Terminal A.

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-02 Step 4 read-only verification'
   (
     set -e
     MT_DB="$HOME/ers-3367-acceptance-13bca905/isolated.db"
     if [ ! -s "$MT_DB" ]; then
       echo 'BLOCKED: expected isolated database is missing or empty; preserve evidence'
       exit 1
     fi
     printf 'status_database=%s\n' "$MT_DB"
     if ! python3 -B scripts/ers-two-human-admin-status.py --db "$MT_DB" \
       --actor-key 'ers3367-local-human-a' \
       --actor-key 'ers3367-local-human-b'; then
       echo 'BLOCKED: status verification failed; preserve database and backup; do not re-enroll'
       exit 1
     fi
     echo 'PASS: both GLOBAL administrators are usable according to read-only status check'
     AUDIT_COUNT="$(sqlite3 -bail "$MT_DB" "SELECT COUNT(*) FROM authz_audit_logs WHERE operation='authentication.human_admins.offline_enroll';")"
     printf 'enrollment_audit_count=%s\n' "$AUDIT_COUNT"
     if [ "$AUDIT_COUNT" != '2' ]; then
       echo 'BLOCKED: expected exactly two enrollment audit events; preserve database and backup'
       exit 1
     fi
     echo 'PASS: two enrollment audit events verified; MT-02 Step 4 complete'
   )
   ```

   **Expected after successful enrollment:** the status checker prints JSON containing `"ready": true`, two **distinct** nonempty Account/Actor IDs, `"usable": true` for each, and `"mustChangePassword": true` for each; then `PASS: both GLOBAL administrators are usable according to read-only status check`, `enrollment_audit_count=2`, and `PASS: two enrollment audit events verified; MT-02 Step 4 complete`.

   **When the status checker fails:** it prints a specific safe diagnostic such as `missing required column: ...` or `SQLite SQLITE_CANTOPEN; database access or query error`; then the command box prints `BLOCKED: status verification failed...` and **does not treat the audit count as acceptance**. The previously observed audit count of `2` suggests audit records were committed, but proves neither account usability nor cause of the status failure. Mark MT-02 **BLOCKED** and retain the database, pre-enrollment backup, and non-secret terminal evidence. Do not restart enrollment. If Step 3 failed but Step 4 passes, reconcile the uncertain Step 3 output before marking MT-02 PASS. If the diagnostic reports missing schema or unreadable database, investigate using the existing read-only migrations/integrity checks; do not apply migrations or restore a backup to this already enrolled file merely to make the test pass.

5. Record the non-secret A/B Account IDs, Actor IDs, actor keys, two event IDs (from MT-08 later), backup digest and references; no passwords. No UI process is running yet.

**Exit state to MT-03:** two new accounts, two GLOBAL grants, pending first-password changes, exactly two enrollment audit rows, backend stopped. **PASS:** all verified. **FAIL/BLOCK:** any partial result, bad backup, unexpected pre-existing account, incorrect target path, audit absence or leak. **Recovery:** preserve database/backup; never replay create-only enrollment.

### Deployed Test — separate MT-02 Path T (not part of today's LOCAL execution)

Do not execute Path T unless you are on the approved **deployed Test host**, have completed Test-specific backup and approval gates, and verified its actual container image/volume. LOCAL Path L cannot substitute for Test. The Test runbook is not executed by shell commands in LOCAL and its Docker workflows were **not** exercised in the authoring environment. Prior to an actual deployed Test enrollment, confirm the release operator has an approved Test change record and verified Test backup, a matching image digest, a non-Production volume, and an isolated stopped Test service. Use the Test deployment instructions already maintained in the [Production Operational Runbook](production-operational-runbook.md) Gate 2 (Test rehearsal). Do **not** copy the LOCAL SQLite file or credentials to Test. Record this entire Path T as **N/A — LOCAL-only run, deployed Test gate pending** rather than PASS; the Test gate remains mandatory before Production launch.

**End timestamp — Terminal A:** After completing MT-02 actions and checking the exit state, record this UTC value.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-02 END UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

### MT-02 — Individual execution record (complete immediately after test)

| Required evidence field | Actual value (fill in; do not leave blank) |
|---|---|
| Test ID / environment | `MT-02` / `LOCAL isolated` or explicit separately approved Test |
| UTC start / UTC end (from this test’s Terminal A timestamp blocks) | _Start: ... / End: ..._ |
| Actual operator/human and role | _Non-secret identity; A/B/operator as applicable_ |
| Administration / Tenant context actually shown | _GLOBAL `*`, unauthenticated, offline N/A, 1Password, etc. — record observed_ |
| Exact non-secret A/B login, Account IDs, Actor IDs, or affected resource | _Values; or N/A with reason_ |
| Process state and DB path BEFORE / AFTER | _Expected vs observed listener, database, session and shell-state transition_ |
| Actual terminal/UI outputs, including failures | _Record exact relevant PASS/FAIL strings and UI behavior_ |
| Non-secret audit event ID / correlation | _Actual event ID / correlation, or N/A and reason; never token_ |
| Screenshot, CI, log or private evidence reference | _Exact private locator; redact credentials and tokens_ |
| Verdict (PASS / FAIL / BLOCKED / N/A) | _Choose one; N/A reason is mandatory_ |
| Defect link / fix SHA / retest time | _Actual reference or None — no defect observed_ |

**A case is not PASS until its exit state and evidence have been confirmed.**

## MT-03 — Start isolated LOCAL ERS; Human A changes initial password

**Operator:** Human A controls Browser A; named LOCAL operator controls the terminals. **Context:** LOCAL Global administration (`*`) after login. **Starting state:** MT-02 PASS, two accounts enrolled, A `mustChangePassword=true`; backend/frontend not running; same isolated DB, no old session. **Credentials:** A independently knows A's **initial** secret; no one shares it. **Variables:** defined anew in Terminal B below, not inherited from Terminal A.

**Start timestamp — Terminal A:** Record the following UTC value before beginning MT-03.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-03 START UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

1. Check port 8080 is free in **Terminal B** (repository root):

   ```zsh
   : '# Terminal B (macOS/zsh, repository root) - MT-03 command block'
   export MT_DB="$HOME/ers-3367-acceptance-13bca905/isolated.db"
   printf 'MT-03 BACKEND DB=%s\n' "$MT_DB"
   ls -l "$MT_DB"
   lsof -nP -iTCP:8080 -sTCP:LISTEN
   ```

   **Expected:** correct existing file, **no listener**. If there is any listener, identify and stop **only the known test backend**, or stop this test until port ownership is resolved. Do not kill an unknown process.

2. In **Terminal B**, start backend with **explicit safe LOCAL overrides**, and **leave this terminal running**:

   ```zsh
   : '# Terminal B (macOS/zsh, repository root) - MT-03 command block'
   export MT_DB="$HOME/ers-3367-acceptance-13bca905/isolated.db"
   APP_ENV=local ERS_DATABASE_PATH="$MT_DB" ERS_RESET_DATABASE=false \
     ERS_PROVISION_E2E_ADMIN=false DEV_SEED_ADMIN=false \
     AUTHZ_BOOTSTRAP_ENABLED=false ERS_BACKEND_WATCH=false \
     make local-backend
   ```

   **Expected startup lines:** `APP_ENV=local`, `DATABASE_PATH=/Users/<you>/ers-3367-acceptance-13bca905/isolated.db`, the command explicitly sets `AUTHZ_BOOTSTRAP_ENABLED=false`; `Starting backend without Air...`, listening on 8080. If the database path differs, immediately Ctrl+C and **FAIL**. If a Go build fails, MT-03 is BLOCKED, not a completed browser test.

3. In **Terminal C**, from repository root start frontend with the target explicitly set (leave running):

   ```zsh
   : '# Terminal C (macOS/zsh, repository root) - MT-03 command block'
   ERS_API_PROXY_TARGET='http://127.0.0.1:8080' make local-frontend
   ```

   **Expected:** frontend startup prints `ERS_API_PROXY_TARGET=http://127.0.0.1:8080` and the Vite LOCAL URL (normally `http://localhost:5173`). Open **only** that LOCAL URL. Never use a deployed domain during this test.

4. In a *new independent* **Browser A profile**, open `http://localhost:5173`; select `en-US`. On **Sign in**, enter `ers3367.a@local.invalid` and A's own initial password. Select **Sign in** **once**. **Expected:** forced **Change password** before ordinary navigation.
5. On **Change password**, type A's current initial password, a new private password, and the same new password in **Confirm password**; submit once. **Expected:** return to **Sign in**. Sign in again with A's new password. **Expected:** authorized navigation is available.
6. Open **Administration context → Global administration**, then navigate via displayed menu to **Authentication → Authentication Accounts** and **Authorization → Application Authorization**. Confirm both load without HTTP 500 and the effective role includes `APPLICATION_ADMIN` and scope `APPLICATION`/`*`.
7. In an **unauthenticated** separate Browser C profile, try A's *old initial password once*. **Expected:** rejection; do not keep retrying. Close that Browser C tab/profile, without disturbing A.
8. Record actual A login, Account ID, Actor key/ID, UTC times, UI navigation labels, independent password-change observation and evidence references. Never record either password.

**Exit to MT-04:** Terminal B backend and Terminal C frontend still running against isolated DB; A independently authenticated in Browser A with new password; B has not signed in yet. **PASS:** forced change and old-password refusal plus authorized global session. **FAIL:** unexpected normal navigation before password change, incorrect DB, missing grant, old password still accepted, or HTTP 500. **No cleanup yet**—MT-11 owns process teardown.

**End timestamp — Terminal A:** After completing MT-03 actions and checking the exit state, record this UTC value.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-03 END UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

### MT-03 — Individual execution record (complete immediately after test)

| Required evidence field | Actual value (fill in; do not leave blank) |
|---|---|
| Test ID / environment | `MT-03` / `LOCAL isolated` or explicit separately approved Test |
| UTC start / UTC end (from this test’s Terminal A timestamp blocks) | _Start: ... / End: ..._ |
| Actual operator/human and role | _Non-secret identity; A/B/operator as applicable_ |
| Administration / Tenant context actually shown | _GLOBAL `*`, unauthenticated, offline N/A, 1Password, etc. — record observed_ |
| Exact non-secret A/B login, Account IDs, Actor IDs, or affected resource | _Values; or N/A with reason_ |
| Process state and DB path BEFORE / AFTER | _Expected vs observed listener, database, session and shell-state transition_ |
| Actual terminal/UI outputs, including failures | _Record exact relevant PASS/FAIL strings and UI behavior_ |
| Non-secret audit event ID / correlation | _Actual event ID / correlation, or N/A and reason; never token_ |
| Screenshot, CI, log or private evidence reference | _Exact private locator; redact credentials and tokens_ |
| Verdict (PASS / FAIL / BLOCKED / N/A) | _Choose one; N/A reason is mandatory_ |
| Defect link / fix SHA / retest time | _Actual reference or None — no defect observed_ |

**A case is not PASS until its exit state and evidence have been confirmed.**

## MT-04 — Human B changes initial password independently

**Operator:** Human B in **Browser B** (different browser profile), with Human A observing only A's Browser A. **Context:** LOCAL GLOBAL `*`. **Entry:** MT-03 PASS; backend 8080/frontend 5173 running on isolated database; A signed in; B still `mustChangePassword=true`. **Credentials:** B owns B's distinct initial password; A's new password is not shared. **Variables:** none required.

**Start timestamp — Terminal A:** Record the following UTC value before beginning MT-04.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-04 START UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

1. In Terminal A check service reachability without revealing sessions:

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-04 command block'
   curl -fsS http://127.0.0.1:8080/api/v1/healthz >/dev/null && echo 'PASS: isolated backend healthz reachable'
   curl -fsS http://127.0.0.1:5173/ >/dev/null && echo 'PASS: LOCAL frontend reachable'
   ```

   **Expected:** both PASS messages. If either fails, stop MT-04; do not switch to an unrelated deployed server.
2. In a **different browser profile B**, open `http://localhost:5173`. Sign in as `ers3367.b@local.invalid` with B's own initial secret. **Expected:** mandatory **Change password**.
3. B supplies initial password and a **new, distinct B-only** password twice; submit once. Confirm return to **Sign in**. Re-login with B's changed password. In the top context selector choose **Global administration**. Open **Authentication Accounts** and **Application Authorization** through the UI. Confirm B's active `APPLICATION_ADMIN` actor.
4. In Browser A refresh the open protected page. **Expected:** A remains signed in and sees A's own actor. In Browser B refresh. **Expected:** B remains signed in as B, not A.
5. On Authentication Accounts use **Actor/account filter** to locate `ers3367.a@local.invalid`, then clear and search `ers3367.b@local.invalid`. Record different Account IDs and GLOBAL Actor IDs. No filtering result is used to justify enrollment here (already completed).
6. B's old initial password should be rejected **once** in a fresh unauthenticated Browser C profile; clear it afterward.

**Exit to MT-05:** Browser A/A and Browser B/B both independently signed in; B first-password-change complete; backend/frontend remain running. **PASS:** all steps including independent sessions and unique accounts. **FAIL:** shared sessions, cross-user actor, stale initial password accepted, unavailable Global Administration, or failure to load page.

**End timestamp — Terminal A:** After completing MT-04 actions and checking the exit state, record this UTC value.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-04 END UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

### MT-04 — Individual execution record (complete immediately after test)

| Required evidence field | Actual value (fill in; do not leave blank) |
|---|---|
| Test ID / environment | `MT-04` / `LOCAL isolated` or explicit separately approved Test |
| UTC start / UTC end (from this test’s Terminal A timestamp blocks) | _Start: ... / End: ..._ |
| Actual operator/human and role | _Non-secret identity; A/B/operator as applicable_ |
| Administration / Tenant context actually shown | _GLOBAL `*`, unauthenticated, offline N/A, 1Password, etc. — record observed_ |
| Exact non-secret A/B login, Account IDs, Actor IDs, or affected resource | _Values; or N/A with reason_ |
| Process state and DB path BEFORE / AFTER | _Expected vs observed listener, database, session and shell-state transition_ |
| Actual terminal/UI outputs, including failures | _Record exact relevant PASS/FAIL strings and UI behavior_ |
| Non-secret audit event ID / correlation | _Actual event ID / correlation, or N/A and reason; never token_ |
| Screenshot, CI, log or private evidence reference | _Exact private locator; redact credentials and tokens_ |
| Verdict (PASS / FAIL / BLOCKED / N/A) | _Choose one; N/A reason is mandatory_ |
| Defect link / fix SHA / retest time | _Actual reference or None — no defect observed_ |

**A case is not PASS until its exit state and evidence have been confirmed.**

## MT-05 — Canonical GLOBAL bindings, authorization and self-suspension protection

**Operators:** A in Browser A; B in Browser B, each acting personally. **Starting state:** MT-04 PASS, both independent sessions live, backend/frontend still on the isolated DB. **Context:** both show **Global administration**, effective Tenant `*` and actor scope `APPLICATION`. **Credentials:** only current private A and B passwords; no shell secrets or new logins. **Variables:** none.

**Start timestamp — Terminal A:** Record the following UTC value before beginning MT-05.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-05 START UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

1. In Browser A open **Authentication → Authentication Accounts**. Filter `ers3367.a@local.invalid`. In **Account identity boundary** check: no Person binding, no Tenant Actor binding, exactly one GLOBAL binding, account active, password change no longer required. Record A's Account ID and actor key `ers3367-local-human-a` and Actor ID.
2. On **A's own** card find **Security suspend**. **Expected:** disabled. Do **not** try to bypass the UI or suspend either administrator.
3. Clear filter, find B and repeat the boundary checks. Verify B has a **different** Account ID, Actor ID and actor key `ers3367-local-human-b`.
4. Navigate **Authorization → Application Authorization**. In authenticated authorization context verify selected Tenant ID `*`, current actor scope `APPLICATION`, role `APPLICATION_ADMIN`. Search each actor key and confirm an **active** `APPLICATION_ADMIN` grant scoped to `*` for each, without modifying any grant.
5. Repeat steps 1–4 in Browser B, checking that B sees B's own signed-in actor and **B's own** Security suspend is disabled.
6. Optional, read-only backend confirmation (required if UI omits actor details): in Terminal A run:

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-05 command block'
   export MT_DB="$HOME/ers-3367-acceptance-13bca905/isolated.db"
   (
     if ! python3 -B scripts/ers-two-human-admin-status.py --db "$MT_DB" \
       --actor-key ers3367-local-human-a --actor-key ers3367-local-human-b; then
       echo 'BLOCKED: read-only administrator status check failed; do not mark this MT test PASS'
       exit 1
     fi
     echo 'PASS: both GLOBAL administrators verified read-only'
   )
   ```

   **Expected:** `"ready": true`, each `"usable": true`, distinct nonempty `accountId` / `actorId`, each `"mustChangePassword": false`. If the command outputs `ready: false` mark FAIL.

**Exit to MT-06:** active separate global A/B sessions, canonical grants verified, no roles changed. **PASS:** all mandatory UI or supplemental status checks and disabled self-suspend controls. **FAIL:** cross-scope binding, absent grant, mismatched actor, active self-suspend or unexpected HTTP 500. **No cleanup** until MT-11.

**End timestamp — Terminal A:** After completing MT-05 actions and checking the exit state, record this UTC value.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-05 END UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

### MT-05 — Individual execution record (complete immediately after test)

| Required evidence field | Actual value (fill in; do not leave blank) |
|---|---|
| Test ID / environment | `MT-05` / `LOCAL isolated` or explicit separately approved Test |
| UTC start / UTC end (from this test’s Terminal A timestamp blocks) | _Start: ... / End: ..._ |
| Actual operator/human and role | _Non-secret identity; A/B/operator as applicable_ |
| Administration / Tenant context actually shown | _GLOBAL `*`, unauthenticated, offline N/A, 1Password, etc. — record observed_ |
| Exact non-secret A/B login, Account IDs, Actor IDs, or affected resource | _Values; or N/A with reason_ |
| Process state and DB path BEFORE / AFTER | _Expected vs observed listener, database, session and shell-state transition_ |
| Actual terminal/UI outputs, including failures | _Record exact relevant PASS/FAIL strings and UI behavior_ |
| Non-secret audit event ID / correlation | _Actual event ID / correlation, or N/A and reason; never token_ |
| Screenshot, CI, log or private evidence reference | _Exact private locator; redact credentials and tokens_ |
| Verdict (PASS / FAIL / BLOCKED / N/A) | _Choose one; N/A reason is mandatory_ |
| Defect link / fix SHA / retest time | _Actual reference or None — no defect observed_ |

**A case is not PASS until its exit state and evidence have been confirmed.**

## MT-06 — A issues B a one-use reset token; B recovers and prior session is revoked

**Operators:** issuer A in Browser A; recipient B in separate Browser C; Browser B holds B's *old* authenticated session. **Starting state:** MT-05 PASS; backend/frontend running, both A and B signed in. **Context:** A in Global administration (`*`); Browser C public **Reset password**, unauthenticated. **Credentials:** A and B each know their current credentials; B privately chooses a new replacement password. **Variables:** none.

**Start timestamp — Terminal A:** Record the following UTC value before beginning MT-06.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-06 START UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

1. In Browser B refresh **Authentication Accounts** and confirm it still works as B; **leave this tab open** to test session revocation.
2. In Browser A open **Authentication Accounts**, filter **exact** `ers3367.b@local.invalid`, and verify B's Account ID from MT-04. On **B's card only** select **Issue reset token** **once**. **Expected:** **One-time reset token for ers3367.b@local.invalid**, expiry and **Open reset page**. If the account ID is ambiguous, STOP without issuing.
3. Pass the one-time token or reset link **only to B in an approved private channel**, not in Git/screenshots/chat/test record. B opens it in **Browser C**. On **Reset password** confirm the token is filled (or B pastes it manually). Before consuming, **duplicate this reset tab inside Browser C** for the later one-time-reuse check; keep both private.
4. In the first Browser C tab, enter B's **different replacement password** twice, select **Reset password** once. **Expected:** success and return to Sign in. The other token tab is still available for **one** negative reuse check without storing the secret.
5. In Browser B refresh the page which was authenticated before reset. **Expected:** session is invalidated and login is required. Attempt B's old password once (rejected), then sign in with B's replacement password (accepted). Confirm Global Administration still accessible.
6. In Browser C's saved second reset tab submit the **same token once** with another distinct candidate password. **Expected:** failure (token already consumed). Do not repeat. Confirm B's successful replacement password still works. Close both token-bearing Browser C tabs and clear their history/clipboard according to your browser policy.
7. Refresh Browser A's protected page. **Expected:** A remains authenticated, unrevoked.
8. Record B Account ID, A issuing actor key, UTC time, one-use behavior, old-session rejection, non-secret evidence; audit event IDs are collected in MT-08. **Never save/reset token or passwords.**

**Exit to MT-07:** A still signed in; B signed in with newly recovered password; token consumed; B's previous session invalid. **PASS:** all assertions. **FAIL:** wrong target, multiple successful redemptions, B session alive, A invalidated, old password accepted, audit/HTTP errors. **No process teardown.**

**End timestamp — Terminal A:** After completing MT-06 actions and checking the exit state, record this UTC value.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-06 END UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

### MT-06 — Individual execution record (complete immediately after test)

| Required evidence field | Actual value (fill in; do not leave blank) |
|---|---|
| Test ID / environment | `MT-06` / `LOCAL isolated` or explicit separately approved Test |
| UTC start / UTC end (from this test’s Terminal A timestamp blocks) | _Start: ... / End: ..._ |
| Actual operator/human and role | _Non-secret identity; A/B/operator as applicable_ |
| Administration / Tenant context actually shown | _GLOBAL `*`, unauthenticated, offline N/A, 1Password, etc. — record observed_ |
| Exact non-secret A/B login, Account IDs, Actor IDs, or affected resource | _Values; or N/A with reason_ |
| Process state and DB path BEFORE / AFTER | _Expected vs observed listener, database, session and shell-state transition_ |
| Actual terminal/UI outputs, including failures | _Record exact relevant PASS/FAIL strings and UI behavior_ |
| Non-secret audit event ID / correlation | _Actual event ID / correlation, or N/A and reason; never token_ |
| Screenshot, CI, log or private evidence reference | _Exact private locator; redact credentials and tokens_ |
| Verdict (PASS / FAIL / BLOCKED / N/A) | _Choose one; N/A reason is mandatory_ |
| Defect link / fix SHA / retest time | _Actual reference or None — no defect observed_ |

**A case is not PASS until its exit state and evidence have been confirmed.**

## MT-07 — B issues A a one-use reset token (reverse recovery)

**Operators:** issuer B in Browser B; recipient A in separate Browser C. **Starting state:** MT-06 PASS; A's previous authenticated session still active, B authenticated using B's recovered password. **Context:** B Global administration (`*`), A's Browser C unauthenticated public reset. **Credentials:** A independently chooses new A replacement password. **Variables:** none.

**Start timestamp — Terminal A:** Record the following UTC value before beginning MT-07.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-07 START UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

1. In Browser A refresh a protected page and confirm A's **old session works before this reset**; leave that tab open.
2. In Browser B open **Authentication Accounts**, filter `ers3367.a@local.invalid`, verify A's previously recorded Account ID, select **Issue reset token** **once** on **A's card**.
3. Privately transfer reset link/token to A. In unauthenticated Browser C open the public **Reset password** page, confirm correct token is populated, **duplicate the token tab** before submitting. In the first tab A enters A's new private replacement password twice and submits once. **Expected:** success back to Sign in.
4. Refresh Browser A's previously authenticated page. **Expected:** it demands sign-in; A's prior session is revoked. Attempt previous A password once (rejected); sign in with A's replacement password (accepted). Verify A's GLOBAL Administration still works.
5. In the second Browser C tab submit the same token once with another new candidate password. **Expected:** rejection. Verify the successful replacement password still authenticates A.
6. Browser B refreshes protected page. **Expected:** B remains independently logged in. Close Browser C token tabs and clear transient history/clipboard.
7. Record issuer B Actor ID, recipient A Account ID, UTC times and non-secret outcomes for audit correlation in MT-08.

**Exit to MT-08:** A and B newly authenticated and independently usable, both reset tokens consumed once, previous recipient sessions revoked. **PASS:** full mirror of MT-06. **FAIL:** any unauthorized/reusable reset, wrong account, unexpected issuer-session revocation, or old-password success. **No cleanup until MT-11.**

**End timestamp — Terminal A:** After completing MT-07 actions and checking the exit state, record this UTC value.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-07 END UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

### MT-07 — Individual execution record (complete immediately after test)

| Required evidence field | Actual value (fill in; do not leave blank) |
|---|---|
| Test ID / environment | `MT-07` / `LOCAL isolated` or explicit separately approved Test |
| UTC start / UTC end (from this test’s Terminal A timestamp blocks) | _Start: ... / End: ..._ |
| Actual operator/human and role | _Non-secret identity; A/B/operator as applicable_ |
| Administration / Tenant context actually shown | _GLOBAL `*`, unauthenticated, offline N/A, 1Password, etc. — record observed_ |
| Exact non-secret A/B login, Account IDs, Actor IDs, or affected resource | _Values; or N/A with reason_ |
| Process state and DB path BEFORE / AFTER | _Expected vs observed listener, database, session and shell-state transition_ |
| Actual terminal/UI outputs, including failures | _Record exact relevant PASS/FAIL strings and UI behavior_ |
| Non-secret audit event ID / correlation | _Actual event ID / correlation, or N/A and reason; never token_ |
| Screenshot, CI, log or private evidence reference | _Exact private locator; redact credentials and tokens_ |
| Verdict (PASS / FAIL / BLOCKED / N/A) | _Choose one; N/A reason is mandatory_ |
| Defect link / fix SHA / retest time | _Actual reference or None — no defect observed_ |

**A case is not PASS until its exit state and evidence have been confirmed.**

## MT-08 — Enrollment and mutual-recovery audit attribution

**Operator:** named auditor plus A or B as authenticated GLOBAL administrator. **Starting state:** MT-07 PASS; isolated backend/frontend still running; A/B independently authenticated. **Database:** **same** LOCAL isolated DB; query a fresh read-only SQLite **snapshot**, not live Production data. **Credentials:** UI session only; no passwords or tokens in queries. **Shell variables:** defined below within this test.

**Start timestamp — Terminal A:** Record the following UTC value before beginning MT-08.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-08 START UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

1. In Browser A open **Global administration → Audit logs / Audit Log Viewer** via displayed navigation. In **Sensitive event filters**, leave **Operation** at **All sensitive and authorization events** (the current dropdown may not include the exact new operation names). Filter **Target ID** to B's Account ID from MT-04, apply, and record non-secret event IDs if visible. Repeat for A's Account ID. **If the UI limits results, use the read-only snapshot below, not an invented operation option.**
2. In **Terminal A** take a new SQLite-consistent copy (not a filesystem `cp` of a live WAL database):

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-08 command block'
   export MT_DIR="$HOME/ers-3367-acceptance-13bca905"
   export MT_DB="$MT_DIR/isolated.db"
   export AUDIT_DIR="$MT_DIR/audit-inspection"
   if [ -e "$AUDIT_DIR" ]; then
     echo 'STOP: inspection directory already exists; inspect before reuse'
   else
     mkdir -m 700 "$AUDIT_DIR"
     sqlite3 "$MT_DB" ".backup '$AUDIT_DIR/app.db'"
     chmod 600 "$AUDIT_DIR/app.db"
     printf 'snapshot_integrity=%s\n' "$(sqlite3 "$AUDIT_DIR/app.db" 'PRAGMA integrity_check;')"
   fi
   ```

   **Expected:** `snapshot_integrity=ok`. If existing directory or incorrect output, STOP; do not delete unknown files to retry.
3. Run a **parameterized read-only audit summary**. It prints event IDs and non-secret correlation IDs, never reset-token values:

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-08 command block'
   export AUDIT_DB="$HOME/ers-3367-acceptance-13bca905/audit-inspection/app.db"
   python3 - <<'PYAUDIT'
   import sqlite3,os
   from pathlib import Path
   from urllib.parse import quote
   p=Path(os.environ['AUDIT_DB']).resolve(strict=True)
   assert p.name=='app.db' and p.parent.name=='audit-inspection'
   con=sqlite3.connect('file:'+quote(str(p),safe='/')+'?mode=ro',uri=True)
   ops=('authentication.human_admins.offline_enroll','authentication.password_reset_tokens.issue','authentication.password_reset_tokens.consume')
   for op in ops:
       rows=con.execute('SELECT id,occurred_at,actor_id,correlation_id,target_id FROM authz_audit_logs WHERE operation=? ORDER BY occurred_at,id',(op,)).fetchall()
       print('operation=',op,'count=',len(rows))
       for event_id,at,issuer,corr,target in rows:
           print('  event=',event_id,'at=',at,'actor=',issuer,'correlation=',corr or '<empty>','target=',target)
       if len(rows)<(2 if op==ops[0] else 2): raise SystemExit('FAIL: missing expected audit events')
   con.close()
   print('PASS: enrollment and both recovery directions have audit entries')
   PYAUDIT
   ```

   **Expected:** 2 enrollment events and **at least 2** reset-issue events and **at least 2** reset-consume events; explicit PASS. Record actual IDs and confirm recipient Account targets correspond A and B, issuer attribution A→B and B→A, consumption audit identifies a public token holder rather than impersonating either issuer; consumption correlations must be nonempty. Missing or mismatched attribution is FAIL even if count passes.
4. **Only after recording non-secret events**, remove the known snapshot files (not the primary test DB):

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-08 command block'
   export AUDIT_DIR="$HOME/ers-3367-acceptance-13bca905/audit-inspection"
   if [ "$AUDIT_DIR" = "$HOME/ers-3367-acceptance-13bca905/audit-inspection" ] && [ -f "$AUDIT_DIR/app.db" ]; then
     rm -f "$AUDIT_DIR/app.db"
     rmdir "$AUDIT_DIR"
     echo 'PASS: audit inspection copy removed'
   else
     echo 'STOP: audit snapshot cleanup path/state unexpected'
   fi
   ```

**Exit to MT-09:** A/B sessions still running; no snapshot left; non-secret audit IDs and attribution recorded. **PASS:** required events, correlation/targets, no secrets, cleanup. **FAIL:** absent events, incorrect A/B target or identity, empty required correlation, unsafe copy, or leaked secrets.

**End timestamp — Terminal A:** After completing MT-08 actions and checking the exit state, record this UTC value.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-08 END UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

### MT-08 — Individual execution record (complete immediately after test)

| Required evidence field | Actual value (fill in; do not leave blank) |
|---|---|
| Test ID / environment | `MT-08` / `LOCAL isolated` or explicit separately approved Test |
| UTC start / UTC end (from this test’s Terminal A timestamp blocks) | _Start: ... / End: ..._ |
| Actual operator/human and role | _Non-secret identity; A/B/operator as applicable_ |
| Administration / Tenant context actually shown | _GLOBAL `*`, unauthenticated, offline N/A, 1Password, etc. — record observed_ |
| Exact non-secret A/B login, Account IDs, Actor IDs, or affected resource | _Values; or N/A with reason_ |
| Process state and DB path BEFORE / AFTER | _Expected vs observed listener, database, session and shell-state transition_ |
| Actual terminal/UI outputs, including failures | _Record exact relevant PASS/FAIL strings and UI behavior_ |
| Non-secret audit event ID / correlation | _Actual event ID / correlation, or N/A and reason; never token_ |
| Screenshot, CI, log or private evidence reference | _Exact private locator; redact credentials and tokens_ |
| Verdict (PASS / FAIL / BLOCKED / N/A) | _Choose one; N/A reason is mandatory_ |
| Defect link / fix SHA / retest time | _Actual reference or None — no defect observed_ |

**A case is not PASS until its exit state and evidence have been confirmed.**

## MT-09 — Independent 1Password custody (LOCAL N/A; deployed Test/Production separately required)

**Operators:** actual Human A and Human B, independently, plus approved access reviewer. **Starting state:** MT-08 PASS; LOCAL database and A/B sessions unaffected. **Context:** 1Password environment-specific vaults; **no ERS tenant context**. **Credentials:** each human's *own* 1Password identity and MFA; never share an account. **Shell variables:** none.

**LOCAL path L (the current isolated rehearsal):**

**Start timestamp — Terminal A:** Record the following UTC value before beginning MT-09.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-09 START UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

1. Verify **you are still working only with LOCAL** (`http://localhost:5173` and disposable `isolated.db` from MT-01). **Do not** log into Production 1Password vaults just to satisfy a LOCAL test.
2. Record `MT-09 LOCAL subcheck: N/A — real deployed Test and Production 1Password custody cannot be validated from disposable LOCAL accounts`. No fake PASS is permitted. A/B ERS browser sessions remain untouched.
3. Record pending evidence owner, Test vault approval reference, and later Test date. **The deployed Test and Production readiness gates stay OPEN** until the next path is separately performed.

**Deployed Test Path T (only on the explicitly approved Test gate):**

1. Have the approved Test access matrix in hand: exact vault names, item names, environment restrictions and reviewer. If unavailable, **BLOCKED**.
2. Human A signs into **1Password using A's own identity/MFA**, opens the approved Test vault and the named required recovery/deployment item without disclosing its secret. Reviewer records only A identity, item/vault identifiers and UTC observation. A locks/signs out.
3. Human B repeats independently under B's *different* 1Password identity/MFA and the approved Test permissions. Reviewer records B identity, vault/item identifiers and UTC observation; B locks/signs out.
4. Reviewer verifies the Test deployment service-account authorization **does not grant Production secrets access**, and resolves any older LastPass-oriented documentation discrepancy before marking Test readiness.
5. **Expected/PASS Test:** individually controlled access for both humans, least-privilege separation and non-secret recorded evidence. **FAIL/BLOCK:** shared login/MFA, inaccessible material, excessive Test→Production scope, unresolved custody discrepancy. **Production vault acceptance repeats later under approved Production operations; do not reuse Test evidence as Production proof.**

**Exit to MT-10:** in LOCAL, N/A properly recorded with Test follow-up outstanding; A/B ERS sessions unchanged. MT-09 N/A does **not** fail isolated LOCAL functional rehearsal, but **blocks claiming full Production readiness**.

**End timestamp — Terminal A:** After completing MT-09 actions and checking the exit state, record this UTC value.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-09 END UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

### MT-09 — Individual execution record (complete immediately after test)

| Required evidence field | Actual value (fill in; do not leave blank) |
|---|---|
| Test ID / environment | `MT-09` / `LOCAL isolated` or explicit separately approved Test |
| UTC start / UTC end (from this test’s Terminal A timestamp blocks) | _Start: ... / End: ..._ |
| Actual operator/human and role | _Non-secret identity; A/B/operator as applicable_ |
| Administration / Tenant context actually shown | _GLOBAL `*`, unauthenticated, offline N/A, 1Password, etc. — record observed_ |
| Exact non-secret A/B login, Account IDs, Actor IDs, or affected resource | _Values; or N/A with reason_ |
| Process state and DB path BEFORE / AFTER | _Expected vs observed listener, database, session and shell-state transition_ |
| Actual terminal/UI outputs, including failures | _Record exact relevant PASS/FAIL strings and UI behavior_ |
| Non-secret audit event ID / correlation | _Actual event ID / correlation, or N/A and reason; never token_ |
| Screenshot, CI, log or private evidence reference | _Exact private locator; redact credentials and tokens_ |
| Verdict (PASS / FAIL / BLOCKED / N/A) | _Choose one; N/A reason is mandatory_ |
| Defect link / fix SHA / retest time | _Actual reference or None — no defect observed_ |

**A case is not PASS until its exit state and evidence have been confirmed.**

## MT-10 — Protect existing administrators and reject unsafe self-action

**Operators:** A in Browser A, B in Browser B; named LOCAL operator checks regression evidence. **Starting state:** MT-09 recorded; A/B sessions still active; primary acceptance DB was constructed fresh by MT-01 with **zero** pre-existing accounts. **Context:** GLOBAL `*`. **Credentials:** own A/B sessions only. **Shell variables:** none.

**Start timestamp — Terminal A:** Record the following UTC value before beginning MT-10.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-10 START UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

1. **Existing-automation preservation subcheck:** Read MT-01 `accounts=0`, `actors=0` evidence. Because this newly constructed disposable database had **no** previous automation administrator, record `N/A — zero pre-existing administrators in the fresh LOCAL baseline`. Do not invent or provision an E2E admin to manufacture a preservation test. Preservation remains covered by LOCAL/CI regressions and must be separately inspected in the deployed Test acceptance where pre-existing identities exist.
2. In Browser A → **Authentication Accounts**, search A's **own** account; confirm **Security suspend** is disabled. In Browser B search B's own account; confirm the corresponding button is also disabled. **Do not attempt suspension or role revocation** of real admins.
3. From Terminal A, rerun the focused automated negative-case suite against the repository commit (this does not operate on the acceptance DB):

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-10 command block'
   make two-human-administrators-check
   ```

   **Expected:** Python credential input/status regressions PASS; Go authentication and enrollment packages PASS. Intentionally injected SQLite constraint-failure messages inside passing negative tests are expected; any `FAIL` line or nonzero process exit is blocking. Record the exact SHA and command log reference; do not assert an unexecuted test passed.
4. Confirm **no new LOCAL grants** were issued outside the two humans by read-only query:

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-10 command block'
   export MT_DB="$HOME/ers-3367-acceptance-13bca905/isolated.db"
   sqlite3 "$MT_DB" 'SELECT COUNT(*) FROM auth_user_accounts;'
   sqlite3 "$MT_DB" "SELECT COUNT(*) FROM authz_actor_role_grants g JOIN authz_roles r ON r.id=g.role_id WHERE r.code='APPLICATION_ADMIN' AND g.tenant_id='*' AND g.active=1;"
   ```

   **Expected:** prints `2` then `2` on this fresh isolated baseline. Any unexpected count is FAIL and requires investigation; do not delete accounts to force it.

**Exit to MT-11:** two intact A/B sessions, two accounts/grants, no administrator action performed. **PASS:** self-suspension controls disabled, negative-case regressions pass, correct counts; preservation subcheck N/A with concrete reason. **BLOCK:** any self-suspension enabled, failed regression, unexpected account/grant or unexplained change.

**End timestamp — Terminal A:** After completing MT-10 actions and checking the exit state, record this UTC value.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-10 END UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

### MT-10 — Individual execution record (complete immediately after test)

| Required evidence field | Actual value (fill in; do not leave blank) |
|---|---|
| Test ID / environment | `MT-10` / `LOCAL isolated` or explicit separately approved Test |
| UTC start / UTC end (from this test’s Terminal A timestamp blocks) | _Start: ... / End: ..._ |
| Actual operator/human and role | _Non-secret identity; A/B/operator as applicable_ |
| Administration / Tenant context actually shown | _GLOBAL `*`, unauthenticated, offline N/A, 1Password, etc. — record observed_ |
| Exact non-secret A/B login, Account IDs, Actor IDs, or affected resource | _Values; or N/A with reason_ |
| Process state and DB path BEFORE / AFTER | _Expected vs observed listener, database, session and shell-state transition_ |
| Actual terminal/UI outputs, including failures | _Record exact relevant PASS/FAIL strings and UI behavior_ |
| Non-secret audit event ID / correlation | _Actual event ID / correlation, or N/A and reason; never token_ |
| Screenshot, CI, log or private evidence reference | _Exact private locator; redact credentials and tokens_ |
| Verdict (PASS / FAIL / BLOCKED / N/A) | _Choose one; N/A reason is mandatory_ |
| Defect link / fix SHA / retest time | _Actual reference or None — no defect observed_ |

**A case is not PASS until its exit state and evidence have been confirmed.**

## MT-11 — Independent final login, read-only status, evidence, and safe teardown

**Operators:** A and B separately plus named test operator. **Starting state:** MT-10 complete; backend Terminal B and frontend Terminal C still run against isolated DB; both A/B have changed/recovered passwords, browsers A/B independent. **Context:** GLOBAL `*` and LOCAL host. **Credentials:** each human's latest private credential; never use initial or intermediate passwords. **Shell variables:** defined anew below.

**Start timestamp — Terminal A:** Record the following UTC value before beginning MT-11.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-11 START UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

1. **Final independent sign-in:** In Browser A sign out and back in using A's latest password. In Browser B sign out and back in using B's latest password. In each, choose **Global administration**, open **Authentication Accounts** and **Application Authorization**, and record displayed actor. **Expected:** both independent accounts usable without forced password change or new reset. If either needs recovery again, STOP and investigate rather than casually issuing more reset tokens.
2. In Terminal A verify final canonical status against the correct isolated database:

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-11 command block'
   export MT_DB="$HOME/ers-3367-acceptance-13bca905/isolated.db"
   (
     set -e
     if ! python3 -B scripts/ers-two-human-admin-status.py --db "$MT_DB" \
       --actor-key ers3367-local-human-a --actor-key ers3367-local-human-b; then
       echo 'BLOCKED: final administrator status check failed; preserve evidence'
       exit 1
     fi
     printf 'integrity_check=%s\n' "$(sqlite3 -bail "$MT_DB" 'PRAGMA integrity_check;')"
     printf 'foreign_key_check=%s\n' "$(sqlite3 -bail "$MT_DB" 'PRAGMA foreign_key_check;')"
   )
   ```

   **Expected:** `"ready": true`, both `"usable": true`, two different Account/Actor IDs and both `"mustChangePassword": false`; `integrity_check=ok`, `foreign_key_check=` empty.
3. **Stop only the processes created by this LOCAL test:** In Terminal B press **Ctrl+C** and wait for backend to exit; in Terminal C press **Ctrl+C** and wait for frontend to exit. Then in Terminal A:

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-11 command block'
   lsof -nP -iTCP:8080 -sTCP:LISTEN
   lsof -nP -iTCP:5173 -sTCP:LISTEN
   lsof -nP "$HOME/ers-3367-acceptance-13bca905/isolated.db"
   ```

   **Expected:** **no output** for all three after *our* processes have stopped. A remaining listener/file handle is not permission to kill arbitrary processes—identify owner first, then resolve through the original terminal.
4. **Docker cleanup:** The LOCAL path created **zero Docker containers**; if Docker Desktop is installed/running, perform a read-only check (do not start Docker merely for this):

   ```zsh
   : '# Terminal A (macOS/zsh, repository root) - MT-11 command block'
   if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
     docker ps -a --filter 'name=ers-3367-' --format '{{.ID}} {{.Names}}'
   else
     echo 'N/A: Docker daemon unavailable and no LOCAL test containers were created'
   fi
   ```

   **Expected:** no test-created container rows; or explicit N/A. If any row appears, inspect it and remove only a container **provably created by this suite**, never unrelated containers or deployed services. Verify relevant ports have been released.
5. **Keep the acceptance database and backup** until evidence review is signed off; do not run a deletion command as part of PASS. Confirm no secret-token tab remains in Browser C; securely clear Browser C reset history/clipboard, close private profiles when evidence capture is complete. Confirm no credentials, SQLite database files or token URLs appear in Git, screenshots, logs, or ticket attachments.
6. Enter UTC completion time; review **all 12 MT execution records**. Mark any executed failure FAIL; any deferred mandatory release gate BLOCKED, with its owner and schedule. LOCAL MT-09 is N/A with reason; Test and Production gates are **not yet accepted** from LOCAL evidence alone. Record the updated feature-branch commit SHA and passing CI, if a docs patch has been committed.

**Exit state:** no test-created LOCAL processes/containers, isolated credential-bearing database preserved privately for sign-off, A/B usability verified immediately before shutdown. **PASS LOCAL teardown:** independent sign-in, status and SQLite checks, clean process/container status, evidence complete. **FAIL/BLOCK:** active test writer, wrong DB, unusable human admin, leaked secret, untracked container, or missing evidence. **Optional later disposal:** only after explicit review/approval, manually identify the exact test directory and contents; do not delete it as part of MT-11 or while investigating defects.

**End timestamp — Terminal A:** After completing MT-11 actions and checking the exit state, record this UTC value.

```zsh
: '# Terminal A (macOS/zsh, repository root) - MT-11 END UTC'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

### MT-11 — Individual execution record (complete immediately after test)

| Required evidence field | Actual value (fill in; do not leave blank) |
|---|---|
| Test ID / environment | `MT-11` / `LOCAL isolated` or explicit separately approved Test |
| UTC start / UTC end (from this test’s Terminal A timestamp blocks) | _Start: ... / End: ..._ |
| Actual operator/human and role | _Non-secret identity; A/B/operator as applicable_ |
| Administration / Tenant context actually shown | _GLOBAL `*`, unauthenticated, offline N/A, 1Password, etc. — record observed_ |
| Exact non-secret A/B login, Account IDs, Actor IDs, or affected resource | _Values; or N/A with reason_ |
| Process state and DB path BEFORE / AFTER | _Expected vs observed listener, database, session and shell-state transition_ |
| Actual terminal/UI outputs, including failures | _Record exact relevant PASS/FAIL strings and UI behavior_ |
| Non-secret audit event ID / correlation | _Actual event ID / correlation, or N/A and reason; never token_ |
| Screenshot, CI, log or private evidence reference | _Exact private locator; redact credentials and tokens_ |
| Verdict (PASS / FAIL / BLOCKED / N/A) | _Choose one; N/A reason is mandatory_ |
| Defect link / fix SHA / retest time | _Actual reference or None — no defect observed_ |

**A case is not PASS until its exit state and evidence have been confirmed.**

---

## Deployed Test / Production acceptance boundary and release decision

**LOCAL functional acceptance:** MT-00 through MT-08, MT-10 and MT-11 require PASS; MT-09 LOCAL is N/A with the recorded reason. The LOCAL rehearsal must not be represented as deployed Test or Production recovery evidence. An actual deployed Test rehearsal requires an approved non-Production change, independent Test backup, verified matching Test image and database volume, stopped-writer offline enrollment, Test-only credentials, Test UI mutual recovery and audit verification, per-operator vault access, non-secret evidence, and targeted Docker cleanup. The former multi-container procedures were not executed in this authoring environment; **Test gate remains UNVERIFIED/PENDING** until conducted by the authorized Test operator. Never launch the LOCAL enrollment CLI against a live deployed volume.

**Production:** [Production Operational Runbook](production-operational-runbook.md) is the separately approved Production change-control procedure (off-host backup, restore rehearsal, access custody, downtime, database isolation, approval, enrollment, acceptance, RPO/RTO). No Production write is authorized by this manual or by passing LOCAL/CI. Do not merge deferred emergency recovery branches 990/991 into the initial launch.

**Promotion gate:** A failure in an applicable MT case blocks the corresponding promotion until fixed and retested. For feature-branch merge, document which LOCAL checks passed and which **deployed Test/Production** checks are pending; do not mislabel a pending launch gate as PASS. Store the twelve completed records with evidence references outside secrets storage. Each defect must have a link and retest SHA/date.

## Mandatory ERS manual-test engineering standard (added)

> **A manual test suite is not ready for delivery merely because its commands are syntactically correct and its procedures appear reasonable. Its execution sequence, prerequisites, environment transitions, expected outputs, and cleanup must be validated together. Any portion that cannot be executed must be explicitly identified as unverified.**

Furthermore, **all test-specific instructions belong within their own test** (and every executable command must have a fenced `zsh` block starting with a Terminal A/B/C comment): every test must identify the real actor/role and Tenant/Global context; starting process/database/session state; exact identifiers and variables; prerequisites; ordered commands and UI actions; explicit normal/failure branches and join points; observable output; end-state handoff; evidence form; PASS, FAIL and BLOCKED criteria; and targeted teardown. The only exception is the standard patch-wide validation commands given with the software patch delivery. Do not send operators to scattered chat instructions to complete any test.

**This delivery's verification ledger:**

| Scope | Performed? | Outcome / limitation |
|---|---|---|
| Source ZIP identification | YES | Embedded commit matches `13bca9059e477e4a3eba96b5d778091d8cee9f5e` |
| Fresh 76-migration SQLite schema sequence | YES, via Python `sqlite3` executing committed SQL | 76 applied; integrity `ok`, foreign keys empty, one role, two audit triggers, zero accounts |
| Schema-level two-human enrollment simulation and read-only status | YES, simulated SQL only | Deliberate second-audit failure rolled back; successful synthetic two-account rows passed status helper; duplicate login rejected. **No real Go enrollment was run** |
| Actual `scripts/db-migrate.sh` using macOS `sqlite3` CLI | NO | Authoring container lacks SQLite CLI; migration SQL was executed with Python sqlite3 instead |
| `go run ./cmd/enroll-human-admins` and password UI | NO | Required Go 1.26.2 unavailable here; no browser/backend running |
| macOS zsh runtime | NO | zsh is unavailable in authoring Linux container; Bash/static syntax was checked but must be verified on macOS |
| 1Password/Test Docker/Production enrollment | NO | External controlled environments; remain explicitly UNVERIFIED |

**Glossary impact:** none. Architecture terms remain defined in [Implementation and Architecture](implementation-and-architecture.md).
