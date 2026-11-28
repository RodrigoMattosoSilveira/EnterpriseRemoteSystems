# Bite 35.7B — Manual acceptance T01–T10 (UI first; explicit GO/NO-GO)

**Source:** [35.7B operator runbook](byte-35-7b-production-go-live.md), [35.5 acceptance](byte-35-5-manual-acceptance.md), [35.6 acceptance](byte-35-6-manual-acceptance.md), [35.5–35.7 operator field guide](byte-35-operator-field-guide.md), and frozen [six launch gates](launch-baseline.json). **Candidate:** branch `1168-bite-357b-production-acceptance-and-go-live`, baseline SHA `04c0cfd91ad37d05383f2200b33d1ecb1421e826`. After implementing this patch, record the actual commit SHA/tree and *separately* the Production-approved Test candidate SHA/tree. Do not assume this baseline SHA is deployable. No Production data is created by executing **software-stage** acceptance.

**People:** Human A = Release Owner and (only if additionally authorized) Test Database Operator. Human B = **different real human** Independent Approval Holder/Reviewer with separate 1Password custody. C = approved Production Release Operator. D = Customer Tenant Administrator, owning own Production credentials. E = approved Recovery Operator (may be A/B only where genuinely separately authorized). Distinct accounts controlled by one person never substitute for distinct humans. Name each real person in a **protected** change record, not in public issue comments. Application Administrator is global only, not a Tenant Actor.

**Status vocabulary:** **PASS** only after exact observed action and reviewed evidence, **FAIL** when observed behavior violates expected safety/functionality, **BLOCKED** if prerequisites/humans/source access cannot safely be obtained, **N/A** only where this procedure explicitly permits it with documented reason. Every record must include T-ID, actual identity + selected context, environment, release SHA/tree, UTC, observed result, approved private evidence reference, cleanup and reviewer. Do not post passwords, private keys, CPF, financial CSV, authentication cookies, recovery materials, or customer-sensitive screenshots. STOP if a FAIL/BLOCKED would affect a Production prerequisite.

## T01 — Approved candidate and LOCAL software regression

**Identity/context:** Developer / Release Owner A; Mac LOCAL, ordinary ERS checkout; no ERS login. **Safety:** No LOCAL database reset, `make local-db-init`, backend fixture mutation, or Production connection.

1. In Finder, confirm the attached committed HEAD ZIP corresponds to the requested feature branch and baseline. In Terminal, open the one existing repo checkout; record the branch, SHA and tree after patch/commit: `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse HEAD^{tree}`, `git status --short`.
2. Execute `make byte357b-launch-check`. Confirm all offline negative tests pass and no Production authorization is claimed.
3. Execute `make promotion-readiness-check` and `make local-check`. In GitHub → Actions → CI, open the run for the exact commit and inspect all relevant jobs. Do not accept a CI run for a different SHA.

**Expected:** commands return exit `0`, working tree clean, matching commit CI PASS, no real Production change. **PASS:** all observed with log/run references. **FAIL:** mismatch, regression failure or unauthorized mutation. **BLOCKED:** missing environment, CI, or exact commit. **Cleanup:** ephemeral test files auto-removed; track and remove *only* test-created Docker resources if full local-check created them; verify relevant ports (including 8080) released.

## T02 — Deployed Test release and 35.5 human-authorized rehearsal

**Identity/context:** A + Test Tenant Administrator + separate human B (Test Financial Approval Holder); Test browser `https://tst.enterpriseremotesystems.com`, fictitious Test Entidade. **No Production access.**

1. In GitHub Actions open the approved Test deployment/rehearsal run. Record exact SHA/tree, successful Test deployed smoke and Test Playwright. Independent operator checks actual Test server revision/tree under the existing operator field guide; stop if different.
2. **Test Tenant Administrator:** sign in with own Test credentials, choose fictitious Test Entidade; in **Pessoas** inspect canonical Pessoa and active Vínculo; open **Colaboradores → Jornada → Conta Corrente** and confirm an eligible fictitious open zero-balance Jornada (35.5 T03).
3. **A and B:** follow **35.5 T04–T07**, including real verified Test online backup *before writers stop*, independent signed approval from B, `plan`, authorized one-time Test `apply`, `verify`, duplicate refusal. **A must not sign as B**.
4. **Test Tenant Administrator/Collaborator:** under own Test accounts complete **35.5 T08** read-only BRL/GOLD_GRAM balance and cross-Entidade checks; verify no other Entidade data appears. Record completed 35.5 Test **Decision B**.

