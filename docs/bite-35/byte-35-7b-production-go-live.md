# Bite 35.7B — Production Acceptance and Go-Live: guarded operator runbook

**Branch baseline:** `1168-bite-357b-production-acceptance-and-go-live` at `04c0cfd91ad37d05383f2200b33d1ecb1421e826`. After committing this bite, replace that historical SHA in every acceptance record with the **actual approved candidate SHA**; never deploy the historical branch tip merely because it is printed here. **Purpose:** get the first approved customer operating in `https://app.enterpriseremotesystems.com` only after the six existing Bite 35.1 launch gates and signed human release authorization. **Issue:** #1119, 35.7B. This does not introduce new ERS authorization roles, a customer support Production lease, or a second deployment system.

**State at software delivery:** implementation and regression tests only. No live gates are asserted PASS, no human approvals have been supplied, and no Production action is authorized. The OFFLINE tools in `scripts/ers-byte357b-launch.py` can format-check evidence and verify signatures; they cannot query GitHub/1Password/S3/ERS, verify real identities, change data, activate tenants or authorize a live release. `REVIEW READY` and `SIGNATURES VERIFIED — NOT ACTIVATED` are **not** GO decisions.

## A. Authorities, environments and STOP boundary

| Identity / authority | Environment | Permitted activity |
|---|---|---|
| Release Owner (Human A) | LOCAL/GitHub/approved change record | Selects immutable candidate, collects source evidence; cannot self-approve the independent reviewer role |
| Independent Reviewer/Approval Holder (Human B) | Own 1Password account and independent approved change record | Independently reads primary evidence, reviews 35.5 signed import, recovery and gate status, signs approved release record with own protected key |
| Test Database Operator (A only if separately authorized) | Deployed **Test** offline maintenance | Executes 35.5 T04–T07 with fictitious data **only** under approved Test window; cannot be 35.5 import approver |
| Test Tenant Administrator / Test Collaborator | `https://tst.enterpriseremotesystems.com` | UI-first 35.5 T03 and T08 tenant isolation/financial presentation checks |
| Production Release Operator | Approved GitHub Actions Production Environment/authorized operations host | Executes independently approved release; no Production deployment without separately recorded GO decision |
| Production Application Administrator | Production GLOBAL administration | Named human, authenticated GLOBAL access; not a Tenant Actor; does not bypass Tenant authorization |
| Customer Tenant Administrator | Production approved customer Entidade | Validates first customer login, Tenant context, Pessoas/Jornadas, balances, essential authorized workflows |
| Recovery Operator | Isolated, approved recovery infrastructure | Demonstrates actual off-host restore, RPO/RTO and owner-independent recovery; no live Production database replacement in acceptance |

**STOP/NO-GO:** any unanswered six-gate requirement; no independent authorized Human B; missing 1Password independent custody/signing procedure; Test import not accepted; undefined Production writer isolation; unverified Producton backup object/version; missing independent restore/recovery evidence; wrong SHA/tree; inability to constrain unauthorized customer admission; missing Production GitHub Environment required reviewer enforcement; any threat to a live database or customer data. An automatic GitHub action, code regression, unverified JSON claim or "two accounts" under one human does not remove a STOP.

**Deferred, separately tracked:** 33.6.8E/F advanced shared-bucket hardening as recorded in the frozen 35.1 baseline; 35.6S.2 Customer Support Authorization under issue #1166 until after go-live. Deferral never waives **minimum** off-host backup, tested isolated recovery, human approval, HTTPS, role boundaries or data preservation.

## B. Software acceptance — LOCAL only, no Docker/DB/Production write

**Identity/context:** Software Developer, Mac LOCAL ordinary repository checkout; no ERS sign-in. Preserve existing LOCAL databases. With the patch applied to the exact baseline and committed:

```bash
cd ~/projects/EnterpriseRemoteSystems
make byte357b-launch-check
make promotion-readiness-check
make local-check
```

**Expected:** exit `0` for each successful command; `PASS: Bite 35.7B ... offline regression checks` and `NOT ... PRODUCTION AUTHORIZATION` in the first command's output. Record exact `git rev-parse HEAD`, `git rev-parse HEAD^{tree}`, CI run SHA and CI result. `make local-check` is a required release regression; if it fails, do not promote. **No runtime Docker containers** are created by `byte357b-launch-check`; no teardown required. For any additional Docker tests, track test-created container IDs and stop/remove *only those*, including on failure; confirm relevant ports such as 8080 are released. No `docker system prune`, `down -v`, `make local-db-init` on a working database or ad hoc test reset.

