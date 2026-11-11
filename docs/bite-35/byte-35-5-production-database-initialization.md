# Byte 35.5 — Guarded Production database initialization and opening balances

**Status: implementation only; no live Production data import is authorized by this document.**

## Purpose, scope, and Occam's razor

Use the **existing** ERS SQLite database for each environment. There is no extra worktree, database, service, import daemon, or reset. The established Bite 33.5 migration/recovery gate initializes an empty database from migrations, or safely migrates an existing database. The regular ERS administration UI creates the Entidade, Pessoas, Vínculos and Jornadas; no new People/Journey import API has been added. Byte 35.5 adds only the missing financial classification and one guarded offline opening-balance CSV import. Never use the 35.4C fictitious-training provisioner in Production.

People and Journeys **must** exist before historical entries are imported. Fresh Journeys start with zero balances. A positive signed amount is a **CREDIT** (Entidade owes the Collaborator); a negative signed amount is a **DEBIT** (Collaborator owes the Entidade). Each unit is independent: `BRL` uses at most two decimals and `GOLD_GRAM` at most eight. `OPENING_BALANCE` is not a bonus, an earnings accrual, an expense, or a payment. The historical adjustment never awards a new entitlement or bypasses receipt/closure rules.

## Security and lifecycle boundaries

- This implementation **does not access your Production server**, create a Production database, enroll an administrator, or activate a customer. The six Bite 35.7 launch gates and 35.6 human administrator/recovery handoff are still mandatory.
- Do **not** run the live import before the real customer-data authorization gate passes. Do not create real customer data in Production merely to rehearse this bite.
- The initial end-to-end rehearsal must be performed with a fictitious **Test-only** Entidade, Pessoas, Journeys, CSV, human identities and Test backup. The automated regression uses isolated disposable SQLite databases; never reuse the operational LOCAL database.
- The database migration `000080_production_opening_balance.up.sql` must be applied only by the existing guarded deployment migration process, with approved Test rehearsal, writer isolation, verified backup, off-host protection where configured, and rollback gates. It does not import data.
- No production database reset, demo seed, file replacement, manual SQL balance rewrite, or force-restore is permitted.
- The script accepts only `APP_ENV=test` or `APP_ENV=production`, an existing non-symlink `app.db`, a matching environment-specific verified backup, and an approved public-key fingerprint. It cannot create the target database or apply migrations.
- Before applying, confirm an off-host backup receipt in Production, source-writer isolation, independent named approver and operator, and the signed approval. A human remains responsible for authenticating the 1Password key owner and confirming backup recency/off-host custody; a file checksum alone is not proof of those operational facts.
- After import, do not silently rerun to change amounts. A duplicated CSV is refused. Each Journey/unit permits at most one opening position, and an existing Journey ledger blocks initialization. Remediation after a mistake requires a separate explicitly approved accounting correction plan; never edit opening entries directly.

## The input CSV

Seven exact headers **in this order**, UTF-8 and standard comma-separated CSV:

```text
tenant_id,journey_id,person_id,value_unit_code,signed_amount,effective_date,reference
```

Examples for a Test-only fixture (illustrative, not approved for Production):

```text
test-355,journey-355,person-355,BRL,125.50,2026-01-01,APPROVED-355-BRL
test-355,journey-355,person-355,GOLD_GRAM,-0.75000000,2026-01-01,APPROVED-355-GOLD
```

`tenant_id` is the canonical stored Tenant ID (Portuguese UI: **Entidade**). `journey_id` is the canonical Journey ID; `person_id` is the canonical global Person ID from the Journey's Membership. Use the original historical effective date, not a future date. No empty or zero rows. Maximum 50,000 rows / 4 MB. Exactly one row per Journey and value unit. Store any real CSV only in an authorized protected operator location, outside the repository, tickets, chat, or CI artifacts.

## Signed approval contract

The **independent approver** reviews the final CSV, its SHA-256, record count, signed net totals, verified backup manifest, and (Production only) off-host receipt. Approver and executor must be **different named humans**. Approval JSON keys are exact:

