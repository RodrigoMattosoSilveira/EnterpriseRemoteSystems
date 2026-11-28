# Bite 35.5–35.7 — Operator field guide and evidence collection

**Audience:** two authorized humans who did not write ERS. **Status:** operating instructions, **not** evidence of tests being performed. **Applies to:** 35.5 T01–T10, 35.6 T01–T10, and the separately developed 35.7 T01–T10. Read this **before** any operational test. No Production action is authorized by this guide.

**Source control boundary:** 35.5 and 35.6 documents originated with `1078-bite-356-application-administrator-and-operational-runbooks`. The earlier proposed `1082-production-launch-verification-and-activation` branch had no unique code; its planned `byte357-launch-check` and `ers-byte357-launch.py` were **not** shipped in the accepted source. If you encounter an obsolete 1082 patch, **do not copy its patch onto 1078**; instead use the bounded 1168-based implementation. The authoritative implemented 35.7B offline contract is delivered on `1168-bite-357b-production-acceptance-and-go-live` against baseline `04c0cfd91ad37d05383f2200b33d1ecb1421e826`, using `make byte357b-launch-check`, `scripts/ers-byte357b-launch.py`, [35.7B operator runbook](byte-35-7b-production-go-live.md) and [35.7B manual acceptance T01–T10](byte-35-7b-manual-acceptance.md). Record the actual committed SHA/tree after patch application and promotion. These offline checks never authorize Production.

## A. First decision: who is doing what?

These are **operational responsibilities, not new ERS user roles**. Before starting, record the *actual* two people's names privately in your change/evidence record:

| Term seen in instructions | Plain-language meaning | Can the two partners fill this responsibility? | Required independence |
|---|---|---|---|
| **Release Owner** / **Release Coordinator** | Person responsible for agreeing which software revision is tested, authorizing the Test interruption, collecting results, and deciding STOP/continue. **Not** an ERS login or a special permission | Human A may fill this role | For software-only tests, one person is sufficient. For 35.7 Production approval, a different authorized Human B must approve independently |
| **Database Operator** | Human who has approved infrastructure access and runs the backed-up Test offline import (`plan` / `apply` / `verify`). **Not** an ERS Tenant or Application Administrator role | Human A may also be operator **only if separately authorized to use the Test host/database** | Must be a **different actual person** from the financial Approval Holder |
| **Independent Approval Holder** | Other human who reviews the **actual** fictitious Test CSV, verified backup and exact signed approval; controls the approved signing identity | Human B, if authorized and has independent key custody | B must not be the 35.5 Database Operator, nor share A's 1Password login/key |
| **Application Administrator (GLOBAL)** | Real ERS account with application-global permissions; never a Tenant Actor | For 35.6, A and B must each have their **own** legitimately enrolled account | Separate Account IDs and Actor IDs; Test-only credentials for Test |
| **Tenant/Entidade Administrator** | Ordinary Tenant-scoped `TENANT_ADMIN` account for UI checks | A or B can operate Test-only fictitious role accounts sequentially | Separate real humans **not** required for ordinary UI role-isolation tests |
| **Recovery Operator / Technician** | Person approved to conduct isolated restore and prove owner-unavailable 1Password access | A or B only if authorized and trained | The required two distinct custodians must each demonstrate independent access |
| **Independent Reviewer / Security Reviewer** | Person who checks evidence and effective permissions, rather than accepting assertions or self-filled forms | B can review A's work if B is suitably authorized; a third reviewer may be mandated by your organization | Never self-attest a control that requires an independent reviewer |
| **Production Release Operator** | Person with authority to execute an already approved Production change | Assignment must be explicitly approved; no identity is inferred by a Git login | Cannot substitute for 35.7's second independent authorization |
| **Customer/Tenant Administrator** | The customer's authorized Tenant Administrator who validates the permitted pilot experience | Only the customer's approved person | Not the GLOBAL Application Administrator |

**Before proceeding**, agree: A = ____, B = ____; Test Database Operator = ____; independent 35.5 Approval Holder = ____; 35.6 administrators A/B = ____ / ____; reviewer = ____; release ticket = ____. Use roles, names and access rights **only if real**; if they cannot be assigned, mark the affected test **BLOCKED**. For each test record **PASS** (completed and observed), **FAIL** (executed but incorrect), **BLOCKED** (cannot safely start), or **N/A** (explicitly not applicable, with reason). A successful LOCAL script never substitutes for a deployed/human result.

## B. What does “authorize the maintenance period” mean?

A **maintenance period** or **maintenance window** is an agreed Test outage interval when writes are stopped for an authorized operation. It is **not** an ERS UI button, a secret code, or a new authorization role. This is a human change-control decision. Record, **before touching Test**:

