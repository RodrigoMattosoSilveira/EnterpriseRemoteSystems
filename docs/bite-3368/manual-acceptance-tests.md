# Bite 33.6.8 — Integrated Regression, Recovery Rehearsal, and Final Acceptance — Manual Test Suite

**Issue:** #998. **Baseline:** `998-bite-3368--integrated-regression-testing-recovery-rehearsal-and-final-acceptance` at `17cedf7183834740533bd5e12d8c115b61d0f496` (patch input, NOT an expected HEAD after committing). **This manual does not authorize Production operations.**

**Sequence:** IT-00 → IT-01 → IT-02 (LOCAL) → IT-03 → IT-04 → IT-05 → IT-06 (deployed Test) → IT-07 (separately approved Production) → IT-08 (cleanup/decision). Do not jump past BLOCKED tests. A LOCAL pass supports branch promotion but cannot satisfy deployed Test or Production release gates. Each test below defines its own commands and state, and a distinct execution record. If an earlier step already succeeded, record its evidence rather than rerunning any create-only operation. All `: 'Terminal ...'` annotations are safe to paste into **interactive zsh** (ordinary leading `#` comments are not).

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

**Entry:** IT-01 PASS, Terminal A at repo root. **Operator:** developer; **Context:** LOCAL automated regressions, NOT administrator enrollment. **Secrets:** none. No need for prior shell variables or a deployed administrator login.

**Actions — Terminal A:**

```zsh
: 'Terminal A (macOS/zsh, repository root) — IT-02 canonical administrator and custody regressions'
if make two-human-administrators-check && \
   make production-bootstrap-reconciliation-check && \
   make onepassword-deployment-preflight-check && \
   make production-credential-cutover-check; then
  printf 'PASS: IT-02 four focused checks completed\n'
else
  printf 'STOP: IT-02 failed; record error and do not proceed\n' >&2
fi
```

**Expected:** all commands exit `0`. The first includes actual Go enrollment atomicity/rollback and mutual recovery regressions; the remaining checks cover bootstrap reconciliation and 1Password deployment staging. These checks **do not** enroll Test/Production administrators and **do not** prove actual human vault permissions. If Go cannot execute, mark BLOCKED; do not substitute source parsing. **Exit:** no account writes to a deployed DB; evidence available for IT-06.

**Execution record — IT-02:** UTC start/end: ___ / ___; operator: ___; context: LOCAL regressions; four test exit results: ___; Go version: ___; evidence refs: ___; verdict/defect: ___; next-state: ___.

## IT-03 — Actual off-host Test recovery rehearsal with RPO/RTO (DEPLOYED TEST ONLY)

**Entry:** IT-00–IT-02 PASS, Test deployment available, authorized Test operator with access to the Test host and its managed off-host receipt. The Test backend and data are **not** stopped or reset for this non-destructive rehearsal. **Do not use Production credentials or paths.** **Operator:** named Test operator. **Context:** Test deployment host and `ENV=test`. Terminal D must be in the checked-out *Test deployment* repository directory. **No previously defined variables are assumed.** The original service's rehearsal tool checks the migration recovery gate is not armed; do not bypass it.

**Actions — Terminal D (Test deployment host, bash):**

```bash
: 'Terminal D (TEST server/bash, Test checkout root) — IT-03 identify environment and receipt'
pwd
git rev-parse HEAD
git rev-parse HEAD^{tree}
printf 'Enter the fully qualified path of an existing, verified TEST .offhost.json receipt: '
IFS= read -r TEST_RECEIPT
if [[ ! -f "$TEST_RECEIPT" || "$TEST_RECEIPT" != *.offhost.json ]]; then
  printf 'STOP: verified Test off-host receipt not located\n' >&2
else
  printf 'PASS: Test receipt selected: %s\n' "$(basename "$TEST_RECEIPT")"
fi
```

**Expected:** verified receipt exists under this Test environment's managed backup directory. Verify its non-secret associated backup verification evidence and object-version receipt before proceeding. Do not invent a path or accept a Production receipt. The Test server revision/tree should be the release under acceptance; otherwise STOP.

**Actions — Terminal D:**

```bash
: 'Terminal D (TEST server/bash, Test checkout root) — IT-03 non-destructive off-host recovery rehearsal'
make server-recovery-rehearsal ENV=test RECOVERY_REHEARSAL_RECEIPT_FILE="$TEST_RECEIPT"
```