**Expected:** all required 35.5 operational Test checks PASS, exact Test tree matches approved Production candidate. **PASS:** reviewed actual T03–T08 and deployed Test evidence. **FAIL:** identity/balance/authorization error. **BLOCKED:** independent B, signing runtime, Test backup, maintenance approval or evidence missing. **Cleanup:** Test operator restores normal Test service only after authorized maintenance verification; preserve database and signed evidence; remove only separately created test recovery containers.

## T03 — Production HTTPS, identity, Tenant isolation and pilot admission

**Identity/context:** Production Security Reviewer B, named GLOBAL Production Application Administrator, and explicitly authorized pilot Tenant Administrator D; Production HTTPS browser only. **Use only approved read-only access until GO**.

1. Open `https://app.enterpriseremotesystems.com` in an ordinary browser. Verify HTTPS certificate/hostname, login flow and no unexpected development fixtures or E2E users.
2. **GLOBAL Application Administrator:** sign in using own named Production account; verify **Global Administration** only. Inspect Authentication and authorized Tenant listing. Do not assign tenant roles or create People merely to make the test pass.
3. **Pilot Tenant Administrator D**, if approved Account/Tenant already exists: sign in separately, select only the approved Entidade, verify expected accessible People and no GLOBAL Administration; confirm other Tenant details are not visible. If customer tenant/accounts cannot yet be legally admitted, do a bounded approved preflight using existing access controls and mark remaining steps BLOCKED until separate activation GO; do not create real data to satisfy an automated check.
4. In GitHub Settings → Environments → `production`, B confirms the *actual effective* independent required-reviewer protection for the workflow; read-only workflow YAML is insufficient. Confirm admission of unapproved customer accounts is prevented by an **enforced control**, not merely an instruction to users.

**Expected:** correct Production HTTPS, existing named admin, Tenant isolation, enforceable pilot-only admission, independent Environment protection. **PASS:** actual UI and protection evidence observed. **FAIL:** unintended Tenant leakage, unauthorized login or insecure HTTPS. **BLOCKED:** no proof of real reviewer protection, account controls or approved read-only pilot. **Cleanup:** all humans sign out, no grants/writes.

## T04 — Migration/data preservation and separately signed 35.5 Production plan

**Identity/context:** C = authorized Production Database Operator; B = distinct financial Approval Holder; official approved offline Production maintenance environment, **not** Test/TRN/LOCAL. **Never test a live Production apply here.**

1. B reviews the 35.5 actual Test T03–T08 PASS evidence and selected approved Production release tree. Operator verifies 33.5 migration recovery gate, existing persistent volume and protection from reset/migrate-destructive operations.
2. Confirm approved **Production** financial CSV/import scope (if historical balances are required), signed exact approval JSON and detached signature, independently trusted PEM fingerprint and actual Production pre-import backup manifest/verified off-host receipt. **B must not be the import executor.**
3. In protected approved *offline* production context, run **35.5 `plan` read-only** following its canonical runbook, and verify proposed exact entitlements/totals, existing zero-balance Jornada eligibility, and preservation. Do not run `apply`, migration or copy/restore as an acceptance shortcut.

**Expected:** signed real Production `plan` accepted with exact source backup and human scope; no writes performed during test. **PASS:** valid protected plan and tested preservation. **FAIL:** incorrect values or altered data. **BLOCKED:** customer approval, human B, Production backup or offline runner missing. **Cleanup:** protect evidence; no changed Production data; remove test-created tools only.

## T05 — Actual off-host backup and isolated recovery evidence

**Identity/context:** E Recovery Operator, B independent observer; Production backup evidence and independently isolated recovery infrastructure only. **Never attach a live Production volume to test containers.**

1. In approved 1Password/backup operations context, E retrieves the actual *non-secret identity* of the Production verified backup and its versioned off-host receipt; B independently checks the source object version/retention and verifier output, without exposing secrets.
2. Follow existing `docs/database-recovery-runbook.md` and 33.6.8 acceptance: materialize and restore into an isolated location, run SQLite integrity/foreign-key checks, start an isolated verification service, record actual UTC backup/rehearsal/service-ready timestamps.
3. Measure **RPO <= 86,400 seconds** and **RTO <= 14,400 seconds** for the selected real recovery point. Check isolated service is usable and **live Production remained untouched**.

**Expected:** real verified object version and separate valid restore, integrity good, RPO/RTO observed, isolated cleanup. **PASS:** all actual evidence and times reviewed. **FAIL:** data integrity, loss of isolation or time targets. **BLOCKED:** off-host object, approvals, isolated host, source credentials or real evidence unavailable. **Cleanup:** record test container IDs/volumes, stop and remove only test-created resources even on failure, verify affected ports free and Production unharmed.

## T06 — Backup scheduling, alerting and recovery ownership

**Identity/context:** Production Operations Owner / Reviewer B; approved operational monitoring/1Password interfaces, no business Tenant selection.

