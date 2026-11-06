# Byte 35.3 — Actual Work Sector, Location and Task Override

**Manual acceptance — LOCAL, UI first.** This document is the complete executable tester procedure, not a migration or Production change-control runbook. It supersedes the earlier one-paragraph LOCAL checklist.

## 0. Contract, identities and safety

**Business contract.** An informed assignment (`sectorId`, `locationId`, `taskId`) and its actual work (`actualSectorId`, `actualLocationId`, `actualTaskId`) are separate. When an actual override is absent, the informed assignment is effective. Overrides must never change informed values, accrual/compensation basis, or the next planning default. CLOSED periods are read-only. The three actual references must be active and Tenant-scoped.

**Authorized tester:** LOCAL Tenant A Administrator, `e2e-authz-admin-tenant-admin@example.com`; credential: 1Password **ers-development**, separately labeled LOCAL ADMIN-A. **Tenant A** is `E2E Authorization Admin Boundary`. For the authorization spot-check, use LOCAL Tenant B Administrator `e2e-isolation-tenant-admin@example.com` from the same vault, in **Tenant B** `E2E Operational Isolation`. The Application Administrator is not a substitute for either Tenant Administrator. Never record passwords or session tokens.

**Environment:** LOCAL only. Use the actual repository checked out at the supplied Byte 35.3 revision; never run these steps on Development, Test or Production. The tester needs the normal macOS Terminal, browser, `sqlite3`, and the existing LOCAL backend/frontend launch commands. Technical preflight is separated from customer-facing UI tests, but is fully specified below so it does not depend on oral instructions. A tester without authorization to back up and start the LOCAL application must mark **BLOCKED** and ask the LOCAL operator to execute Section 1; do not improvise database operations.

**STOP conditions:** Wrong branch or unknown HEAD; dirty worktree where unexplained changes may affect the test; unclear database target; active backend holding the database during offline preflight; missing/failed backup; failed integrity/foreign-key check; failed migration or startup; unavailable credentials; absence of a safe dedicated test period; uncertainty about changing financial records. Never reset, delete, replace or restore the working database as a test shortcut. Never run `make local-reset`, seed-reset, a destructive demo reset, or a raw migration against an unidentified database.

**Required written record for every test:** date and local time; `git rev-parse HEAD`; name/email of the acting tester; role; selected Tenant; chosen Work Period name/code/date/ID; Collaborator name and any displayed identifiers; informed Sector/Location/Task; actual Sector/Location/Task before and after; exact visible outcome; PASS/FAIL/BLOCKED/N/A; screenshot or non-sensitive notes; cleanup and handoff. Do not capture passwords, private financial amounts or session cookies. Each test has an explicit end-state.

## 1. P-01 — LOCAL technical readiness, backup and application startup

**Precondition:** tester and LOCAL operator are physically working at the Mac hosting this LOCAL checkout. Identify the original backend and frontend terminals before beginning. Keep the database in place. Do not perform these steps during active user work.

1. In the **existing backend Terminal A**, stop **only** the LOCAL ERS backend with **Ctrl+C**, and wait for the shell prompt. In the **existing frontend Terminal B**, stop **only** the LOCAL ERS frontend with **Ctrl+C**. Do not kill unrelated services or Docker containers. If either process is managed by another operator or cannot be positively identified, **BLOCKED** until the operator stops it.
2. Open **Terminal C** at the ERS repository root. Execute the following read-only checks:

```bash
: '# Terminal C (macOS/zsh, ERS repository root)'
pwd
git branch --show-current
git rev-parse HEAD
git status --short
command -v sqlite3
```

**Expected:** branch `1040-byte---353-actual-work-location-override`; HEAD is the exact committed revision under test (record it); worktree is clean; `sqlite3` has an executable path. **STOP** if results differ. The originally supplied implementation baseline was `840b444e758b11eb1a4ad1f21a7065e4e9f47efb`; this acceptance document is revised against `fe055ead17adb8180c659c76b18706e7299bd5f0`. After committing a documentation patch, record the new HEAD rather than pretending it remains the prior SHA.

3. **Identify the actual SQLite database before accessing it.** The normal LOCAL default is `backend/data/app.db`, but an explicit `ERS_DATABASE_PATH`, `DB_PATH`, or `DATABASE_PATH` can redirect the backend. Ask the LOCAL operator to confirm the active database from the LOCAL backend configuration; check `backend/.env` **locally without printing secrets or sharing its contents**. The commands below are valid **only if the operator confirms the effective backend path is the default**. Otherwise, **STOP** and have the operator provide the exact authorized LOCAL database path and adapt `DB` accordingly. Do not infer that the default is always the active database.

