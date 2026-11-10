# Byte 35.5 — Production Database Initialization
## Manual acceptance tests — exact committed revision

**Project:** Enterprise Remote Systems (ERS)
**Branch:** `1071-355-production-database-initialization`
**Committed HEAD SHA:** `5eece27e422afc6096066ef397fc4f273857cea8`
**Working directory:** `~/projects/EnterpriseRemoteSystems` — the **single normal Git checkout**, not a worktree.
**Reference runbook:** `docs/bite-35/byte-35-5-production-database-initialization.md`
**Status:** Two separately recorded acceptance decisions: **(A) solo-developer software acceptance** and **(B) independently authorized financial initialization**. Automated LOCAL and CI tests were reported PASS by the release owner; this document never assumes manual tests have passed. The current tester is the only human developing and testing ERS.

---

## Read first — two different acceptance decisions

Byte 35.5 introduces migration `000080_production_opening_balance.up.sql` and a guarded import of historical opening balances. It does **not** introduce an opening-balance UI entry form. Ordinary Pessoas, Vínculos and Jornadas are managed through the existing UI; controlled historical import is an offline operation.

**Decision A — Software acceptance (one human is sufficient).** The sole ERS developer/tester may execute T01, T02, T09 and the software decision in T10; may execute the **read-only** T03 Test UI inspection when a fictitious Test fixture exists; and may inspect the **pre-import portions** of T08 without claiming a posted financial balance. The offline regression already performs signed `plan`, `apply`, `verify`, duplicate refusal, rollback, immutability and signature/tamper tests using **ephemeral test-only keys, fictitious approvals and disposable SQLite databases**. The developer is not required to recruit a second human merely to prove that the software implementation behaves correctly. Software acceptance can be **PASS** despite legitimately deferred operational tests; the decision must say exactly what was tested.

**Decision B — Operational authorization (not satisfied by one human).** Before any real customer opening balances are imported into **Production**, a genuinely independent authorized human must approve the actual CSV, supporting backup evidence and signed totals. The Production database operator must be a **different actual human**. The approved key and private signing custody remain independent; two usernames, two browser accounts, two test-only keys, or two roles controlled by the same person **do not** meet this requirement.

**Controlled deployed Test rehearsal:** T04–T07, plus the **post-import** part of T08, verify operational backup/approval/import procedures against the actual deployed Test database. Under the existing signed-approval contract, these require an independent authorized approval holder. When no such person is available, record **BLOCKED — independent human unavailable**, rather than FAIL or PASS. These blocked operational tests do **not** invalidate Decision A, but they prevent declaring the complete operational rehearsal accepted and prevent Production import authorization. Do not substitute an impersonated approver or relaxed import flags.

**There are three separately recorded outcomes:**

| Decision | Required evidence | Can the current sole developer complete it? |
|---|---|---|
| **A. 35.5 software acceptance / feature-branch promotion** | T01, T02 and T09 PASS; matching-revision LOCAL/CI; T10 software decision; no unsafe writes | **Yes** |
| **B. Deployed Test operational rehearsal** | T03–T08 completed, with real verified Test backup and independent human approval for T04–T07 | **Not yet** if no independent approver |
| **C. Production financial initialization authorization** | B accepted, real customer sign-off, independently signed **Production** evidence, 35.6/35.7 gates and separate authorization | **No** — never granted by this document |

**Safety rules for all three outcomes:** Never reset or modify the operational LOCAL `backend/data/app.db` for acceptance. Never replace an existing Test/Production database, reuse demo seed data in Production, create another worktree, or run a Production `apply` as a manual test. Never put real customer financial CSVs, credentials, private signing keys or secrets in Git, CI logs, or this test report.

**Test-result vocabulary:** **PASS** means all required steps were safely executed and observed; **FAIL** means an executed step violated its expected result; **BLOCKED** means a prerequisite, environment, independent human, or authorization is unavailable. An expected BLOCKED for T04–T08 is **not** a software defect. Never change BLOCKED to PASS merely because automated checks passed; those are different tests.

### Identities and responsibilities