1. Review real Production scheduled-backup configuration and recent completed verified backup entries (not only script existence).
2. Identify and inspect a safely generated or previously recorded **failure alert actually delivered** to the approved recipient. Do not deliberately disable Production backups to manufacture an alert.
3. Inspect retention policy and independently confirm named on-call owner, escalation contact, response window and off-host versioned retention.

**Expected:** scheduling, delivery, retention and recovery ownership independently evidenced. **PASS:** all directly reviewed. **FAIL:** missing backup/alert or retention protection; **BLOCKED:** records or permissions inaccessible. **Cleanup:** no configuration changes, no secrets exported.

## T07 — Two-human administrator recovery and independent 1Password custody

**Identity/context:** Two real Application Administrators A and B, each own GLOBAL Production/Test identity as authorized; B also independent reviewer; E recovery operator. Different actual humans and vault MFA required.

1. **A and B separately** use their own 1Password accounts to demonstrate access to each authorized recovery item per **35.6 T07**. Do not exchange vault passwords/MFA or export secret values.
2. Complete/review **35.6 T06** mutual recovery acceptance for two distinct human Administrators. Record auditable behavior, not reset tokens.
3. Complete/review **35.6 T08** isolated usable recovery; verify independent access without relying on one owner's device or approval, including signed operator evidence and cleanup.

**Expected:** named independent humans, custody, mutual access/recovery and isolated restore accepted. **PASS:** actual reviewer-observed T06–T08. **FAIL:** bypass, shared secret/control or unusable restore. **BLOCKED:** second human, vault items or approved recovery not available. **Cleanup:** sign out, no copied keys/tokens, remove only recovery-created containers.

## T08 — Fill and verify the six-gate evidence manifest

**Identity/context:** A creates protected `launch.json`; B independently reviews; Mac LOCAL offline. No Production access by CLI.

1. A executes `init` from the [runbook §D](byte-35-7b-production-go-live.md), using the exact approved Production candidate SHA and matching Test tree. Confirm initial six statuses **BLOCKED**, protected file mode `0600`, and no overwrite.
2. B obtains the actual original sources from T01–T07; A fills all six entries `PASS` **only** for actual observations, with sanitized evidence artifact absolute paths, SHA-256 and mandatory details. B inspects original authoritative systems; a copied description alone is insufficient.
3. A runs `verify --evidence ... --expected-revision ... --expected-tree-sha ...`. Check the same SHA/tree and that source artifact hashes match. Intentionally retain a missing gate in an unapproved temporary copy to observe exit 2 / BLOCKED, without altering the approved manifest.

**Expected:** before completion exit 2/BLOCKED; after all genuine primary evidence and human review exit 0/REVIEW READY and NOT ACTIVATED. **PASS:** complete real six-gate evidence and independently reviewed checker outcome. **FAIL:** unsupported gate PASS, altered artifact, wrong SHA/tree. **BLOCKED:** any real source unavailable. **Cleanup:** delete test-only temporary copy, preserve actual protected evidence; no containers or DB action.

## T09 — Two independent signed release reviews (receipt NOT ACTIVATED)

**Identity/context:** Human A approved Release Owner, independent Human B approved Reviewer; each independently authenticated 1Password custodian. Mac LOCAL offline verifier and approved secured signing workstation. No Production deployment.

1. A and B each review the exact final `launch.json` SHA-256 and the genuine source observations. Each creates **own** approval JSON (`release_owner` vs `independent_reviewer`), correct target revision/tree/change, and signs exact bytes with independently controlled approved private key. **No keys created by the CLI** and no fictitious approval substitution.
2. Reviewer obtains each public PEM and hash independently from approved 1Password custody; operator runs `authorize` from runbook §D with the signed JSON, signatures, trusted public-key digests and a **new** receipt path.
3. Inspect output and private receipt: `SIGNATURES VERIFIED — NOT ACTIVATED`. Validate negative tests in LOCAL CI demonstrate wrong identity, tampered signed data, wrong digest, wrong tree and same person are rejected. Do **not** claim that the cryptographic check alone proves two humans or a GO decision.

**Expected:** two real independent verified signatures, readonly evidence integrity and *not activated* receipt. **PASS:** authorized people confirm original sources/independent custody and valid receipt. **FAIL:** signature bypass or same real person. **BLOCKED:** any original source/key/custody/independent approval missing. **Cleanup:** remove only temporary local material, keep real approvals in protected storage, do not share private keys.

## T10 — Separate GO/NO-GO, controlled Production deployment and first customer pilot