```bash
: '# Terminal C (macOS/zsh, ERS repository root; default path only after operator confirmation)'
DB="$PWD/backend/data/app.db"
BACKUP_DIR="$PWD/backend/data/byte353-test-backups"
test -f "$DB" && test -s "$DB" || { echo 'BLOCKED: LOCAL DB missing or empty'; exit 1; }
printf 'Confirmed LOCAL database: %s\n' "$DB"
```

**Expected:** path is the confirmed LOCAL database, not a deployed or test-run fixture database. If uncertain, **BLOCKED**.

4. With backend stopped, perform **read-only source integrity** and **foreign-key** checks. These do not apply a migration:

```bash
: '# Terminal C (macOS/zsh, repository root; DB set above)'
sqlite3 -readonly "$DB" 'PRAGMA integrity_check;'
sqlite3 -readonly "$DB" 'PRAGMA foreign_key_check;'
```

**Expected output** (first command):

```text
ok
```

**Expected output** (second command): *no rows*. **STOP** on any other output, error, or unavailable database.

5. Create a **new, non-overwriting, timestamped SQLite backup** using SQLite's online-backup facility (not `cp` of a live SQLite file). Preserve it through test acceptance. Record the full path and SHA-256:

```bash
: '# Terminal C (macOS/zsh, repository root; DB and BACKUP_DIR set above)'
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/app-byte353-$(date -u +%Y%m%dT%H%M%SZ)-$$.sqlite"
test ! -e "$BACKUP" || { echo 'BLOCKED: backup path already exists'; exit 1; }
sqlite3 -readonly "$DB" ".backup '$BACKUP'" || { echo 'BLOCKED: backup failed'; exit 1; }
chmod 600 "$BACKUP"
test -s "$BACKUP" || { echo 'BLOCKED: empty backup'; exit 1; }
sqlite3 -readonly "$BACKUP" 'PRAGMA integrity_check;'
sqlite3 -readonly "$BACKUP" 'PRAGMA foreign_key_check;'
shasum -a 256 "$BACKUP"
ls -lh "$BACKUP"
```

**Expected:** backup `integrity_check` prints exactly `ok`; backup `foreign_key_check` prints no rows; `shasum` emits a 64-character hexadecimal checksum and filename; the file has nonzero size. **STOP** and do not start migration if any verification fails. Never upload a real database or its backup to ChatGPT.

6. Verify the new migration is present **without applying SQL by hand**:

```bash
: '# Terminal C (macOS/zsh, ERS repository root)'
test -f backend/migrations/000078_actual_work_location_override.up.sql
git status --short
```

**Expected:** success and no unexplained worktree changes. The normal `make local-backend` startup invokes `scripts/db-migrate.sh` to apply missing migrations. **Do not execute the migration script separately, manually paste SQL, reset the DB, or edit `schema_migrations`.** If the operator's backend uses a different database or startup mechanism, **BLOCKED** until that configuration is reconciled.

7. In **Terminal A**, from the ERS repository root, start the normal LOCAL backend:

```bash
: '# Terminal A (macOS/zsh, ERS repository root; run until deliberately stopped)'
make local-backend
```

**Expected:** migration startup completes without error, followed by normal backend startup. Observe any `Applying migration: 000078_actual_work_location_override.up.sql` or `Skipping already applied migration: 000078_actual_work_location_override.up.sql` message. The skip message is acceptable if the migration was previously applied. On failure, **STOP**, preserve logs and backup, and do not retry destructively.

8. In **Terminal B**, from the same repository root, start the normal LOCAL frontend:

```bash
: '# Terminal B (macOS/zsh, ERS repository root; run until deliberately stopped)'
make local-frontend
```

**Expected:** frontend starts normally and displays its LOCAL URL (normally `http://localhost:5173`).

9. In **Terminal C**, run the documented LOCAL smoke check:

```bash
: '# Terminal C (macOS/zsh, ERS repository root)'
make local-smoke
```

**Expected output:** `Local smoke tests passed; sign in through the browser for protected-route verification.` **STOP** if not. If browser login fails, mark **BLOCKED**; never rotate credentials just to make this test pass.