1. Ticket/reference (use an existing approved change-tracking system; if none is available, STOP and agree a controlled record with both participants); exact environment **Test**, approved Test URL, and planned start/end **UTC**.
2. Approved change: fictitious Test `OPENING_BALANCE` rehearsal for a specified Test Entidade/Jornada, **not Production**; affected users and notification method.
3. Named Release Owner, Database Operator, different Independent Approval Holder, backup/recovery owner, who will stop/restart services, and a communication method if a step fails.
4. Source deployment SHA/tree, migration head, backup creation/verification, writer-isolation checklist, signed CSV evidence, expected Test return-to-service conditions, and the STOP/rollback escalation plan.
5. Both participants acknowledge the scope and time. **Do not claim the approval exists because one person typed it in this document.** Any missing authorization or ability to restore service = **BLOCKED**.

**Important ordering:** Bite 33.2 uses SQLite's **online** backup through a running backend. **Create and verify the backup while the Test backend is running; then stop Test writers; only then run the isolated 35.5 importer.** The old 35.5 T04 instructed the reverse and could not work safely. `make server-test-down` must never be confused with the destructive `server-test-down-volumes` or any `down -v` command.

## C. Which machine or screen is each command for?

| Context | How to recognize it | Permitted work here |
|---|---|---|
| **Your Mac / LOCAL repository** | Terminal; `cd ~/projects/EnterpriseRemoteSystems`; usual branch `1078-...` for 35.5/35.6 | `make byte355-initialization-check`, `make byte356-operations-check`, `make local-check`, Git and CI evidence. **Do not run server backup commands here unless it is actually the authorized deployment host** |
| **GitHub (browser)** | Repository → **Actions** → **Deploy Enterprise Remote Systems** → successful **Test** run | Read deploy run's exact revision/tree, environment, result, and URL. A feature branch SHA is **not** proof of what is deployed to Test |
| **ERS Test browser** | `https://tst.enterpriseremotesystems.com`, appropriate actual Test credentials | Read-only People/Journey/Account checks. A Tenant Administrator is not a global Application Administrator |
| **Authorized Test deployment host (SSH)** | Server-side path `/opt/EnterpriseRemoteSystems/test`; `make server-environment-identity-check ENV=test` passes | Existing 33.2 online Test backup, inspect JSON manifest, approved shutdown/restart; do not access Production volumes |
| **Authorized offline Test maintenance runtime** | Approved container/host with Python, OpenSSL, the **same existing** Test `app.db` file path, signed artifacts and writer isolation | Signed `plan`/`apply`/`verify`, **only after** Test backup and approval PASS. No improvised bind mounts, copied live DB, or guest database creation |
| **1Password (own personal session)** | Authorized organizational vault and individually controlled account | Check protected key/credential custody without printing/exposing values. A locator in Git does not mean a vault item exists |
| **35.7 protected evidence directory** | Private operator-approved path outside Git | Non-secret references/JSON, six-gate manifest, separately signed approvals; **never** raw financial files or private keys in Git or chat |

## D. How to obtain and record each requested value (35.5)

Do not fill a field from memory or fabricate a plausible-looking ID. When instructed to **record**, copy the exact displayed value into your approved protected evidence record, alongside its source, UTC timestamp, and who saw it. If output includes confidential data, record only an opaque pointer/digest and do not paste the content into logs or chat.