| Role | Who may perform it now | What is actually authorized |
|---|---|---|
| **Software Developer / Tester / Release Owner** | The current sole human may perform all three **software-stage** responsibilities | Inspect the source, run LOCAL and CI, review software evidence, sign off **Decision A only** |
| **Synthetic regression approver and operator** | Fictitious distinct identifiers managed by the automated test, such as `approver-355` and `operator-355` | Prove the program rejects same-identifier approval and verifies signatures in a disposable test; **not** real human separation |
| **Test Entidade Administrator** | An ordinary authorized `TENANT_ADMIN` Test account (can be operated by the sole tester) | Read-only UI inspection in the selected fictitious Test Entidade; no Production authorization |
| **Test Collaborator** | An ordinary fictitious Person/Collaborator Test account (can be operated by the sole tester) | Read-only personal Current Account inspection, if available |
| **Different Test Entidade identity** | An authorized identity in a separate fictitious Test Entidade (can be operated by the sole tester) | UI cross-Entidade isolation inspection |
| **Application Administrator** | Application-global account | Global administration only; never use as an ordinary Entidade Actor |
| **Database Operator — operational import** | A named real human | Actual authorized Test/Production `plan`, `apply`, `verify` in maintenance window |
| **Independent Approval Holder** | Another, **different actual human**, when available | Independently approves the actual financial import evidence and controls the approved signing process |

A single tester may sign in sequentially with different **fictitious Test roles** to check UI authorization, because these are role-based software checks, not independent-human approvals. In contrast, an operational approval by the same individual under a second login must be rejected as a human-control failure.

### Evidence register — fill as applicable

| Item | Recorded value or protected reference |
|---|---|
| Actual solo developer/tester and UTC date | ____________________ |
| Checkout directory | `~/projects/EnterpriseRemoteSystems` |
| Current branch / exact HEAD SHA / Git tree | ____________________ |
| LOCAL `make local-check` PASS evidence and timestamp | ____________________ |
| GitHub CI job URL and matching commit | ____________________ |
| T01 / T02 / T09 evidence references | ____________________ |
| Deployed Test revision and URL (**if** available) | ____________________ |
| Test Entidade / fictitious Pessoa / Vínculo / Jornada IDs (**if** available) | ____________________ |
| Test software UI-only evidence (**if** available) | ____________________ |
| Operational Test Approval Holder, a **different human**, if available | ____________________ / UNAVAILABLE |
| Operational Test Database Operator identity, if applicable | ____________________ / NOT PERFORMED |
| Verified Test backup and protected manifest references, if applicable | ____________________ / NOT PERFORMED |
| Actual signed operational Test CSV/approval/key fingerprint, if applicable | ____________________ / NOT PERFORMED |
| **Decision A — software** | PASS / FAIL / BLOCKED |
| **Decision B — operational Test** | PASS / FAIL / BLOCKED |
| **Decision C — Production initialization** | **NOT AUTHORIZED** |

For this project today, **one person may be listed as both Developer and Release Owner** for Decision A. Record that fact without inventing a second approver. Use opaque evidence references rather than pasting secrets, customer data or actual approval artifacts here.

---

## T01 — Confirm exact revision and offline 35.5 checks

**Who:** Sole Developer / Tester acting as software Release Owner. **Where:** LOCAL Terminal, repository only. **UI:** none; the capability is an offline importer. **Database:** the regression creates its own disposable SQLite files; it must not use operational `backend/data/app.db`.

1. Open Terminal and execute:

   ```bash
   cd ~/projects/EnterpriseRemoteSystems
   pwd
   git branch --show-current
   git rev-parse HEAD
   git status --short
   git rev-parse HEAD^{tree}
   ```

2. Confirm the branch is `1071-355-production-database-initialization`. The supplied **pre-documentation baseline** is `5eece27e422afc6096066ef397fc4f273857cea8`:

   - **Before committing this documentation-only change:** `git rev-parse HEAD` should equal that baseline; `git status --short` may show **only** `M docs/bite-35/byte-35-5-manual-acceptance.md`. Stop if other unexplained changes appear.
   - **After committing the revised document:** HEAD will be a **new SHA**. Verify that the supplied baseline remains an ancestor, and record the new SHA and tree:

     ```bash
     if git merge-base --is-ancestor 5eece27e422afc6096066ef397fc4f273857cea8 HEAD; then
       echo 'PASS: expected 35.5 baseline is an ancestor'
     else
       echo 'FAIL: expected 35.5 baseline is not an ancestor'
       exit 1
     fi
     git status --short
     ```

     Expect the PASS message and a clean status after committing. Do **not** reset or switch branches to force HEAD back to the old SHA. Record the actual software revision being accepted and the CI run associated with it.
3. Run each check separately; after each one record `PASS` only if the command exits `0`:

   ```bash
   make byte355-initialization-check
   make deployment-migration-head-check
   make byte354-readiness-check
   ```

4. For the first command, the final success line must be:

   ```text
   PASS: Byte 35.5 offline signed import, two-direction ledger, rollback, duplicate and tamper guards.
   ```