10. **P-01 PASS** only if branch/SHA/configuration, original and backed-up SQLite integrity, migration startup, frontend startup and smoke check all succeeded. Record backup path/hash privately. **P-01 FAIL:** reproducible software failure. **P-01 BLOCKED:** missing tool, unknown DB path, backup issue, or unsafe operating conditions. **Handoff:** backend and frontend running; no UI changes yet.

## 2. P-02 — Test-data selection, without destructive preparation

**Identity/context:** ADMIN-A, Tenant A; credential above. **Starting state:** P-01 PASS; no prior browser session assumed. **UI path:** Open the LOCAL application URL displayed by Terminal B → sign in as ADMIN-A → select **E2E Authorization Admin Boundary** → set **Português (Brasil)** in the language selector → open **Períodos de trabalho** from the normal navigation.

1. On the Work Period list, review period cards and their visible dates/codes/statuses. Choose an existing **dedicated synthetic** period that is not **CLOSED**, is safe to edit, and already contains an included Collaborator with an informed Sector, Location and Task. Do **not** choose a period containing irreplaceable financial or audit evidence merely because it happens to be open.
2. Open the period card. Record its displayed Work Period ID, code, date, name and status. Select **Plano** and record the Collaborator and the three *informed* values. Select **Resultados Reais** and confirm the same Collaborator appears with **Atribuição informada**, a **Resultado** selector, **Setor real**, **Local real**, **Tarefa real**, and **Salvar trabalho realizado**. Record currently displayed outcome and actual values **before making changes**.
3. Open each actual-value selector and confirm there is at least one suitable active alternative to the informed value for Sector, Location and Task. If any choice is missing, stop **without changing Reference Data** and mark the affected scenario **BLOCKED**. Do not create new Tenant, Person, Collaborator, Role, Reference Data or accounting records without separately approved fixture instructions.
4. Record whether there is already a next Work Period with the same code suitable for viewing planning defaults, and whether an existing accrual preview/run can be safely **viewed without posting or recalculating**. If not, mark those specific read-only checks **BLOCKED**, not PASS.

**PASS:** confirmed safe, editable synthetic period, included Collaborator, visible controls, and alternatives. **FAIL:** requisite controls missing on a valid period. **BLOCKED:** no safe fixture or missing alternatives. **Handoff:** recorded baseline and chosen fixture; no write yet. Record the selected fixture and original values so later checks use exactly the same object.

## 3. MT-01 — Save distinct actual Sector, Location and Task

**Identity/context:** ADMIN-A / Tenant A / Português (Brasil). **Starting state:** P-02 PASS; selected period is open; no other operator is modifying it.

1. From **Períodos de trabalho**, open the recorded test period (use the card, not a typed URL); select **Resultados Reais**.
2. Find the recorded Collaborator card by displayed name. Verify and record **Atribuição informada** Sector, Location and Task; verify the compensation notice says the informed assignment determines pay.
3. In **Resultado**, choose **Trabalhou**. In **Setor real**, select a different active Sector. In **Local real**, select a different active Location. In **Tarefa real**, select a different active Task. Record all three selected names **before** saving.
4. Click **Salvar trabalho realizado** exactly once. Wait for the pending state to end; check for errors. Refresh the browser and reopen **Resultados Reais** for the same period.
5. Confirm **Trabalhou** and all three actual selections persisted. Confirm **Atribuição informada** still shows exactly the three original values. Select **Plano**, inspect the informed assignment and verify it is unchanged. Do not click planning save/refinement.

**PASS:** persisted actual values equal selected values; informed values unchanged; no error. **FAIL:** missing/altered value, unexpected edit of informed assignment, or failed save. **BLOCKED:** unexpected lock or concurrent changes. **Handoff:** recorded actual overrides saved, no financial postings.

## 4. MT-02 — Independent Task-only edit and persistence

**Identity/context:** ADMIN-A / Tenant A / Português (Brasil). **Starting state:** MT-01 PASS; use the *same* period/Collaborator.

1. Navigate through **Períodos de trabalho** to the recorded period → **Resultados Reais** → recorded Collaborator.
2. Write down the current saved actual Sector, Location, Task and informed triple.
3. Change **only Tarefa real** to another available active Task (ideally back to the informed Task). Leave **Resultado**, **Setor real** and **Local real** untouched.
4. Click **Salvar trabalho realizado**, wait until save completes, refresh and return to the same Collaborator card.
5. Confirm the Task reflects your new choice and the other two actual values and all three informed values are unchanged.