| Requested field | What it means | Exact source / how to obtain it |
|---|---|---|
| **Actual candidate SHA / Git tree** | Commit and file-tree fingerprint you tested locally | LOCAL repository: `git rev-parse HEAD` and `git rev-parse HEAD^{tree}`. The historical 35.5 branch `1071-...` is **not** the branch required for this 1078 acceptance |
| **Test deployment revision/tree** | Commit actually deployed to **Test**, not your local feature branch | In GitHub **Actions → Deploy Enterprise Remote Systems → successful Test run**, find `Deploying immutable revision <SHA> (tree <SHA>)`; on the authorized Test host compare `git rev-parse HEAD`/`HEAD^{tree}`. **If not identical, STOP** |
| **Test URL** | HTTPS Test browser address | `https://tst.enterpriseremotesystems.com`; confirm environment and approved release, never assume Production URL |
| **Source database identifier** | Real database that the running Test service uses; not its basename alone | From verified Bite 33.2 backup manifest: `environment=test`, `source.container=ers-tst-backend`, `source.database_path` (typically `/app/data/app.db`). Check actual source path; do **not** guess it. Also capture Docker volume identity (`ers-tst_backend-data`) independently via `docker volume inspect` |
| **Test backup file path** | Consistent snapshot created by Bite 33.2 | On authorized Test host while backend runs, execute `make server-backup ENV=test`. Capture **`Verified backup: /.../app-...db`** in its output. Never use `cp app.db` or guess newest file |
| **Backup manifest** | JSON integrity/audit metadata created beside that snapshot | Same command prints **`Backup manifest: ...db.manifest.json`**. It must be beside the selected `.db`. Reverify with `make server-backup-verify ENV=test BACKUP_FILE="$BACKUP_FILE"` |
| **Manifest SHA-256** | Hash of the **manifest JSON bytes**, not the database | On the authorized host: `shasum -a 256 "$BACKUP_MANIFEST"` (macOS) or `sha256sum "$BACKUP_MANIFEST"` (Linux). Record first 64-character hex string. For 35.5 approval this is `backup_manifest_sha256` |
| **Backup SHA-256 / source check** | Digest of database snapshot; distinct from manifest hash | Inspect `backup.sha256`, `source.database_path`, `verification.integrity_check`, `verification.foreign_key_check`, `verification.latest_schema_migration` in the manifest. 33.2 independent verification must PASS; JSON claims alone do not verify the bytes |
| **CSV header / CSV SHA-256** | Exact seven-column, UTF-8 Test-only signed financial positions | Confirm header in the 35.5 technical guide; independently review Test fictitious Journey/Person IDs; compute `shasum -a 256 "$CSV"` (Mac) or `sha256sum "$CSV"` (Linux) **before** signing. Never rewrite CSV after approval |
| **`tenant_id`, `journey_id`, `person_id`** | Internal identifiers, not display labels, for one eligible fictitious Test open Jornada and the corresponding global Pessoa | In the Test UI inspect selected Entidade and Jornada details; use an approved **fixture record** if IDs are not displayed. If neither UI nor fixture contains actual IDs, **BLOCKED** and ask an authorized database operator to obtain them by an approved **read-only** inspection of a verified snapshot. Never invent IDs or silently mutate a Test ledger |
| **`row_count`, `net_brl`, `net_gold_gram`** | Count and **signed** sum of the approved Test CSV rows by value unit | Count the final CSV data rows (excluding header); sum positive and negative `signed_amount` separately by `BRL` and `GOLD_GRAM`. For example `125.50` and `-0.75000000` are illustrative, **not** approved values. Both participants independently compare final totals; record them in protected approval only |
| **Approval reference** | Ticket or authorized record binding the Test import | Existing Test change record agreed under section B; it is **not** automatically generated by the importer |
| **`approved_by` / `executed_by`** | Two authorized **different human identifiers** used in the signed JSON | B's approved non-secret identifier and A's/operator's identifier, each meeting importer's format; confirm real people and approved custody. A second username controlled by A is invalid |
| **Public key and trusted key SHA-256** | Public PEM from authorized signer and digest of that exact PEM file | Authenticate public key identity/fingerprint through independent 1Password custody. Compute hash of the exact public PEM bytes with the platform's SHA-256 tool and compare to trusted record. **Do not trust a hash that only came attached to the approval.** No private key is needed for `verify` |
| **Approval JSON + detached signature** | Independent B's exact reviewed Test import approval and detached RSA/ECDSA signature | Use the **approved organizational signing/custody procedure**. ERS source includes a verifier, **not a 1Password signing service**. Until B has an approved way to sign exact bytes and supply the signature, T04 is **BLOCKED**; never generate a throwaway signing key and call it real acceptance |
| **`BACKUP` / `DB`** | Verified snapshot and actual existing live Test database | The offline importer requires an actual path `app.db`; its exact absolute path must equal the manifest's `source.database_path`. Container mount namespace must satisfy this. If Python/OpenSSL or required file mounts are not available in the approved offline environment, **BLOCKED**; do **not** try the backup file as the `--db` target |
| **UTC time / evidence location** | When a human actually observed something and where approved proof is kept | Run `date -u '+%Y-%m-%dT%H:%M:%SZ'`; record a *non-secret* repository/ticket reference. Never paste secrets, customer financials, passwords or private keys here |

### Operator-only Test recovery selector (35.6 T08, not a LOCAL command)

In the canonical `docs/database-recovery-runbook.md`, the `server-recovery-rehearsal` target accepts `RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME`. On an approved Test host, the authorized Recovery Operator obtains the **actual existing Test off-host backup name** from the independently verified Bite 33.3 receipt, then (and only then) may use the documented Test-only invocation:

```bash
# RUN ON authorized TEST host, under approved isolated restore authorization.
# Do NOT run with the placeholder name or a Production backup object.
make server-recovery-rehearsal ENV=test \
  RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME='app-ACTUAL-VERIFIED-TEST-BACKUP-NAME.db'
```