**Expected:** exit `0`, `Recovery rehearsal passed.`, a printed `Evidence:` report path, off-host source, objective calculations with `true` for both RPO ≤ 86,400 s and RTO ≤ 14,400 s. The tool verifies restore/migration and isolated backend health. Record the report's **actual** path and server revision/tree and copy this non-secret JSON to restricted Test acceptance-evidence storage. Do **not** put secrets or the restored DB in Git. No Prod/S3 object is modified by this rehearsal; see `docs/database-recovery-runbook.md` for incident-only procedures. If result is `objective_failed`, STOP; never relax the limits to produce PASS.

**Action — Terminal D (paste actual report path printed above):**

```bash
: 'Terminal D (TEST server/bash, Test checkout root) — IT-03 verify rehearsal JSON'
printf 'Paste the absolute Evidence: report path printed by the rehearsal: '
IFS= read -r TEST_REPORT
if [[ ! -f "$TEST_REPORT" ]]; then
  printf 'STOP: report not found\n' >&2
else
  if jq -e '.status == "passed" and .environment == "test" and .objectives.rpo_met == true and .objectives.rto_met == true and .recovery.isolated_backend_health == "passed" and .recovery.post_boot_integrity_check == "ok" and .recovery.post_boot_foreign_key_check == "clean"' "$TEST_REPORT" >/dev/null; then
    printf 'PASS: off-host Test rehearsal and recovered database evidence
'
    sha256sum "$TEST_REPORT"
  else
    printf 'STOP: report is incomplete or failed; do not proceed
' >&2
  fi
fi
```

**Expected:** `PASS: off-host Test rehearsal and recovered database evidence`, then a SHA-256 digest and filename (Linux Test server uses `sha256sum`); otherwise `STOP` and no acceptance.

**Exit:** report and hash recorded; Test services left in their original state; no Test database replaced; next IT-04 begins in separate browsers. **Cleanup:** inspect only newly named `recovery-rehearsal` containers belonging to this run and confirm that the source script's trap removed them; if one remains, STOP for operator investigation rather than stopping unrelated containers. Record actual container names and report path. The original script attempts cleanup even on failure; a failed cleanup is BLOCKED.

**Execution record — IT-03:** UTC start/end: ___ / ___; Test operator: ___; Test server revision/tree: ___ / ___; exact receipt basename and verification ref: ___; report path/SHA-256: ___; RPO seconds/limit: ___ / ___; RTO seconds/limit: ___ / ___; Docker cleanup evidence: ___; result/defect: ___; exit-state: ___.

## IT-04 — Deployed Test human administrators, mutual recovery, and audit (UI FIRST)

**Entry:** IT-03 PASS. Two **already enrolled** distinct Test human GLOBAL Application Administrators (A/B), each with their own credentials and browser session; Test origin verified, no Production sessions. If these Test identities have not been enrolled, STOP — perform separately authorized Bite 33.6.7 *Test Gate 2* first; **never invoke create-only enrollment again without state inspection**. **Operator:** independent Human A and Human B, with a witness/reviewer. **Context:** **GLOBAL Administration** in Test, not a Tenant actor. **Terminal:** none. **Secrets:** use approved Test-only credentials privately.

**Actions:**

1. Browser A: open the exact authorized Test URL. Sign in as Human A. If first-password change is required, complete it using A's own password; record only that the change succeeded. Confirm the Administration context displays **Global administration**, and open **Administration → Authentication Accounts**. Record A's login and visible global administrator status; do not record a password.
2. Browser B (different browser profile/private window): independently sign in as Human B, perform any required first-password change, confirm **Global administration**, and open **Administration → Authentication Accounts**. Verify B is a distinct Account, not an alternate Tenant actor attached to A.
3. In Browser A, from Authentication Accounts locate B's account and select **Issue reset token**. Record a non-secret action/audit reference only; convey the token directly and privately to B, never in screenshot/evidence. Browser B follows the **Reset password** workflow and signs in with a new B-only password; confirm a previously existing B session is invalidated. Confirm token reuse is refused.
4. In Browser B, issue a reset token for A through Authentication Accounts. Browser A uses **Reset password** and signs back in with A's new password; verify the old session is revoked and the token is single-use.
5. In **Administration → Audit Logs**, inspect available identity/audit filters and record actual non-secret event/correlation IDs or, if the viewer cannot display the specific recovery events, record a read-only audit verification reference under authorized Test evidence access. Never assert an event exists based solely on an unfiltered UI search. Verify the actions are attributable and neither Account became a Tenant Actor.