```json
{
  "schema_version": 1,
  "environment": "test",
  "tenant_id": "test-355",
  "csv_sha256": "<64 lowercase hexadecimal digits>",
  "backup_manifest_sha256": "<64 lowercase hexadecimal digits>",
  "offhost_receipt_sha256": "",
  "approval_reference": "<independently approved ticket/reference>",
  "approved_by": "<named independent human>",
  "executed_by": "<named executing human>",
  "approval_key_sha256": "<SHA-256 of approved public PEM key bytes>",
  "row_count": 2,
  "net_brl": "125.50",
  "net_gold_gram": "-0.75000000"
}
```

`<...>` are mandatory placeholders, not runnable values. For Production set environment to `production`, supply the verified off-host receipt SHA-256, and use the actual Entidade/approved values. `net_brl` and `net_gold_gram` are **signed net totals** across all rows, not totals of absolute values.

The approver signs the **exact bytes** of `approval.json` using the organization's independently controlled RSA/ECDSA signing key; the script checks a detached SHA-256 OpenSSL signature (the equivalent of `openssl dgst -sha256 -verify approved-public.pem -signature approval.sig approval.json`). The private key must remain under **1Password-approved custody** and never be committed to Git, uploaded to ChatGPT, printed in commands, or copied into an unattended deployment container. Use the existing authorized signing procedure. The executor obtains a separately authenticated approved public-key fingerprint from the 1Password entry; do **not** trust a fingerprint supplied solely alongside the same approval JSON.

The signed JSON and signature, CSV, verified backup manifest, verified off-host receipt, signer public-key identity/fingerprint, approval ticket, and Test rehearsal evidence belong in protected operational evidence storage. The live database records their hashes and signed totals, not the confidential source documents.

## Operator workflow — Test rehearsal, then separately authorized Production

**Precondition:** Approved Test revision/tree, completed guarded migration to `000080_production_opening_balance.up.sql`, no database writers during application, existing Test `app.db`, and ordinary UI-provisioned fictitious Test Entidade, Pessoas/Vínculos and zero-balance Journeys. Test and Production require the same exact operating sequence, each with its **own** signed approval, source backup, and environment. Never reuse Test approval on Production.

1. **Technical release operator (not Application Administrator via tenant Actor):** confirm the exact Git SHA, required database migrations and availability of the approved Bite 33.5 migration/recovery gate. Rehearse applying the migration on a verified isolated copy before migrating Test. Record actual Test deployment logs; do not equate CI with deployment evidence.
2. **Entidade Administrator, in Test UI under the fictitious Test Entidade:** create or verify each fictitious Pessoa, active Vínculo and open Jornada through the usual UI. Check identity, tenant scope, and zero Current Account balance before proceeding. Do **not** change financial or role-grant records merely to prepare training.
3. **Database operator, Test environment:** stop **all** application/database writers, create and verify a current Test backup via established Bite 33.2 procedures, confirm the backup manifest source database path, and retain the backup. Use the established off-host procedure where enabled. Do not bypass its validation.
4. **Independent approval owner:** authenticate the approved public signing key through 1Password; independently review the proposed CSV, counts/totals, verified backup manifest hash, and operational approval; produce the signed exact JSON and detached signature. The operator records that the signer and executor are different humans.
5. **Operator, Test offline maintenance container:** arrange protected file access to the **same existing** `app.db` volume, backup/manifest, CSV, approval, signature, public key, and any off-host receipt. Set `APP_ENV=test`. Use the following interface, replacing every path and identifier with the actual approved values. DO NOT run the example unchanged:

```bash
APP_ENV=test python3 -B scripts/ers-byte355-opening-balance.py plan \
  --db /app/data/app.db --csv /protected/opening.csv \
  --approval /protected/approval.json --signature /protected/approval.sig \
  --public-key /protected/approved-public.pem \
  --approved-public-key-sha256 '<independently-verified-64-digit-fingerprint>' \
  --backup /protected/app-preimport.db \
  --backup-manifest /protected/app-preimport.db.manifest.json \
  --environment test --tenant-id '<test-tenant-id>' --operator '<executing-human-id>'
```

