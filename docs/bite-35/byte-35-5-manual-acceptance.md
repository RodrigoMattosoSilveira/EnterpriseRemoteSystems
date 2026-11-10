# Byte 35.5 — Manual acceptance before promotion

**Work directory:** `~/projects/EnterpriseRemoteSystems` (single ordinary Git checkout; no worktrees). **Branch:** `1071-355-production-database-initialization`. **Required baseline:** `feeea49d3dae9b9c2866be65b244cfcee46ef8ce` before patch application. The actual committed post-patch SHA must be recorded during test execution. Do not change the working LOCAL `backend/data/app.db` for this acceptance.

**Identities:** (1) Release Owner, authorizes the revision and Test environment; (2) independent Approval Holder, whose 1Password-controlled key signs the approval; (3) Database Operator, a **different human** from Approval Holder; (4) Test Entidade Administrator, ordinary tenant-scoped actor; (5) Test Collaborator, ordinary Person actor; (6) Application Administrator, application-global, used only for authorized global operations. Never invent a second actual human approval or use Application Administrator as an ordinary Entidade Actor.

Record for every test: test ID; UTC date; actual operator; environment and selected Entidade; Git revision/tree; evidence reference without secrets; `PASS`, `FAIL` or `BLOCKED`. `BLOCKED` is correct if an operational precondition is unavailable. **Only the offline tests are executable without a deployed Test environment.** No Production write is a manual acceptance requirement for this pre-promotion check.

## T01 — Exact baseline and safe offline regression

**Identity/context:** Release Owner, LOCAL terminal; no database writer or ERS authentication necessary. From the sole ERS directory, verify branch and SHA, apply the patch using the accompanying instructions, then execute `make byte355-initialization-check` and `make deployment-migration-head-check`. **PASS:** both exit 0; full migrated temporary schema, positive BRL and negative GOLD_GRAM, signature, duplicate, rollback and integrity tests pass; existing LOCAL DB unchanged. **FAIL:** any nonzero code. Record SHA and log path.

## T02 — Migration rehearsal and schema preservation

**Identity/context:** Database Operator, disposable offline Test-shaped fixture. Run T01 and review the new migration. Confirm `000080_production_opening_balance.up.sql` is the pinned final deployment migration; it preserves previous ledger rows, indexes, triggers, foreign keys and immutable work attribution, and creates audit + opening-entry protection. Do not run schema changes against Production. **PASS:** T01 migration checks and independent data-preservation assertions pass; **FAIL:** missing trigger/index or broken FK; **BLOCKED:** tooling unavailable.

## T03 — Test UI canonical identity and zero opening state

**Identity/context:** Test Entidade Administrator signed in to the ordinary Test application and a fictitious Test Entidade selected (not Production). Open People; confirm the test Pessoa and active Entidade membership, then open Collaborators and confirm the same Person's open Jornada. Open the Jornada's Current Account and inspect BRL and GOLD_GRAM balances **before** import. **PASS:** correct active membership/Journey, exactly that Entidade, zero initial balance; **FAIL:** duplicate identity or prior financial history; **BLOCKED:** no approved Test fixture. Do not create or change any financial record for this test.

## T04 — Real Test backup and independent approval evidence

**Identity/context:** Database Operator and independent Approval Holder; Test database offline after approved schema migration. Verify the existing 33.2/33.3 backup/manifest through the established tools, record source DB identifier and hashes, check effective-date and signed totals against the fictitious Test CSV, and obtain a detached signature from the approved 1Password-controlled key. Compare the independently retrieved trusted public-key fingerprint to the signed JSON. **PASS:** two distinct human identities and all matching hashes/evidence; **FAIL:** shared approver/operator identity, mismatched hash or invalid signature; **BLOCKED:** 1Password custody/backup/rehearsal not available.

## T05 — Test signed dry-run (no write)