**PASS:** actual isolated restore/recovery report, integrity, observed service health, measured RPO/RTO, no live-volume mounting and complete test-owned cleanup — not merely exit 0. If the actual off-host object is unavailable or the canonical runbook requires other approved parameters, mark BLOCKED and do not invent values. For Production, separate approval is necessary; this command never authorizes Production recovery or activation.

### D1. LOCALLY: verify candidate Git and CI (read-only)

```bash
# RUN ON: Mac LOCAL normal checkout; no Test or Production database is touched.
cd ~/projects/EnterpriseRemoteSystems
git branch --show-current
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
git status --short
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

**PASS:** actual expected branch/commit and clean tree when testing a committed release; record both SHA and Git tree. On GitHub → Actions → **CI**, find the successful run for that **exact SHA**. Copy its URL and job status, not merely the green badge from another commit.

### D2. ON THE AUTHORIZED TEST HOST: identify Test deployment (read-only)

```bash
# RUN ON: authorized SSH session on deployed server, NOT your Mac terminal.
# These commands observe Test only; do not use production/ paths or env.
cd /opt/EnterpriseRemoteSystems/test
pwd
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
make server-environment-identity-check ENV=test
make server-ps ENV=test
docker inspect ers-tst-backend --format '{{.Image}}'
docker volume inspect ers-tst_backend-data --format '{{.Name}}'
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

**PASS:** actual Test directory/container/volume exists, identity check passes, actual revision/tree agree with the successful GitHub Test deployment. **BLOCKED:** no authorized SSH, unexpected output or source mismatch. `docker inspect` output is an image ID or Docker volume name, not the Git revision.

### D3. ON THE TEST HOST: create and verify the correct Bite 33.2 backup (controlled operation)

**Prerequisites:** approved Test maintenance/change record, authorized backup operator, a running Test backend, and confirmed Test environment. Bite 33.2 is documented in `docs/bite-33-2-backup-creation-retention-and-verification.md`. Run this **before** stopping the backend. The command creates a Test backup; do not run it during an unapproved Production change.

```bash
# RUN ON: authorized Test server, in /opt/EnterpriseRemoteSystems/test.
make server-backup ENV=test
# STOP HERE. Copy the exact path following "Verified backup:" into BACKUP_FILE.
# The path is an actual non-secret server-side value; DO NOT use the placeholder.
BACKUP_FILE='/actual/verified/test/backups/app-YYYYMMDDTHHMMSSZ.db'
make server-backup-verify ENV=test BACKUP_FILE="$BACKUP_FILE"
BACKUP_MANIFEST="${BACKUP_FILE}.manifest.json"
python3 - "$BACKUP_MANIFEST" <<'PYTHON'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); m=json.loads(p.read_text())
for key,value in [('environment',m.get('environment')),('status',m.get('status')),('created_at',m.get('created_at')),('source.container',m.get('source',{}).get('container')),('source.database_path',m.get('source',{}).get('database_path')),('backup.sha256',m.get('backup',{}).get('sha256')),('verification.integrity_check',m.get('verification',{}).get('integrity_check')),('verification.foreign_key_check',m.get('verification',{}).get('foreign_key_check')),('verification.latest_schema_migration',m.get('verification',{}).get('latest_schema_migration')),('repository.revision',m.get('repository',{}).get('revision')),('repository.tree_sha',m.get('repository',{}).get('tree_sha'))]:print(f'{key}: {value}')
assert m.get('status')=='verified' and m.get('environment')=='test', 'wrong Test manifest'
assert m.get('verification',{}).get('integrity_check')=='ok', 'bad SQLite integrity'
PYTHON
# On Linux Test host use sha256sum (not macOS shasum):
sha256sum "$BACKUP_MANIFEST"
```

**PASS:** `make server-backup-verify` exits 0; `status=verified`, `environment=test`, correct `source.container`, `source.database_path`, integrity `ok`, and actual hash recorded. If backup reports off-host replication disabled, record that fact; **never** claim Test off-host evidence that does not exist. If a variable is still the example path, **STOP before executing the follow-on command**. The importer separately validates the **exact** on-disk `BACKUP`/manifest pair and requires repository SHA/tree metadata. A snapshot from a different source is not interchangeable.

### D3b. If the UI does not expose internal Test IDs: read them from the verified Test backup

This is an **exception to UI-first testing** and must be done by an authorized Test Database Operator on a verified **snapshot**, never by querying the live database or exposing personal data. Use a fresh 33.2 verified Test backup from D3. The approved Test Entidade's internal `tenant_id` must already be known from the fixture or authorized Tenant configuration; **do not infer an ID from a display name**.