**Identity/context:** A Release Owner, B Independent Reviewer, C Production Release Operator, D Customer Tenant Administrator; GitHub approved Production Environment, Production HTTPS UI and authorized Operations change record. **Mutating Production actions are prohibited unless T01–T09 genuinely PASS and an additional approved external GO is recorded.**

1. A/B independently review T01–T09, six gates, completed 35.5 and 35.6 human authorization, and actual GitHub Environment protection. Record **GO** in the approved change system only if all mandatory evidence is complete; otherwise **NO-GO** and **STOP** (no deployment). A local receipt does not perform GO.
2. After GO, C promotes *only the exact approved release* through the established `production`-branch GitHub workflow and mandatory reviewers; **a push to `production` triggers deployment**, so independent change approval and actual Environment required reviewers must already be in force *before* the push; observe deployment's revision/tree, in-place migration backup/recovery gate and successful Production smoke. Never deploy directly from feature branch or run an unapproved manual Production reset.
3. D signs into Production with their own authorized customer account, selects approved customer Entidade, verifies Pessoa/Vínculo/Jornada and expected read-only baseline. If actual historical opening balances are needed, C and independent B follow the separately authorized **35.5 Production** `plan/apply/verify` procedure with their own real signed approval and writer isolation. No SQL manipulation, E2E credentials, or Production demo data.
4. D verifies only permitted post-activation customer workflows, accurate BRL/GOLD_GRAM balances and absence of cross-Entidade information. A/B record exact evidence, launch result and on-call handoff; if wrong or missing, STOP customer use and invoke authorized incident/recovery process rather than blind rollback.

**Expected:** independent GO, exact approved Production code, retained database, successful monitored first-customer operation. **PASS:** all observed and separately recorded (including post-import financial verification if applicable). **FAIL:** unauthorized access, data corruption, wrong revision or loss of availability; **BLOCKED:** absent GO/approver/backup, incomplete earlier tests or pilot readiness. **Cleanup:** normal authenticated sign-out, retain approved customer data and immutable evidence; remove only test-created recovery resources. Production/TST/TRN volumes must remain intact.

## Final disposition

| Evidence type | Can pass with one developer? | Required completion |
|---|---|---|
| 35.7B software/CI | Yes | T01 LOCAL + matching CI, negative offline tests; does not authorize launch |
| 35.5 Test financial rehearsal | **No** for signed operational import | T02 and T04 with actual separate authorized human and safe runtime |
| 35.6 human recovery + off-host backup | **No** where independent custody is mandated | T05–T07, actual sources, tested isolation and RPO/RTO |
| Six-gate read-only acceptance | No, requires independent reviewer | T08 actual sources, not merely `REVIEW READY` |
| Production GO and customer activation | No, requires separate authorized decision and release | T09–T10 actual signatures, approval, deployment and customer pilot |

Record final outcome **GO / NO-GO / BLOCKED** with the exact verified SHA/tree and protected reference. No Production deployment is authorized by this manual or its offline test harness.

## Glossary Impact

The following are **operational process concepts**: Independent Release Reviewer, Six-Gate Launch Evidence, Launch Evidence Manifest, Signed Evidence Receipt (`NOT ACTIVATED`), GO/NO-GO and Controlled Customer Pilot. They do not create or modify ERS Roles or domain records. Keep canonical Entidade, Pessoa, Vínculo, Ator, Jornada, Conta Corrente, Recibo and `OPENING_BALANCE` definitions unchanged. Production Customer Support authorization stays deferred in #1166.

### Operator acceptance register (complete in protected change record)

Record a real result, observation timestamp, exact candidate SHA/tree, named reviewer and protected evidence reference for **every** case. This Markdown is a blank checklist, not evidence.

| Test | Result: PASS / FAIL / BLOCKED | Evidence reference / UTC / reviewer |
|---|---|---|
| T01 — LOCAL + CI | BLOCKED — not executed by operator | |
| T02 — Test + 35.5 rehearsal | BLOCKED — not executed by operator | |
| T03 — Production identity and pilot admission | BLOCKED — not executed by operator | |
| T04 — Data preservation / signed Production plan | BLOCKED — not executed by operator | |
| T05 — Off-host backup / isolated restore | BLOCKED — not executed by operator | |
| T06 — Schedule / alerts / owner | BLOCKED — not executed by operator | |
| T07 — Independent humans / 1Password | BLOCKED — not executed by operator | |
| T08 — Six-gate evidence | BLOCKED — not executed by operator | |
| T09 — Two signed reviews | BLOCKED — not executed by operator | |
| T10 — GO + customer pilot | BLOCKED — not executed by operator | |

**Final launch decision:** NO-GO until the authorized human decision and all six original minimum safety gates have independently passed. Once actually observed, update this private register without claiming the offline test harness provided operational acceptance.