**Identity/context:** Database Operator, Test offline maintenance context, same existing Test volume. With T04 artifacts, run `plan` exactly as documented in the technical guide. Confirm no data modification and correct signed totals. **PASS:** `PASS: Byte 35.5 plan` and unchanged ledger/import counts; **FAIL:** unexpected mutation or accepted mismatch; **BLOCKED:** artifacts or approved Test environment unavailable.

## T06 — Test one-time transactional import

**Identity/context:** Database Operator, Test offline maintenance context; explicitly verify all database writers stopped. Run `apply` once with Test literal confirmation. **PASS:** exactly one auditable import, proper `OPENING_BALANCE` entries, positive and negative amounts, no ordinary earnings/bonus entries; **FAIL:** any partial import, missing receipt of approval evidence or cross-Entidade row; **BLOCKED:** T03–T05 incomplete. Do not execute on Production.

## T07 — Read-only reconciliation and immutable ledger

**Identity/context:** Database Operator, Test offline. Run `verify` for the same signed input; confirm signed totals, unit precision, rows, approval hashes, SQLite integrity and foreign keys. Attempting a second `apply` on the approved Test fixture must fail without changes. The regression independently proves opening ledger entries and import audit rows cannot be updated/deleted. **PASS:** exact reconciliation, duplicate rejection, immutable evidence; **FAIL:** discrepancy or mutation; **BLOCKED:** T06 not completed.

## T08 — UI presentation and tenant isolation

**Identity/context:** Test Entidade Administrator in Test, correct fictitious Entidade selected. Open a test Journey's Current Account and check history: **saldo histórico de abertura** distinct from bonus or ordinary earnings. Confirm both BRL and GOLD_GRAM signs match signed Test CSV. Switch to a different Test Entidade using an authorized independent tenant identity and verify the first Entidade's opening positions are not visible. Then sign in as Test Collaborator and view their own read-only balance. **PASS:** correct role scope, code translation, balances, privacy; **FAIL:** incorrect signs, missing row, leaked tenant data; **BLOCKED:** no Test fixture/UI deployment.

## T09 — Failure/rollback and Production refusal

**Identity/context:** Release Owner reviewing isolated test logs. Confirm negative regression covers tampered CSV/approval, mismatched environment, missing signature, wrong/unknown signer fingerprint, invalid tenant/membership, duplicate imports, malformed amounts and rollback. Inspect production safety controls and verify that no Production command was run as part of acceptance. **PASS:** all cases fail closed, no live Production access; **FAIL:** accidental Production mutation or unsafe bypass; **BLOCKED:** incomplete regression evidence.

## T10 — Production launch boundary and release evidence

**Identity/context:** Release Owner and independent operator, no Production data write. Record matching-sha LOCAL and CI results, real Test migration/rehearsal evidence, approval, backups, complete six gates and named administrator/recovery operational readiness. Explicitly mark missing 35.6 and 35.7 acceptance as **BLOCKED**. **PASS for Byte 35.5 software readiness:** all above software and Test procedures PASS, and unresolved launch dependencies honestly recorded as blockers. **FAIL:** claiming Production activation or real-import authorization from static tests. **BLOCKED:** no deployed Test acceptance.

## Teardown and preservation

- Stop only test-created processes or temporary maintenance containers, if any; record their IDs when launched. Remove those containers, verify none remain and any temporary ports are free. Do not stop unrelated Docker containers.
- The Python offline suite cleans up its own temporary databases and test signing key; no Docker containers are created by that suite.
- Never remove a real local, Test or Production `app.db`, rollback backup, manifest, audit record, or off-host receipt merely to clean up tests.
- Keep reviewed evidence without passwords, raw private keys, real customer identifiers or financial CSV contents. Production import remains separately approval-gated.

**Glossary Impact:** `OPENING_BALANCE` = separately classified and immutable historical saldo de abertura, never bonus or earnings. See the technical guide for the signed approval contract.