5. You reported full LOCAL and CI green. Record the **actual matching-revision** evidence for `make local-check` and the GitHub CI job rather than rerunning every suite merely to fill this form. If that evidence is missing, run `make local-check` under the normal ERS SOP and record the result.

**PASS:** correct branch and baseline ancestry, no unrelated worktree changes, all named checks exit `0`, appropriate committed-revision LOCAL/CI evidence exists, and no operational database used. **FAIL:** incorrect history, nonzero check, unexplained file changes, or unexpected change to operational data. **BLOCKED:** repository or necessary runtime unavailable.

## T02 — Inspect the migration and preservation evidence (no database write)

**Who:** Sole Developer / Tester. **Where:** LOCAL, read-only review; *not* Production. **UI:** none.

1. In the correct directory, open `backend/migrations/000080_production_opening_balance.up.sql` in VS Code, or inspect it in Terminal:

   ```bash
   cd ~/projects/EnterpriseRemoteSystems
   ls -l backend/migrations/000080_production_opening_balance.up.sql
   ls -l backend/migrations/000080_production_opening_balance.down.sql
   ```

2. Confirm the upward migration classifies `OPENING_BALANCE` distinctly, defines `production_opening_balance_imports`, has guards against unauthorized opening-entry insertion and later update/deletion, and enforces uniqueness per Jornada and value unit.
3. Review the T01 regression output and `scripts/test-byte355-production-initialization.py`. The disposable migration rehearsal verifies that an existing ledger entry survives migration and prior indexes, triggers and foreign keys remain valid.
4. Confirm `make deployment-migration-head-check` passed and that deployment evidence expects migration `000080` as its head. **Do not** apply or undo migration 000080 manually on LOCAL or Production for this test.

**PASS:** migration and regression evidence establish schema preservation, immutability, and the expected migration head. **FAIL:** missing safeguards, head mismatch, or a failed migration check. **BLOCKED:** unavailable evidence.

---

## Test environment — distinguish read-only UI checks from operational import

**Solo Test UI checks (T03 and limited T08):** The sole developer may use ordinary fictitious Test Administrator / Collaborator / other-Entidade accounts in the deployed Test UI to inspect canonical identity, zero starting balances, role scoping and language. These checks do **not** require a second human; they must not create opening-balance entries, alter existing financial records or represent a completed import.

**Operational Test import (T04–T07 and post-import T08):** Proceed **only** after all of the following have been established and recorded: approved Test revision, existing migrated Test `app.db`, fictitious Test Entidade and open zero-ledger Jornada, authorized maintenance window, verified backup/manifest, stopped database writers, independently approved signing key, and **two genuinely distinct humans** for Approval Holder and Database Operator. If the independent approver is unavailable, mark T04–T07 and the post-import T08 portion **BLOCKED** and stop there. Do not run `plan` on operational Test using a manufactured approval that falsely represents a second human.

The standing importer contract requires `approved_by` and `executed_by` to be different identifiers. **This is necessary but not sufficient proof of different human beings.** The offline tests validate software behavior; human identity is checked as an operational process outside the code.

If a clean fictitious Test Journey does not exist, T03 may be **BLOCKED**; it is not necessary to invent or reset financial data to pass Decision A. A Journey already used by training may contain ledger history and is not a valid opening-import target.

## T03 — UI-first verification of canonical Test identity and initial zero balances

**Who:** Sole Developer / Tester signed in as an ordinary **Test Entidade Administrator**. **Where:** deployed **Test application**, selected fictitious Test Entidade. **Actions:** read-only UI inspection; if a new fictitious test fixture must be created, obtain separate approval and use existing administrative UI only.