```bash
# RUN ON: authorized Test host with Python3; BACKUP_FILE from verified D3.
# Never use live app.db as the input.
TENANT_ID='real-approved-fictitious-test-tenant-id'
python3 - "$BACKUP_FILE" "$TENANT_ID" <<'PYTHON'
import sqlite3,sys
from pathlib import Path
p=Path(sys.argv[1]).resolve(strict=True)
assert p.name.startswith('app-') and p.suffix=='.db', 'expected managed backup snapshot'
uri=p.as_uri()+'?mode=ro&immutable=1'
with sqlite3.connect(uri,uri=True) as db:
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert not db.execute('PRAGMA foreign_key_check').fetchone()
    rows=db.execute('''SELECT j.tenant_id,j.id,m.person_id,
                             (SELECT COUNT(*) FROM ledger_entries l
                               WHERE l.tenant_id=j.tenant_id AND l.collaborator_id=j.id)
                       FROM collaborator_journeys j
                       JOIN person_tenant_memberships m ON m.id=j.membership_id
                       WHERE j.tenant_id=? AND j.closed_at IS NULL
                       ORDER BY j.id''',(sys.argv[2],)).fetchall()
    print('tenant_id | journey_id | person_id | preexisting_ledger_entries')
    for row in rows: print(' | '.join(map(str,row)))
    print('zero-ledger open Journey candidates:',sum(row[3]==0 for row in rows))
PYTHON
```

**PASS (discovery only):** the selected Test Entidade matches `TENANT_ID`; at least one candidate has `preexisting_ledger_entries=0`. The operator and Test Tenant Administrator independently match that candidate to the approved **fictitious** Pessoa/Jornada in Test UI before including its IDs in the signed CSV. **BLOCKED** if no candidate, ambiguity, non-Test path, unavailable Python, or unavailable approval. Never create a new Journey, reset Test or alter a ledger just to force a candidate. The query produces IDs, **not an import authorization**.

### D3c. Compute exact signed CSV counts and totals (read-only)

After preparing the protected fictitious Test CSV, inspect it **without changing its bytes**:

```bash
# RUN ON: approved offline Test maintenance runtime; CSV is protected Test-only data.
python3 - "$CSV" <<'PYTHON'
from decimal import Decimal
from pathlib import Path
import csv,hashlib,sys
p=Path(sys.argv[1]); raw=p.read_bytes()
with p.open(newline='',encoding='utf-8-sig') as f:
    rd=csv.DictReader(f)
    expected=['tenant_id','journey_id','person_id','value_unit_code','signed_amount','effective_date','reference']
    assert rd.fieldnames==expected, 'invalid 35.5 header'
    rows=list(rd)
    assert rows and all(r['value_unit_code'] in ('BRL','GOLD_GRAM') for r in rows)
    nets={'BRL':Decimal('0'),'GOLD_GRAM':Decimal('0')}
    for r in rows:nets[r['value_unit_code']]+=Decimal(r['signed_amount'])
print('csv_sha256:',hashlib.sha256(raw).hexdigest())
print('row_count:',len(rows))
print('net_brl:',nets['BRL'])
print('net_gold_gram:',nets['GOLD_GRAM'])
print('distinct tenants:',len({r['tenant_id'] for r in rows}))
PYTHON
```

**PASS (source calculation only):** recorded row count, net signed totals and SHA agree with the independently reviewed Test-only CSV, and all rows belong to the approved Test Entidade. The **35.5 importer remains authoritative** for full identifiers, dates, exact financial precision, ownership, duplicates, approval and signature validation. A source calculation PASS is **not** `plan` or authorization. If values differ, correct the CSV **before** B signs it; after signing, a change requires new approval and signature.

### D4. THEN: isolate Test database writers, *without deleting volumes*

**Prerequisites:** verified Test backup, approved downtime interval and named Test Database Operator. The script is not a general-purpose isolation probe: the operator must also confirm no one-off container or host process is writing SQLite.

```bash
# RUN ON: authorized Test server; this stops the Test stack only.
make server-test-down
# Expected: NO container uses the Test database volume.
docker ps --filter 'volume=ers-tst_backend-data' --format '{{.ID}} {{.Names}}'
# Expected: NO running Test backend container.
docker ps --filter 'name=ers-tst-backend' --format '{{.Names}}'
```

**PASS:** both `docker ps` outputs are empty, and independent Test writer isolation is confirmed. **FAIL/BLOCKED:** another process is using the Test volume, or the wrong environment was stopped. **Never run** `make server-test-down-volumes`, `docker compose down -v`, a direct `.db` copy, or a database reset. T05/T06 cannot proceed until the authorized *offline maintenance runtime* has access to the exact existing Test database and same manifest-bound absolute path. The repository's backend image is **not** a guaranteed Python runtime; do not assume its console includes Python or can sign an approval.