## C. Pre-launch acceptance sequence — Test before Production

**A and B first** open the existing [35.5–35.7 operator field guide](byte-35-operator-field-guide.md) and agree the approved change/ticket, bounded Test maintenance window, expected Test/Production SHA and tree, exact operators/reviewers, independent 1Password accounts, STOP contact and preserved-service recovery plan.

1. **35.5 accepted Test rehearsal:** complete actual Test **T03–T08** in [35.5 manual](byte-35-5-manual-acceptance.md): T03 UI Person/Vínculo/Jornada zero opening position; T04 live Test online backup **while backend runs**, verified manifest and separate real human signature; T05 signed plan; T06 **one** Test apply after all writers are isolated; T07 verify/refusal of duplicate; T08 read-only Test UI balances and cross-Entidade scope. T09 negative regression and T10 distinct software vs operational dispositions remain required. Do not run any `apply` in Production as a rehearsal. Test results, Test SHA/tree and source references go into the protected evidence register. If the separate Test human or approved signing runtime is unavailable, mark BLOCKED.
2. **35.6 independent real-human administrator/recovery tests:** complete actual [35.6 manual](byte-35-6-manual-acceptance.md) **T05–T09**, especially T06 two different human Administrators and mutual recovery, T07 own 1Password custody, and T08 isolated restore with measured RPO (at most 86,400 seconds) and RTO (at most 14,400 seconds). Offline synthetic keys and automated regressions do not satisfy those operational gates.
3. **Release integrity:** GitHub Actions shows a Test-approved run, exact Test SHA/tree, Playwright/smoke and successful CI. Match candidate Production tree against the Test-approved tree and deployment's actual tree. If Test and Production trees differ, STOP; do not accept the same version label as proof. Production deployments use the existing `production` branch/approved workflow, not this feature branch.
4. **Production preflight, read-only first:** approved GLOBAL Application Administrator inspects global administration; approved Tenant Administrator inspects only their designated Entidade and identity isolation; Security Reviewer confirms HTTPS and real pilot-admission containment; operator/reviewer confirm existing Production volume, approved migration/recovery guard, 35.5 Production separately signed *read-only plan*, current verified on/off-host backup/manifest/object-version, and isolated restore evidence. **Do not create customer data before minimum safety gates PASS.** If an empty Production environment cannot yet create a backup with a valid source, STOP for a documented and separately approved safe initialization strategy rather than inventing evidence.
5. **Operational continuity:** confirm actual backup schedule, negative alert delivery, retention, named on-call/recovery owner and escalation route. Record actual evidence, not software existence.
6. **Human release authority:** Human A and independent B separately review real source evidence and sign 35.7B approval JSON with approved distinct 1Password-custodied keys. Verify identities, signatures, change reference and the mandatory GitHub `production` Environment reviewer protection through the GitHub UI. The offline receipt remains **NOT ACTIVATED**; an external change-control **GO** decision is still required.
7. **ONLY after separate GO:** execute the already authorized Production deployment/migrate-in-place via GitHub Actions using the exact selected commit and existing documented controls. **Critical:** `.github/workflows/deploy.yml` deploys on **push to `production`** as well as manual dispatch; the approval and environment protections must be in force **before merging/pushing to `production`**. A protected `production` Environment without independently enforced required reviewers is BLOCKED, not a safe substitute for pre-push change control. The workflow's `Production` job checks alone do not establish pre-deployment human approval. Never bypass required reviewers or publish real People/import data before their own separately signed 35.5 authorization. STOP if deployed revision/tree or health differs; use authorized recovery procedure, not `down -v` or a database copy.
8. **Authorized customer pilot, UI first:** named Customer Tenant Administrator signs in with own Production credentials, selects the designated Entidade, verifies People, active Memberships, open Journeys and **zero baseline** prior to any authorized historical import; the independent approved 35.5 Production import, if required, uses the real signed separate CSV/backup/receipt and one-time `plan/apply/verify` procedure only under its own approval and writer-isolation window. Confirm after import the exact signed BRL and GOLD_GRAM Current Account positions and the first permitted business flows. If any step FAILS/blocks, stop customer activity and follow approved incident/rollback plan. Record first successful customer operation and change closure.

**Notes:** An application software rollback alone may not revert a migrated SQLite schema. Follow 33.5 recovery gates and separate restore authorization. TRN is persistent, isolated and does not receive Production identity/data. No Production E2E logins or test tooling are permitted. Do not use Feature branch `1168` to trigger Production workflow directly.