**Expected:** `PASS: Byte 35.5 plan; rows=N; net_BRL=X; net_GOLD_GRAM=Y; csv_sha256=...; no database reset`. `plan` opens the existing target **read-only**, does not apply migrations, and never inserts anything. If any check fails, STOP; a changed CSV requires fresh approval and a new signature. Do not re-sign by the executor.

6. **Operator, Test only, with real writer isolation and approval verified:** run the same command using `apply` instead of `plan`, adding:

```text
--confirm APPLY-OPENING-BALANCES-TEST --writers-stopped ALL_DATABASE_WRITERS_STOPPED
```

The command uses one `BEGIN IMMEDIATE` SQLite transaction. Failure leaves no partial import. **Do not run the Production variant yet.**

7. **Operator, Test offline:** run the same command using `verify` instead of `plan`, omitting writer and apply confirmation arguments. This is read-only and checks every signed ledger row, directions, amounts, dates, source identifiers, audit hash, and row count. Confirm `PRAGMA integrity_check=ok` and no foreign-key violations. Verify a second `apply` is rejected as a duplicate; do not manually reverse or alter ledger rows.
8. **Entidade Administrator, Test UI:** reopen Current Accounts for the specific Test Journeys. Verify the BRL and GOLD_GRAM signed positions and that the history identifies **saldo histórico de abertura**, not a bonus. Verify no cross-Entidade balance disclosure. Sign out. Technical staff record non-secret screenshots/results and reconcile against signed totals.
9. **For Production only, after 35.6/35.7 launch authorization:** repeat the entire approval, backup, source-identity, and actual execution process with Production-specific evidence. Use `APP_ENV=production`, `--environment production`, the Production signed approval and verified off-host receipt, and only then the literal `--confirm APPLY-OPENING-BALANCES-PRODUCTION`, `--writers-stopped ALL_DATABASE_WRITERS_STOPPED`, and a verified `--offhost-receipt /protected/production-receipt.json`. The executor must confirm all services/writers stopped and use the **existing Production volume**; do not copy a Test or LOCAL database into Production. Retain before/after backup and human signoff records.
10. Restart only the approved deployment revision, perform established health/smoke and migration verification, then carry out controlled activation exclusively under Byte 35.7. A Byte 35.5 test PASS is **not** a Production-launch PASS.

**STOP on:** wrong environment, unknown key, missing verified backup or off-host receipt, writer not stopped, wrong schema/Entidade, any Journey containing preexisting financial history, unknown Person/membership, inconsistent amount, duplicate, signature failure, or ledger reconciliation mismatch. Never bypass via SQL or direct modification. Escalate to release owner.

## Offline automated verification

From the sole ERS work directory, on the stated `1071` branch and correct baseline:

```bash
cd ~/projects/EnterpriseRemoteSystems
make byte355-initialization-check
make deployment-migration-head-check
make byte354-readiness-check
make local-check
```

Expected: zero exit codes and the `PASS: Byte 35.5 offline ...` line. The first check creates and removes its **own disposable temporary SQLite databases and ephemeral test-only keys**. It does not read `backend/data/app.db` or any deployed server, start Docker, or modify a live database. No Docker cleanup is needed for this specific check. Full `make local-check` can invoke other existing suites; follow their normal cleanup requirements. Production activation requires actual Test and Production operational evidence, not merely these tests.

## Manual acceptance

Execute the separate [35.5 manual acceptance checklist](byte-35-5-manual-acceptance.md). Mark each step **PASS / FAIL / BLOCKED**, with named operator, environment, selected Entidade, exact release revision/tree, and redacted evidence references. Never put signing private keys, real financial details, passwords, or personal records into test reports.

## Glossary Impact

- **Saldo histórico de abertura / OPENING_BALANCE:** separately classified, immutable historical credit/debit posted once per open Jornada and value unit; positive = due to Collaborator, negative = due from Collaborator.
- **Aprovação assinada de importação:** independent cryptographic approval bound to CSV, environment, Entidade, counts, signed totals, verified backup evidence, and signer key.
- **Reconciliation:** signed approved positions must match immutable ledger entries and the Current Account projection in both units.

No changes to canonical Person, Membership, Actor, or Journey semantics. Historical opening balances are never bonuses.