### D5. Check Test approval and import inputs before `plan`

```bash
# RUN ON: the approved offline Test maintenance runtime with reviewed paths.
# Every variable must be the already approved REAL absolute path, not an example.
# These checks are read-only and DO NOT create/sign an approval.
python3 - "$CSV" "$BACKUP_MANIFEST" "$APPROVAL" "$PUBLIC_KEY" <<'PYTHON'
import hashlib,json,sys
from pathlib import Path
csv,manifest,approval,key=map(Path,sys.argv[1:])
m=json.loads(manifest.read_bytes()); a=json.loads(approval.read_bytes())
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
print('csv_sha256:',H(csv))
print('backup_manifest_sha256:',H(manifest))
print('public_key_sha256:',H(key))
print('approved_environment:',a.get('environment'))
print('approved_tenant_id:',a.get('tenant_id'))
print('row_count:',a.get('row_count'))
print('net_brl:',a.get('net_brl'))
print('net_gold_gram:',a.get('net_gold_gram'))
assert a['csv_sha256']==H(csv),'CSV changed after approval'
assert a['backup_manifest_sha256']==H(manifest),'manifest differs from approval'
assert a['approval_key_sha256']==H(key),'public key differs from approval'
assert a['environment']=='test' and m['environment']=='test','wrong environment'
assert a['approved_by']!=a['executed_by'],'same claimed approver/executor'
PYTHON
openssl dgst -sha256 -verify "$PUBLIC_KEY" -signature "$SIGNATURE" "$APPROVAL"
```

**PASS:** hashes correspond exactly, signature says `Verified OK`, approvals identify **two independently verified actual humans**, and the *separately authenticated trusted key fingerprint* matches. Script cannot verify people or custody; those checks require B and the authorized reviewer in 1Password. **BLOCKED:** missing files, trusted key, approved signing procedure, or offline file access. Only then follow 35.5 T05 (`plan` read-only), T06 (`apply` exactly once, Test only), and T07 (`verify` read-only) in order, using the manual's complete commands. **Do not** perform these steps on Production for acceptance testing.

## E. How to collect evidence for every manual test, without improvisation