**PASS:** exactly the Task selection changes. **FAIL:** any unrelated value changes or Task fails to persist. **BLOCKED:** a second selectable Task is unavailable or period became CLOSED. **Handoff:** independently edited Task persisted.

## 5. MT-03 — Next planning default comes from informed assignment

**Identity/context:** ADMIN-A / Tenant A / Português (Brasil). **Starting state:** MT-01 PASS; an appropriate same-period-code successor is available. This test is **read-only**.

1. From **Períodos de trabalho**, use the visible period cards to open the recorded successor Work Period; confirm its displayed period code matches the test period's code. Open **Plano**.
2. Find the same Collaborator in the planning template or informed roster, when displayed. Record proposed/default Sector, Location and Task.
3. Compare against MT-01's *informed* triple and MT-01's *actual* triple. Do **not** save/refine a plan or create a new period for this check.

**PASS:** when this period genuinely derives defaults from the tested prior period, defaults match the informed values and do not inherit actual overrides. **FAIL:** proven inheritance of an actual override rather than the informed values. **BLOCKED:** no successor exists, source of template cannot be established, or the same Collaborator is unavailable. **Handoff:** no saved changes to successor.

## 6. MT-04 — Compensation boundary without financial writes

**Identity/context:** ADMIN-A / Tenant A / Português (Brasil). **Starting state:** MT-01 PASS. This is an observational test; do not create, recalculate or post an accrual solely for acceptance.

1. Open **Períodos de trabalho** → the recorded test period → **Resultados Reais**. Reconfirm the exact notice that remuneration uses **Atribuição informada** and that actual work does not change it.
2. Select **Acúmulo**. If an existing, safe-to-view accrual run and item for the Collaborator is present, record the displayed basis or relevant explanation without posting or recalculating. Compare only values the UI actually exposes; do not infer hidden computation from the notice alone.

**PASS (UI boundary):** the compensation notice is correct and no UI change suggests actual override became the payment basis. **PASS (calculation):** only if an existing displayed accrual actually demonstrates the informed basis. **BLOCKED (calculation):** no suitable display/evidence; rely on the required automated accrual tests for the computation invariant. **FAIL:** compensation visibly calculated from the actual override, or an unauthorized financial write occurs. **Handoff:** read-only accrual inspection; no financial entries created.

## 7. MT-05 — Reference validity and lifecycle restrictions

**Identity/context:** ADMIN-A / Tenant A / Português (Brasil). **Starting state:** MT-01 PASS.

1. Open the recorded period → **Resultados Reais** → Collaborator. Examine the **Setor real**, **Local real** and **Tarefa real** dropdown options. Record whether every available choice belongs to Tenant A and is currently active. Do not select or create a value known to be inactive or from another Tenant.
2. Confirm the three selectors show the correct kind of record: Sector list does not contain Tasks or Locations, and likewise for each other list. Leave the saved selections unchanged.
3. If a dedicated **CLOSED** synthetic period is available, return to **Períodos de trabalho**, open that period, select **Resultados Reais**, and check that the outcome and actual selectors and Save control cannot be used to change history. Do not attempt to reopen the period.

**PASS:** no known inactive/wrong-type/cross-Tenant choice appears and CLOSED period is read-only. **FAIL:** inappropriate option visible or CLOSED assignment can be edited. **BLOCKED:** no CLOSED period for lifecycle portion; do not create or close one. **Limitation:** browser-only testing cannot prove rejection of forged references; backend regression tests are required. **Handoff:** no changes.

## 8. MT-06 — Locale switch and Tenant isolation

**Identity/context:** ADMIN-A in Tenant A, then ADMIN-B in Tenant B. **Starting state:** MT-01 PASS; saved actual values recorded.

1. As ADMIN-A, open the recorded period → **Resultados Reais**. Switch the language to **English** and confirm `Actual Sector`, `Actual Location`, `Actual Task` and saved choices remain available. Switch back to **Português (Brasil)** and confirm `Setor real`, `Local real`, `Tarefa real` and the saved values are unchanged.
2. Sign out using the app's **Sair / Sign out** action. Do not reuse the ADMIN-A session for ADMIN-B.
3. Sign in through the normal login UI as `e2e-isolation-tenant-admin@example.com`, using its **separate LOCAL ADMIN-B credential** from 1Password `ers-development`. Select **E2E Operational Isolation**. Navigate to **Períodos de trabalho**.
4. Confirm that the recorded Tenant A period is absent from Tenant B's list. Do not paste Tenant A URLs, use DevTools, or forge IDs; that boundary is tested automatically. Sign out as ADMIN-B.