## D. Private evidence record and offline checks

**Human operator on Mac LOCAL:** Use the actual protected evidence directory, **outside Git and out of cloud-shared chat**. Record only non-secret references/metadata; no CSV, CPF, account passwords, tokens, private signing keys, customer financial figures or session cookies. Each gate has one protected **nonempty** source-artifact file containing a reviewed/sanitized evidence observation; its `source_sha256` must equal the SHA-256 of the exact file. The checker verifies the file hash but **cannot verify the underlying observation was true**. Human B must independently open the authoritative ticket/log/backup receipt referenced by `source_reference`.

```bash
# LOCAL operator: record values from the approved Release Candidate and Test run.
# DO NOT substitute baseline/feature SHA for a real deployed/approved revision.
REVISION='<actual approved Production release SHA (40 lowercase hex)>'
TREE_SHA='<actual Test-approved matching tree SHA (40 lowercase hex)>'
EVIDENCE="$HOME/Downloads/ers-357b-launch.json"

python3 -B scripts/ers-byte357b-launch.py init \
  --revision "$REVISION" --tree-sha "$TREE_SHA" --output "$EVIDENCE"
```

**Expected:** `BLOCKED: private six-gate evidence starter created; no gates accepted ...`; file mode `0600`; refuses overwrite. The above `REVISION` and `TREE_SHA` are placeholders — **do not execute until replaced with actual values**. Edit the JSON in an approved private editor after actual checks; for each of six fixed gates, set `status: "PASS"` only when verified, add actual human `observer`, UTC `observed_at`, retrievable `source_reference`, absolute `source_artifact` path and file's SHA-256, plus every `details` field. The six detail groups and exact expected values are in the generated JSON. `test_tree_sha` must match the selected Production tree, `production_https_url` must be `https://app.enterpriseremotesystems.com`, measured `rpo_seconds <= 86400`, `rto_seconds <= 14400`, and all required measured Boolean observations must be `true`. The `release_operator` and `independent_reviewer` must identify different actual humans. Record actual change reference and pilot Tenant reference. Gate-specific observations:

| Gate | Primary evidence reviewer must inspect |
|---|---|
| release_integrity | Successful matching Test deployment, CI/LOCAL, Test smoke; exact approved SHA/tree |
| security | Real Production HTTPS, sign-in, role/Entidade isolation, **enforced pilot-only admission** |
| data_preservation | Controlled migration/volume preservation, accepted 35.5 Test rehearsal, separately signed Production 35.5 `plan` |
| backup_restore | Actual verified **Production** off-host S3 receipt/object version, isolated recovery, measured RPO/RTO |
| operational_continuity | Scheduler, actually delivered backup-failure alert, retention and named owner/on-call |
| administrator_recovery | Actual A/B independence in ERS and 1Password, mutual recovery and usable isolated restore |

```bash
# LOCAL: read-only structure + protected-artifact hash check; never touches Production.
python3 -B scripts/ers-byte357b-launch.py verify \
  --evidence "$EVIDENCE" \
  --expected-revision "$REVISION" \
  --expected-tree-sha "$TREE_SHA"
```

Expected while incomplete: exit **2**, `BLOCKED 35.7B: ...`. Expected once *all supplied* evidence is coherent: exit **0**, `REVIEW READY ...` then `NOT INDEPENDENTLY VERIFIED / NOT PRODUCTION AUTHORIZATION / NOT ACTIVATED`. This is **not** an external assertion that any gate passed. Human B must validate the original sources and independently establish custody and real-human separation.

### Signed release review, never a deployment button

After the six gates have independently passed, each approved human creates **their own** private signed JSON record, never sharing a signing key. Record fields (replace placeholders with actual independently verified values):

```json
{
  "schema_version": 1,
  "bite": "35.7B",
  "environment": "production",
  "decision": "APPROVE",
  "release_revision": "<approved-production-40-char-sha>",
  "release_tree_sha": "<approved-test-matching-40-char-tree>",
  "launch_manifest_sha256": "<64-character-sha256-of-exact-final-launch-json>",
  "approved_by": "<actual-authenticated-human-name>",
  "approval_reference": "<approved-release-change-reference>",
  "responsibility": "release_owner",
  "approved_at": "<actual-UTC-time-ending-Z>"
}
```