| Test | Evidence source, identity and expected outcome | Inability to obtain it |
|---|---|---|
| **35.5 T01** | A, Mac LOCAL: Git SHA/tree, `make byte355-initialization-check`, head migration, CI exact commit. Synthetic signing tests only | BLOCKED on missing tooling/CI |
| **35.5 T02** | A, LOCAL: read `backend/migrations/000080_production_opening_balance.up.sql` and offline migration test output; no manual SQL writes | BLOCKED on missing source/validation |
| **35.5 T03** | Tenant Admin in **Test browser**: expected fictitious Entidade, Pessoa, active Vínculo and zero-ledger open Jornada; record IDs from approved fixture or read-only snapshot | BLOCKED on missing safe fixture/IDs |
| **35.5 T04** | A/B, approved Test change + real backup. Use sections B/D2/D3/D4/D5 and signed approvals; **backup while running, stop writers afterward** | BLOCKED if no independent signer, source, or maintenance authorization |
| **35.5 T05** | A authorized Test offline operator: read-only `plan` with verified signed CSV. Record `PASS: Byte 35.5 plan; rows=...; net_BRL=...; net_GOLD_GRAM=...; csv_sha256=...` and status | BLOCKED if T04 incomplete |
| **35.5 T06** | Same operator after approved `plan`: Test-only one-time `apply` with exact confirmations. Record audit reference, exit status, UTC time, approved CSV hash | BLOCKED if any prerequisite not PASS; never retry blindly |
| **35.5 T07** | Same operator: `verify` exact CSV hash/totals/immutability; negative cases from **disposable** suite, not destructive SQL on real Test | BLOCKED if T06 incomplete |
| **35.5 T08-A** | A, Test UI: tenant-role isolation, no required financial import | BLOCKED without distinct Test role accounts |
| **35.5 T08-B** | A, Test UI: imported historical balances and signs reconcile; collaborator only sees own account | BLOCKED until T06/T07 PASS |
| **35.5 T09** | A, LOCAL: each of 23 named negative-case PASS lines from disposable `make byte355-initialization-check` | BLOCKED on missing results; no live Test destructive tests |
| **35.5 T10** | A/B decision record: Decision A software, Decision B Test operational, Decision C **Production NOT AUTHORIZED** | Keep B BLOCKED until entire rehearsal passes |
| **35.6 T01** | A, LOCAL: candidate SHA/tree and clean status | BLOCKED when source unclear |
| **35.6 T02** | A, LOCAL: recovery manifest keys, 1Password locator policy, make checks. This does **not** prove vault access | T07 separately BLOCKED until observed |
| **35.6 T03** | A, LOCAL: `make two-human-administrators-check`, Go/Python simulated enrollment tests | Does not qualify as real human enrollment |
| **35.6 T04** | A, LOCAL: `make promotion-readiness-check`, `make local-check`, matching CI, scoped Docker cleanup | BLOCKED if CI/tooling missing |
| **35.6 T05** | Actual named Test GLOBAL admin: Test browser → Administration → Authentication/Authorization/Audit Logs; record non-secret IDs and scope | BLOCKED if no actual Test admin |
| **35.6 T06** | Actual A and B with **separate** Test 1Password + ERS Accounts: follow `docs/bite-3367/production-operational-runbook.md`, Gate 2 and §6 TC-01–TC-04. Record distinct Account/Actor IDs and reset audit **not token** | BLOCKED if either human/enrollment absent |
| **35.6 T07** | A, B, independent reviewer: each signs into their **own** 1Password account and verifies actual access to five items listed in 35.6 runbook §3; no secrets in screenshots | BLOCKED if vault items/independent MFA missing |
| **35.6 T08** | Authorized recovery operator: `docs/database-recovery-runbook.md` and 33.6 rehearsal with **real** Test/isolated backup receipt, UTC start/end, RPO/RTO ≤24h/4h, scoped teardown | BLOCKED if no approved source or isolated run |
| **35.6 T09** | A and B: separate software vs operational decisions; T06–T08 must actually be observed for Production operational PASS | STOP/NO-GO on incomplete human gates |
| **35.6 T10** | A and independent Linux developer: `make local-fixtures-ensure`, then `make local-fixtures-check`; confirm 11 exact fixture identities and password custody, no database reset | BLOCKED if independent Linux result/credentials absent |
| **35.7 T01** | A, **after 1168 patch implementation**: `make byte357b-launch-check`, LOCAL/promotion suite and exact CI | BLOCKED until current checkout contains implementation and matching CI |
| **35.7 T02** | Release operator + Test role users: actual deployed Test SHA/tree, HTTPS health, migrations, smoke, 35.5 B Test rehearsal | BLOCKED if deployed/financial rehearsal incomplete |
| **35.7 T03** | Security reviewer + Production GLOBAL admin: approved read-only Prod checks, HTTPS, Tenant isolation and enforced pilot account admission | BLOCKED if permissions/admission cannot be demonstrated |
| **35.7 T04** | Authorized Production DB operator + B: approved 35.5 **Production read-only plan**, migration preservation, no actual import yet | BLOCKED if backup/source/approval missing |
| **35.7 T05** | Recovery operator/observer: actual **Production off-host** backup object version and separate isolated restore, integrity, measured RPO/RTO | BLOCKED without real receipt and independent recovery |
| **35.7 T06** | Operations owner: actual scheduled Production backup, alert delivery, retention policy and named on-call ownership | BLOCKED if monitoring inaccessible |
| **35.7 T07** | Actual A/B and reviewer: completed 35.6 T06–T08 (not synthetic) with distinct human evidence | BLOCKED if any 35.6 human test incomplete |
| **35.7 T08** | Authorized release evidence reviewer: six gate source observations, protected JSON artifacts + SHA-256, `launch.json`, and 35.7 offline `verify`. Every artifact from real evidence, not template values | BLOCKED until all six independently observed |
| **35.7 T09** | Two different authorized real humans with independent approved signer custody: each signs own approved JSON, trusted PEM fingerprints verified separately, then `authorize`. Receipt remains **NOT ACTIVATED** | BLOCKED if no approved signing procedure or independent verification |
| **35.7 T10** | Authorized Production release/db operators and customer Tenant admin: **separately** approved pilot cutover, post-import verification, smoke, monitoring and STOP/rollback. Never trigger with an offline test | STOP/NO-GO until all gates/approval and access containment PASS |

## F. Additional 35.7 evidence terms and how to obtain them

These fields are used **only on the implemented 1168-based 35.7B candidate after its patch is committed and the current HEAD ZIP is supplied**; the commands below are not executable against the 1078 branch.