**Expected:** two independent logins and canonical GLOBAL administrator access; both recovery directions work; tokens are one-use; old sessions do not survive; audit attribution is present. A missing identity or unexpected server error is FAIL. **Exit:** A/B independent Test credentials remain active; no other account affected; preserved audit references for the acceptance bundle.

**Execution record — IT-04:** UTC start/end: ___ / ___; A real identity/login/account/actor key: ___; B real identity/login/account/actor key: ___; Test URL and GLOBAL context: ___; A→B recovery evidence: ___; B→A recovery evidence: ___; old session/token results: ___; audit refs: ___; UI screenshots (no secrets): ___; result/defect: ___; exit-state: ___.

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

## IT-07 — Production gate (SEPARATELY APPROVED; NOT PART OF LOCAL/TEST EXECUTION)

**Entry:** IT-06 PASS and independently approved. **Operator:** authorized Production change owner plus two independently authorized Production Human Administrators, with separately reviewed Production 1Password and S3 evidence. **Context:** Production GLOBAL Administration and Production recovery environment. **Terminal:** P only under approved maintenance window. **No Production action is authorized by this test document.**

**Actions:**

1. Review the **actual approved** Production change, its maintenance window, recovery owner, rollback decision, off-host receipt and backup verification, last accepted Test evidence, and exact promoted Production SHA/tree. If any are missing, record BLOCKED; do not stop Production or provision an E2E/bootstrap account.
2. Follow `docs/bite-3367/production-operational-runbook.md` for Production human enrollment **only if not yet enrolled**, with its backups, offline isolation, create-only behavior and restart safeguards. Never rerun enrollment on an uncertain database state. Verify A/B independently using the Production human acceptance checks and non-secret audit records.
3. Independently verify each Production human's individual approved 1Password access and effective Production service-account isolation; explicitly reconcile the legacy LastPass recovery references. Record review IDs. Do not treat Test findings as Production acceptance.
4. Conduct the **existing non-destructive** Production off-host recovery rehearsal under the recovery runbook. Accept only actual `status=passed`, Production environment, matching Production SHA/tree, off-host source, health/integrity evidence, RPO ≤24h and RTO ≤4h. Do not weaken thresholds. Record output `rehearsal.json` and SHA-256 in separately protected Production evidence storage.
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

**Expected:** code branch clean after committing changes (if not, reconcile the differences); final SHA is recorded. Confirm 8 separate execution records and original signed references; Test results must not be asserted as Production results. **Exit/decision:** branch may be proposed for merge only after LOCAL+CI PASS and no unresolved blockers; **Production GO** requires actual deployed Test and Production evidence and independently authorized approval. No manual execution here is a substitute for the authorized deployment workflow.

**Execution record — IT-08:** UTC start/end: ___ / ___; operator: ___; environment/context: ___; final SHA: ___; stopped/remaining test process and Docker IDs: ___; port 8080 explanation: ___; evidence archive location/reference: ___; unresolved defects: ___; LOCAL/CI verdict: ___; Test gate verdict: ___; Production gate verdict: ___; final decision/reviewer: ___.

## Validation limits and promotion blockers

- Python/SQLite simulation is a **LOCAL regression**, not proof of actual off-host recovery or real administrator/vault operability.
- Missing Test or Production approvals, unavailable reviewer, failed or stale/mismatched SHA evidence, ambiguous LastPass/1Password custody, failed restore/backend boot, RPO/RTO exceedance, incomplete A/B mutual recovery, or a nonzero required test is **BLOCKED** until corrected and retested.
- The evidence checker checks **consistency** of supplied non-secret references and SHA-linked report; it does not independently validate the external providers, authenticated human actions, or approval system.
- For an implementation change: verify exact patch SHA, run `git apply --check`, apply, `git diff --check`, and perform canonical `make local-check` and CI. These are standard patch validation steps and are not a substitute for per-test instructions above.

**Glossary impact:** see [Implementation and Architecture](implementation-and-architecture.md).