Human B uses `responsibility: "independent_reviewer"` instead, a distinct identity, and their **own** approved signing key. Before signing, each reviews the exact SHA-256 of the unmodified finished `launch.json`. The tool does not generate keys. Sign approval JSON exact bytes via the *existing approved, independently controlled* OpenSSL/1Password process; do not invent one or store private keys next to scripts. Obtain the **actual** two distinct public PEM files and **independently trusted** SHA-256 fingerprints from separate authenticated custody records. Do not derive trust only from the presented approval JSON. Until this process exists, T09 remains BLOCKED.

```bash
# LOCAL only, protected operator environment. Replace every variable with real values.
# Never paste private key, passwords or secret material in a command, chat or issue.
APPROVAL_A='<approved release owner JSON path>'
APPROVAL_B='<approved independent reviewer JSON path>'
SIGNATURE_A='<owner detached signature path>'
SIGNATURE_B='<reviewer detached signature path>'
PUBLIC_KEY_A='<independently authenticated owner public PEM path>'
PUBLIC_KEY_B='<independently authenticated reviewer public PEM path>'
TRUSTED_SHA_A='<owner public PEM SHA-256 from independent 1Password custody>'
TRUSTED_SHA_B='<reviewer public PEM SHA-256 from independent 1Password custody>'
RECEIPT="$HOME/Downloads/ers-357b-authorization-receipt.json"

python3 -B scripts/ers-byte357b-launch.py authorize \
  --evidence "$EVIDENCE" --expected-revision "$REVISION" --expected-tree-sha "$TREE_SHA" \
  --approval-a "$APPROVAL_A" --signature-a "$SIGNATURE_A" \
  --public-key-a "$PUBLIC_KEY_A" --trusted-key-sha256-a "$TRUSTED_SHA_A" \
  --approval-b "$APPROVAL_B" --signature-b "$SIGNATURE_B" \
  --public-key-b "$PUBLIC_KEY_B" --trusted-key-sha256-b "$TRUSTED_SHA_B" \
  --receipt "$RECEIPT"
```

**Expected only after genuine signatures:** exit `0`; `SIGNATURES VERIFIED — NOT ACTIVATED`; private receipt `0600`, refuses overwrite. Exit `2` on missing/changed evidence, invalid signature/key fingerprint, wrong revision/tree, same person/key, mismatched approval role or missing prerequisite. The reviewer must **still** independently inspect source logs, actual human identities and 1Password custody, validate the signed change ticket and explicitly record **GO** or **NO-GO** before Production deployment. There is **no** command in this bite to issue GO, update the Production DB, or trigger the GitHub deployment.

## E. Production launch disposition and rollback ownership

Record, outside Git: verified release SHA/tree; Test acceptance and 35.5 T03–T08 results; 35.6 T06–T08 results; six gate source hashes; A/B identity/custody and signatures; actual GitHub Environment protection reviewer; customer privacy/access admission; external GO/NO-GO ticket; Production deployment workflow/run/approval/revision/health; distinct Production opening-balance authorization; pilot account, exact customer login and operational verification **without passwords or customer data**; backup S3 object version, alert owner and approved rollback. Record PASS, FAIL or BLOCKED for all T01–T10. Any incomplete gate = **NO-GO**. After live change, independently verify Production service health, current SHA/tree, migration state and bounded first-customer business workflow. Stop immediately on unauthorized Tenant access, unexpected balance or lost backup.

**Teardown:** local offline regressions use only temporary files and ephemeral test keys, automatically deleted even on test failure. The real release does not create a test container. An isolated recovery rehearsal must record containers/volumes it creates and stop/remove *only those*, even if failed; verify live service unaffected and affected ports freed. Never stop unrelated Production/TRN/Test containers or delete live volumes. Retain the approved immutable evidence and actual training data.

## Glossary Impact

Add these **operational** terms to the operations glossary, not ERS domain authorization codes: **Six-Gate Launch Evidence** (protected collection of independent source observations for the frozen Bite 35.1 gates); **Launch Evidence Manifest** (`launch.json`, the locally hash-bound summary, NOT proof by itself); **Independent Release Reviewer** (second actual human with separate 1Password custody); **Signed Evidence Receipt** (cryptographically checked local record, explicitly `NOT ACTIVATED`); **GO/NO-GO** (separate human-controlled release decision); **Controlled Customer Pilot** (first approved Production Entidade activation after all gates). Preserve canonical definitions of Pessoa, Vínculo, Entidade, Ator, Jornada, Conta Corrente, Recibo and `OPENING_BALANCE`. Do not introduce an ERS `CUSTOMER_SUPPORT` Role or Production support lease here; #1166 is deferred.