1. Open the **Test URL provided by the Release Owner**, not the Production URL. Sign in as the designated **Test Entidade Administrator**.
2. Verify the selected context displays the intended fictitious **Entidade**. If it does not, use the existing Entidade/context selector to select it. Do not use the Application Administrator as a tenant Actor.
3. Open **People / Pessoas**. Locate the fictitious Test Pessoa using the recorded non-sensitive test identifier. Open their details and confirm the Person is the intended global identity and has an **active Vínculo** with the selected Entidade.
4. Open **Collaborators / Colaboradores**. Open the same Person's **open Jornada**. Record its Jornada ID from the approved fixture or normal application evidence; do not guess the identifier from the display name.
5. Open **Conta Corrente / Current Account** for that Jornada (or the Journey's Current Account link). Inspect the BRL and GOLD_GRAM positions and history.
6. Confirm there are no ledger entries for this Journey and the opening positions are zero in both units. An empty history may represent the required zero starting state; do not create an entry merely to make a zero appear.
7. Sign out or preserve the authenticated Test session for T08 under the approved Test procedure.

**PASS:** one expected global Pessoa, correct active Entidade membership and open Jornada, no preexisting ledger history, zero opening positions. **FAIL:** duplicate/mismatched Pessoa, wrong Entidade, closed Jornada, nonzero activity, or missing access. **BLOCKED:** Test deployment/identity/fixture unavailable. Do not run financial writes to correct a failing fixture. **Decision A:** T03 is an additional UI assurance when available, **not a requirement** for the solo software gate.

## T04 — Verified Test backup, signed authorization and separated humans

**Who:** A named real Database Operator **and a different actual human** as independent Approval Holder. **Where:** offline Test maintenance context and protected evidence location. **UI:** 1Password for authorized key lookup; no API/SQL for identity shortcuts.

**Before any step:** If you are still the sole human available, **do not execute this test**. Record `T04 = BLOCKED — no independent Approval Holder`, document that the T01 regression covered *simulated cryptographic approval*, and skip directly to T09/T10 for software acceptance. There is no need to recruit someone simply to merge verified source code; there **is** a need for genuine independent approval before making an authorized financial import.

1. The Release Owner authorizes the maintenance period; record the Test deployment revision and source database identifier.
2. Database Operator stops **all Test database writers** using the established Test runbook. Record each affected service/container and verify writer isolation. Do not stop unrelated Docker services.
3. Create and verify the **actual Test database backup** with the existing Bite 33.2 procedure. Record backup path, verified manifest path, manifest SHA-256, source path, integrity and foreign-key verification, and retained backup location. Do not create a substitute backup with a copy command or overwrite a working database.
4. Independently establish the **Test-only** CSV with these seven headers, in exactly this order:

   ```csv
   tenant_id,journey_id,person_id,value_unit_code,signed_amount,effective_date,reference
   ```

   For the same qualifying Jornada, include at least one positive BRL and one negative GOLD_GRAM position. For example, only if approved by the fictitious Test case: `125.50` BRL and `-0.75000000` GOLD_GRAM, both with actual IDs from T03. Use an effective date no later than the current UTC date. Do not put the real customer's CSV in this test.
5. Database Operator records CSV SHA-256 and checks that the row count, per-unit signed net totals, date, Person, Entidade, and Jornada IDs match the intended Test scenario.
6. Independent Approval Holder authenticates the approved signer key from **1Password**, reviews the immutable CSV, actual verified backup-manifest SHA-256 and totals, prepares the exact JSON contract shown in the 35.5 technical guide, and signs its exact bytes using the **existing authorized signing procedure**. Do not expose or export the private key into Git, ChatGPT, CI, or an unattended container.
7. Database Operator obtains the approved **public PEM key** and its trusted SHA-256 fingerprint via an independently authenticated source (1Password, not merely the received approval). Verify signature **without a private key**:

   ```bash
   openssl dgst -sha256 -verify "$PUBLIC_KEY" -signature "$SIGNATURE" "$APPROVAL"
   ```

   `PUBLIC_KEY`, `SIGNATURE` and `APPROVAL` must first be set to the actual protected file paths in the maintenance session. Expected: `Verified OK`. If those variables are not set, do not run the command.
8. Confirm `approved_by` and `executed_by` represent **two different named actual humans**. Their identifiers must be valid for the importer's identifier format (no whitespace). Match the approval's `environment=test`, `tenant_id`, row count, positive/negative signed totals, CSV hash, backup-manifest hash and independent public-key hash. The Test contract uses `offhost_receipt_sha256` as the empty string when no Test off-host receipt is supplied; do not invent evidence.

**PASS:** current real Test backup verified, signed approval matches exactly, independent key fingerprint authenticated, named humans differ, and all protected evidence is retained. **FAIL:** missing/tampered evidence, invalid signature, self-approval, incorrect source database, or wrong Test totals. **BLOCKED:** backup, independent human/key, or Test writer-isolation unavailable. Do not proceed to import.

### Operator variable sheet for T05–T07 — Test only

All paths below must be **actual absolute paths visible in the same authorized offline Test maintenance environment** that executes the importer. In particular, the backup manifest's `source.database_path` must match `DB` exactly; the target filename must be `app.db`. The importer refuses symbolic-link paths. The values are examples of **variable names**, not valid operational defaults.

Before running the next commands, the Database Operator sets each value interactively to its reviewed Test value (never paste secrets in a shared log):

```bash
# Execute only INSIDE the approved Test offline maintenance environment.
# Set all 10 variables to the REAL Test files/identifiers before running.
DB='/absolute/path/to/existing/test/app.db'
CSV='/absolute/path/to/protected/opening.csv'
APPROVAL='/absolute/path/to/protected/approval.json'
SIGNATURE='/absolute/path/to/protected/approval.sig'
PUBLIC_KEY='/absolute/path/to/protected/approved-public.pem'
BACKUP='/absolute/path/to/protected/verified-preimport-backup.db'
BACKUP_MANIFEST='/absolute/path/to/protected/verified-preimport-backup.db.manifest.json'
TENANT_ID='actual-test-tenant-id'
OPERATOR_ID='actual-database-operator-id'
APPROVED_KEY_SHA256='64-lowercase-hex-digits-from-independent-1Password-check'
```

**STOP:** these placeholders are not valid values; do not execute T05–T07 unchanged. If your Test maintenance runtime cannot access the importer at `scripts/ers-byte355-opening-balance.py` or the approved protected files, mark **BLOCKED** rather than mounting Production volumes or inventing a new container workflow. Ensure `APP_ENV=test` and no conflicting Production environment variables. The existing Test operating runbook determines the maintenance-container launch and writer-stop commands.

## T05 — Signed Test `plan` (read-only; no import)

**Who:** Named real Database Operator. **Where:** approved **offline Test** maintenance environment; existing Test `app.db`, not LOCAL or Production.

**Solo-developer status:** If T04 is BLOCKED, record `T05 = BLOCKED — no independent signed operational Test approval`. Do not execute this `plan` with two invented operator names. The signed `plan` behavior has already been tested in the disposable T01 suite.

1. Confirm T03 and T04 are PASS and the actual values in the Test operator variable sheet are filled and reviewed.
2. Confirm Test database writers remain stopped. Record read-only baseline evidence for current test Journey opening counts and balances using approved inspection tooling. Do not use manual balance updates.
3. Run:

   ```bash
   APP_ENV=test python3 -B scripts/ers-byte355-opening-balance.py plan \
     --db "$DB" --csv "$CSV" \
     --approval "$APPROVAL" --signature "$SIGNATURE" \
     --public-key "$PUBLIC_KEY" \
     --approved-public-key-sha256 "$APPROVED_KEY_SHA256" \
     --backup "$BACKUP" --backup-manifest "$BACKUP_MANIFEST" \
     --environment test --tenant-id "$TENANT_ID" --operator "$OPERATOR_ID"
   ```

4. The exit status must be `0`; expected output begins with `PASS: Byte 35.5 plan; rows=` and includes correct `net_BRL`, `net_GOLD_GRAM`, approved CSV SHA-256 and `no database reset`.
5. Confirm the pre-import Test UI/current-account state remains unchanged (if UI was intentionally paused for writer isolation, perform this check through the approved read-only maintenance inspection, then resume UI only after maintenance).

**PASS:** accepted signature, counts, amounts and backup; no opening entries or import audit were added; no Test database reset. **FAIL:** `plan` wrote data or accepted mismatched approval. **BLOCKED:** approved Test evidence or maintenance access unavailable. **STOP** on any failed preflight; do not proceed to `apply`.

## T06 — Approved one-time Test `apply` (controlled Test write)

**Who:** Named real Database Operator, **not** the independent Approval Holder. **Where:** approved Test maintenance window only, after T03–T05 PASS.

**Solo-developer status:** If T04/T05 are BLOCKED, record `T06 = BLOCKED — independently authorized operational Test import not available`. **Do not run `apply`** and do not substitute a second account controlled by the same person. The disposable T01 regression already tests successful transactional apply and rollback.

1. Read the final signed Test CSV and approval evidence identifiers again. Verify `DB` is the **existing Test `app.db`** and all writers remain stopped. Confirm the independent human approval and the Release Owner's authorization to import fictitious Test data.
2. Execute exactly once, with the **Test** confirmation literal:

   ```bash
   APP_ENV=test python3 -B scripts/ers-byte355-opening-balance.py apply \
     --db "$DB" --csv "$CSV" \
     --approval "$APPROVAL" --signature "$SIGNATURE" \
     --public-key "$PUBLIC_KEY" \
     --approved-public-key-sha256 "$APPROVED_KEY_SHA256" \
     --backup "$BACKUP" --backup-manifest "$BACKUP_MANIFEST" \
     --environment test --tenant-id "$TENANT_ID" --operator "$OPERATOR_ID" \
     --confirm APPLY-OPENING-BALANCES-TEST \
     --writers-stopped ALL_DATABASE_WRITERS_STOPPED
   ```

3. Expected: exit `0` and `PASS: Byte 35.5 apply; rows=...; net_BRL=...; net_GOLD_GRAM=...; csv_sha256=...; no database reset`.
4. Record the actual posted row count, signed totals, CSV hash, approval reference, Test maintenance session, and non-secret log location.
5. **Do not rerun `apply` on failure.** The importer rolls back its transaction; retain logs and escalate for investigation before any new authorized attempt. Never use `--confirm APPLY-OPENING-BALANCES-PRODUCTION` in this test.

**PASS:** a single auditable import, exact Test signed positions, no bonus/earnings substitution, no cross-Entidade entry or partial transaction. **FAIL:** wrong amount/direction, partial write, duplicate, or unauthorized change. **BLOCKED:** any T03–T05 prerequisite absent.

## T07 — Test `verify`, duplicate refusal, and immutability evidence

**Who:** Named real Database Operator. **Where:** Test offline maintenance session; no additional approved write.

**Solo-developer status:** If T06 has not been performed, record `T07 = BLOCKED — no authorized Test import to reconcile`. The T01 regression independently verifies simulated `verify`, immutability and duplicate rejection. Do not claim that a real deployed Test database was reconciled.

1. Run the importer in **read-only verification mode** using the same approved artifacts:

   ```bash
   APP_ENV=test python3 -B scripts/ers-byte355-opening-balance.py verify \
     --db "$DB" --csv "$CSV" \
     --approval "$APPROVAL" --signature "$SIGNATURE" \
     --public-key "$PUBLIC_KEY" \
     --approved-public-key-sha256 "$APPROVED_KEY_SHA256" \
     --backup "$BACKUP" --backup-manifest "$BACKUP_MANIFEST" \
     --environment test --tenant-id "$TENANT_ID" --operator "$OPERATOR_ID"
   ```

2. Expected: exit `0`, `PASS: Byte 35.5 verify`, and exact reconciliation of every ledger entry, signed direction (`CREDIT` for positive, `DEBIT` for negative), dates, ownership, audit hashes and row count.
3. Verify the same signed CSV/approval is refused for a **second** import. The safest required evidence is the already-passing offline T01 duplicate regression. If the Release Owner authorizes a live duplicate refusal in this Test maintenance window, repeat the exact **T06 Test-only** command once. Expected: **nonzero exit** with a `STOP`/`FAIL` duplicate indication and **no change** to existing approved entries. Never test a duplicate using Production or a changed customer CSV.
4. The SQL update/delete and partial-transaction rejection checks are **already exercised against disposable databases** by `make byte355-initialization-check`. Review their PASS evidence; **do not attempt UPDATE/DELETE on the Test or Production ledger**.
5. Confirm the Test backup and import audit evidence are retained in protected storage, without storing keys or real personal data in the acceptance report.

**PASS:** exact reconciliation and no duplicate or mutable opening balances, with negative-case evidence from the disposable regression. **FAIL:** mismatch, duplicate accepted, audit missing, or any ledger mutation. **BLOCKED:** T06 not completed.

## T08 — Test UI financial presentation and Entidade isolation

**Who:** Sole Developer / Tester may operate the Test Entidade Administrator, Test Collaborator and another fictitious Test Entidade identity **one at a time** for role-isolation checks. **Where:** deployed **Test UI**.

**Two parts, different results:**
- **T08-A — Solo role/isolation check before import:** Without a completed T06, sign in sequentially under the three approved Test accounts, verify the selected Entidade and that other Entidades' data is inaccessible. Record **PASS / FAIL / BLOCKED for T08-A only**; no opening-balance entry is expected.
- **T08-B — Post-import financial UI check:** Only after T06/T07 PASS under independent-human operational approval, execute steps 1–7 below, verifying that actual approved opening amounts appear correctly. Until then, record **BLOCKED — no authorized Test opening import**. T08-A PASS must **never** be recorded as T08-B PASS.

For T08-A, sign in to the deployed Test app as the ordinary Test Entidade Administrator, inspect People/Collaborators/Current Account under the expected Entidade, sign out, sign in as the ordinary Test Collaborator, confirm only their personal read-only views, sign out, then sign in as the authorized account for the *other* fictitious Entidade and confirm that the first Entidade's membership and ledger data are absent. Sign out. Record context/role and screenshots with no personal secrets. If the role accounts or Test environment do not exist, mark T08-A BLOCKED.

1. Database Operator confirms Test backend and frontend services are restored through the approved release procedure. Test Entidade Administrator signs in and selects the **same Test Entidade** used in the CSV.
2. Navigate to **Collaborators / Colaboradores** → the specific Test Pessoa/Jornada → **Conta Corrente / Current Account**. Check the ledger/history and both balance units.
3. The import row must display **“saldo histórico de abertura”** in `pt-BR` (English: **“historical opening balance”**) and its source as an opening-balance import—not a **bônus**, ordinary earnings/accrual, expense, or payment. Confirm dates and reference/source association where displayed.
4. Confirm the positive BRL position matches the signed Test CSV (credit to the Collaborator); confirm the negative GOLD_GRAM position matches the signed Test CSV (debit owed to the Entidade). Do **not** post extra financial transactions merely to inspect the display.
5. Sign out. Sign in as the authorized **Test Collaborator** for the same Person/Jornada; open the existing personal, read-only **Conta Corrente** view. Confirm only their authorized account positions appear and there is no administrative import capability available to the Collaborator.
6. Sign out. Sign in as the **different Test Entidade identity**, select its own Entidade, and open its normal Collaborators/People/Current Account views. Confirm the first Entidade's Person membership and opening ledger records do **not** appear as that other Entidade's records. If the same global Pessoa intentionally belongs to both Entidades, confirm each context resolves only that Entidade's own Actor, Journey and ledger.
7. Sign out all test identities. Retain redacted screenshots or observation notes with actual Test URL, role, Entidade and time.

**PASS:** labels and signs correct; BRL and GOLD_GRAM independently reconcile; Collaborator is read-only; no cross-Entidade disclosure. **FAIL:** mislabeled bonus/earnings, incorrect sign, wrong identity, unauthorized edit, or any cross-Entidade leak. **BLOCKED:** no deployed Test app, identities, or completed T06/T07.

---

## T09 — Fail-closed negative cases, all offline

**Who:** Sole Developer / Tester. **Where:** LOCAL disposable regression suite **only**. Do not corrupt a deployed Test or Production database to test failure handling.

1. Review the `make byte355-initialization-check` PASS evidence from T01.
2. Confirm its test cases cover: mismatched environment, wrong target/backup source, changed CSV/approval, signing public-key fingerprint mismatch, same `approved_by` and `executed_by` identifiers, missing exact `apply` confirmation, duplicate import, unauthorized direct opening-ledger entry, UPDATE/DELETE immutability, and forced mid-import failure with full rollback. Verify signature checking through successful signed fixture execution and failed tamper cases. **Do not claim a real second human signed those synthetic fixtures.**
3. Confirm the regression checks the SQLite integrity and foreign keys, successful original BRL and GOLD_GRAM directions, and that an unrelated preexisting ledger row survives migration.
4. No Test/Production SQL sabotage, database overwrite, fake approval or private-key exposure is permitted for T09.

**PASS:** negative cases fail closed and disposable regression passes, with no deployed database touched. **FAIL:** a negative case can successfully mutate a database or rollback is incomplete. **BLOCKED:** cannot inspect or run the offline evidence.

## T10 — Three separate decisions, evidence and teardown

**Who:** Sole Developer / Tester acting as software Release Owner for **Decision A**. The operational Test Database Operator and independent Approval Holder participate **only when** Decision B is actually performed. **Where:** release records and protected Test evidence; no Production database write.

1. Confirm the single working directory is `~/projects/EnterpriseRemoteSystems`, the branch is `1071-355-production-database-initialization`, and the supplied baseline remains in the history. Record the **actual current commit SHA** (which changes when this documentation is committed), plus LOCAL and CI PASS evidence for the code being promoted. If only documentation changed after the previously green CI run, clearly record both SHAs and obtain the normal required post-commit CI evidence. Confirm T01, T02 and T09 are **PASS** and no operational database was modified by these offline checks.
2. Record T03 as PASS/FAIL/BLOCKED, separately. Record **T08-A** (solo Test role/isolation check) and **T08-B** (post-import opening-balance display) as separate results. Neither T03 nor T08-A requires an independent human; they are supplementary to the software gate.
3. If no independent Approval Holder exists, record **T04, T05, T06, T07 and T08-B = BLOCKED — independent operational approval unavailable**. Do not falsely show a successful operational Test import, `verify`, real backup approval, or approved signature based on the synthetic T01 results.
4. Make **Decision A — SOFTWARE ACCEPTANCE**: **PASS** when T01, T02, T09 and matching-SHA LOCAL/CI PASS, with no unsafe activity or unresolved software defect. It may PASS while T04–T08-B remain BLOCKED. **FAIL** on software regression failure or security violation. **BLOCKED** if matching-revision evidence cannot be obtained. This decision may support the normal feature-branch merge/promotion of code; it is **not** a Production operational authorization.
5. Make **Decision B — DEPLOYED TEST OPERATIONAL REHEARSAL**: **PASS** only when T03–T08-B have genuinely completed with the actual Test environment, verified Test backup, writer isolation, independent named human Approval Holder, authorized operator, signed artifacts and UI financial reconciliation. Otherwise **BLOCKED** (or FAIL for a tested violation). This remains a prerequisite for real Production opening-balance import.
6. Record **Decision C — PRODUCTION FINANCIAL INITIALIZATION** as **NOT AUTHORIZED** by this manual. To authorize it later requires Decision B, customer approval of the real opening balances, a separate independently signed Production approval, off-host backup evidence, and the applicable 35.6 human-admin/recovery and 35.7 launch gates. **Never execute Production `apply` as part of these tests.**
7. Cleanup: the Python offline regression cleans its own temporary databases and ephemeral signing keys and creates **no Docker containers**. If a separately authorized Test exercise started maintenance containers, record their exact IDs, stop/remove **only those containers** and confirm none remain. Release only test-owned ports (e.g. 8080 if used) without stopping unrelated processes. Preserve real LOCAL/Test/Production databases, manifests, signed approvals, backup and off-host receipts.
8. File the signed-off **software decision** and the **blocked operational decision** as separate evidence records. Do not record the same person as two independent approvers. No change to the 35.5 implementation is required to accept the software.

**PASS for Decision A:** T01/T02/T09 plus matching LOCAL and CI results PASS, with Decision B/C accurately restricted. **FAIL:** any unsafe or contradictory claim, test regression, or actual unauthorized database write. **BLOCKED:** indispensable software evidence missing.

**Expected state for the current single-human team:** Decision A may be **PASS**, Decision B **BLOCKED**, and Decision C **NOT AUTHORIZED**. This is a normal, transparent outcome, not a failure of the software.

### Final test-result register (fill in after execution)

| ID | Test | Result | UTC timestamp / redacted evidence |
|---|---|---|---|
| T01 | Exact SHA and offline regression | PASS / FAIL / BLOCKED | __________ |
| T02 | Migration and preservation | PASS / FAIL / BLOCKED | __________ |
| T03 | Fictitious Test UI identity and zero balances (solo allowed) | PASS / FAIL / BLOCKED | __________ |
| T04 | Verified operational Test backup and independent human signature | PASS / FAIL / BLOCKED | __________ |
| T05 | Real Test signed `plan` | PASS / FAIL / BLOCKED | __________ |
| T06 | Real Test authorized `apply` | PASS / FAIL / BLOCKED | __________ |
| T07 | Real Test `verify` and immutability evidence | PASS / FAIL / BLOCKED | __________ |
| T08-A | Solo Test UI role/cross-Entidade isolation before import | PASS / FAIL / BLOCKED | __________ |
| T08-B | Post-import Test UI balances and classification | PASS / FAIL / BLOCKED | __________ |
| T09 | Disposable negative and rollback regressions | PASS / FAIL / BLOCKED | __________ |
| T10 | Separate software and operational decision records | PASS / FAIL / BLOCKED | __________ |

**Decision A — software acceptance:** PASS / FAIL / BLOCKED
**Sole developer/tester identity:** ____________________
**Matching LOCAL and CI evidence:** ____________________
**Decision A UTC date:** ____________________

**Decision B — deployed Test operational rehearsal:** PASS / FAIL / BLOCKED
**Independent Approval Holder (different actual human):** ____________________ / UNAVAILABLE
**Test Database Operator:** ____________________ / NOT PERFORMED
**Decision B UTC date (if applicable):** ____________________

**Decision C — real Production initialization:** **NOT AUTHORIZED BY THIS DOCUMENT**
**Separate future customer/operations approval evidence:** ____________________ / PENDING

**Record retention:** Retain test results, clean logs and links to controlled approval evidence; do not attach production financial CSV contents, personal details, passwords, 1Password secrets or signing private keys.

---

## Glossary Impact

No additional changes beyond the glossary terminology introduced by Byte 35.5:

- **Saldo histórico de abertura (`OPENING_BALANCE`)** — separately approved, immutable historical position; **not** a bonus, ordinary earnings, expense, settlement or payment.
- **Aprovação assinada de importação** — independently signed authorization bound to the actual CSV, verified backup manifest, signer key, environment, Entidade and signed totals.
- **Reconciliação de saldos de abertura** — read-only comparison of every approved historical position with ledger entries, directions, units and audit evidence.

The canonical meanings of Pessoa, Entidade, Vínculo, Ator and Jornada are unchanged.