**PASS:** translations switch without data changes; Tenant B cannot see Tenant A's period in the UI. **FAIL:** persisted values change with locale or Tenant A data is disclosed. **BLOCKED:** ADMIN-B credential/role missing or access unavailable. **Handoff:** signed out; Tenant A fixture retained for the execution record.

## 9. P-03 — Post-test verification, cleanup and acceptance record

**Tester:** LOCAL operator plus ADMIN-A as needed. **Starting state:** tests attempted and no concurrent database writer besides the controlled LOCAL backend.

1. Do **not** delete test history, re-run fixture provisioning, roll back migration 78, truncate tables, or restore the pretest backup simply to make the test disappear. These actions would erase evidence or unrelated changes. Keep the approved synthetic test-period outcomes recorded, and list their IDs for later controlled cleanup. If authorized UI cleanup for disposable records exists, perform it only under a separately approved cleanup instruction that identifies each exact record; otherwise leave records in place and mark **retained synthetic evidence**.
2. In **Terminal A**, stop the LOCAL backend with **Ctrl+C**; in **Terminal B**, stop the LOCAL frontend with **Ctrl+C**. If these processes must remain available for other testing, coordinate with the operator and defer the offline integrity step (mark **BLOCKED**, never inspect the live file by assumption).
3. In **Terminal C**, only for the previously confirmed `DB` path, run:

```bash
: '# Terminal C (macOS/zsh, ERS repository root; DB from P-01)'
sqlite3 -readonly "$DB" 'PRAGMA integrity_check;'
sqlite3 -readonly "$DB" 'PRAGMA foreign_key_check;'
git status --short
```

**Expected:** `ok`; no foreign-key-check rows; worktree unchanged apart from known intentional changes. Preserve the verified backup in the restricted backup directory; record its path/hash privately. Do **not** indiscriminately stop Docker containers, kill unrelated processes, or delete database sidecars.

4. If the tester needs LOCAL services running afterward, restart them with the two standard `make local-backend` / `make local-frontend` commands from P-01, and run `make local-smoke` in Terminal C. Record whether services were left running or stopped.
5. Record **per-test** PASS/FAIL/BLOCKED/N/A, exact identities and selected Tenant, tested Work Period and Collaborator, initial and final values, any screenshots, and controlled end state. For a failure, capture the visible error, reproduce once only if safe, then **STOP** further writes. No Production approval follows from passing this LOCAL suite.

## 10. Automated regression gates and overall verdict

Run from a clean repository using the established test tools. Do not interpret a successful UI observation as proof of backend constraints or compensation calculations.

```bash
: '# Terminal C (macOS/zsh, ERS repository root; normal tests use their own isolated fixtures)'
cd backend
go test ./internal/workperiodassignments -run 'TestByte353' -count=1
go test ./internal/accruals -count=1
cd ..
make local-check
```

**Expected:** each command exits 0. `make local-check` may launch isolated test servers/containers according to the repository's normal checks. Do not stop unrelated containers. Record any test-created container IDs, verify repository cleanup removes them and releases required ports; failures are **FAIL/BLOCKED**, not ignored. If the `make local-check` implementation or runtime would target the working LOCAL SQLite DB rather than its own isolated fixtures, **STOP** and resolve that risk before execution.

**Byte 35.3 LOCAL PASS:** P-01 and P-02 PASS, MT-01/MT-02 PASS, all applicable MT-03 through MT-06 checks PASS, automated tests PASS, no unresolved data-integrity or cleanup issue, and evidence recorded. Any unexecuted required calculation/cross-Tenant negative check remains **BLOCKED** until automated evidence satisfies it. Distinguish **N/A** (scenario genuinely not applicable) from **BLOCKED** (prerequisite/evidence missing). A single proven functional defect is **FAIL**; do not promote. Merge/promotion requires normal independent review and green CI against the actual final committed SHA.

## Glossary impact

Keep *Informed Sector/Location/Task* distinct from *Actual Sector/Location/Task*. Add **Actual Task / Tarefa real** alongside **Actual Sector / Setor real** and **Actual Location / Local real** under Work Period Assignment / Actual Outcomes. An actual override never changes the informed assignment, compensation basis, or next-period planning default. No other domain definition changes are authorized by this test document.