| Term | Meaning / source |
|---|---|
| **Six launch gates** | The six frozen IDs in `docs/bite-35/launch-baseline.json`: release integrity, security, data preservation, backup/restore, operational continuity and administrator recovery. A code PASS does not imply these external gates PASS |
| **Launch evidence manifest (`launch.json`)** | Protected operator JSON that indexes real observations, source references and hashes for every check, using `python3 -B scripts/ers-byte357b-launch.py init` as a **BLOCKED** starting point |
| **Source observation** | One non-secret JSON record for one check, naming its real observer, UTC time, environment, exact SHA/tree and evidence URL/ticket, with required `details`. Create only after actually examining original evidence |
| **Source/reference URL** | The approved ticket, GitHub Actions run, backup receipt record or protected audit source that the reviewer can independently retrieve. A typed sentence is not primary evidence |
| **`release_revision` / `release_tree_sha`** | Target **deployed** Production Git commit SHA/tree, independently compared to deployment evidence; do not copy any unapproved feature-branch SHA as evidence of a deployed release |
| **Manifest SHA-256** | SHA-256 of exact finished `launch.json` bytes; `sha256sum launch.json` on Linux, `shasum -a 256 launch.json` on Mac; cannot change after signature |
| **Off-host object version** | Actual immutable/versioned Production S3 object version from the verified 33.3 off-host receipt; do not invent it or substitute an on-host backup filename |
| **RPO / RTO** | **Measured** age of recoverable backup and actual time to restore usable service; 35.7 limits are 86,400/14,400 seconds; record start/end time and source independent of the claim |
| **Approval receipt** | Output of 35.7B `authorize` after two independent signed approval records; **NOT ACTIVATED**, no deploy/DB changes |
| **Pilot admission containment** | Evidence that unapproved customer Accounts cannot sign in/enter Production; no new activation toggle exists in this bite. If existing controls cannot enforce it, STOP/NO-GO |
| **GitHub Production Environment approval rule** | Real repository Settings → Environments → `production` protection settings, including effective required reviewers for push-triggered `deploy.yml`. YAML mentions an Environment but cannot prove reviewer enforcement. If you cannot inspect protection, STOP/NO-GO |

### 35.7B CLI values (after applying and committing the 1168 patch)

Run `python3 -B scripts/ers-byte357b-launch.py verify --help` and `authorize --help` in the **matching 1168-derived checkout**. `verify` requires `--evidence`, `--expected-revision`, and `--expected-tree-sha` from independently checked Production release evidence. `authorize` additionally needs two protected signed approval files, their signatures, their public PEM files, **two independently trusted** public-key SHA-256 fingerprints, and a new protected output receipt path. The exact commands are in `docs/bite-35/byte-35-7b-production-go-live.md`; never copy a sample timestamp, identity or placeholder into real evidence. **Do not mark T08/T09 PASS from software-only fabricated artifacts.**

## G. Common stopping, cleanup and report rules

**STOP and record BLOCKED** before any mutating action if: environment/URL/revision is uncertain; an actual human is not independently authorized; no protected maintenance ticket; no current verified backup; signed CSV or public key differs; Docker volume/path identity is unclear; some database writer is still running; no approved offline Python runtime/mounts; or no tested recovery owner. Do not choose arbitrary credentials, Test database files, signing keys, or container images to make a test executable.

For each test, record: `{bite, T##, environment, real operator, ERS identity/context if UI, exact revision/tree, preconditions, command/GUI action, UTC, exit status, expected, observed, protected evidence reference, cleanup, result}`. Keep full approval material, private keys and financial CSV outside Git/chat. Use a protected change system; do not expose backups in the acceptance report. Preserve the existing LOCAL/Test/Production databases. For any Docker tests, record created container IDs **before** execution, stop/remove **only** test-created resources afterward, verify relevant ports (including 8080 if used) and the Test service's intended state. If none created, mark cleanup N/A. Never indiscriminately run `docker system prune` or `compose down -v`.

**Restart after a Test maintenance session only after** the operator and independent reviewer have checked `plan`/`apply`/`verify` results, the Test database is consistent, and the agreed change authorizes reopening. On authorized Test host, normal restart is `make server-test-up`; follow with `make server-ps ENV=test` and `make server-test-smoke` (per existing release runbooks), then perform 35.5 T08 UI checks. If operation failed, **do not blindly restore or restart**; invoke the established recovery/rollback authority. No Production reset/import/activation is permitted by this handbook.

## Glossary Impact

Add these **operational, non-ERS-account** terms to the operations glossary: Release Owner / Release Coordinator; Database Operator; Independent Approval Holder; Maintenance Window; Test Deployment Revision; Source Database Identifier; Verified Backup Manifest; Evidence Source Observation; Independent Reviewer; Controlled Pilot Activation. These do **not** create roles, Tenant Actors, Memberships or privileges in the ERS application. Preserve the prior definitions of `OPENING_BALANCE`, Person, Entidade, Jornada, Application Administrator, and the six launch gates.
