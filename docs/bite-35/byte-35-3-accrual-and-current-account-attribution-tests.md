# Byte 35.3 — Acúmulo and Conta Corrente work-attribution correction

**Manual acceptance — LOCAL only; UI first.** This is a supplemental test of the
financial evidence for Byte 35.3, to be run after the existing P-01 and P-02
preflight in `byte-35-3-actual-work-location-override.md`. It does **not**
authorize resetting the database or changing real accounting records.

## Baseline and safe setup

- **Acting identity:** LOCAL Tenant A Administrator, `e2e-authz-admin-tenant-admin@example.com`.
- **Credential source:** 1Password vault `ers-development`, LOCAL ADMIN-A entry. Do not record passwords.
- **Selected Tenant/context:** `E2E Authorization Admin Boundary`, Tenant Administrator workspace.
- **Isolation identity:** LOCAL Tenant B Administrator `e2e-isolation-tenant-admin@example.com`, 1Password `ers-development`, LOCAL ADMIN-B; Tenant `E2E Operational Isolation`.
- **Application:** browser URL printed by `make local-frontend` (normally `http://localhost:5173`), LOCAL only.
- **Work data:** a **dedicated, synthetic, unpaid and unposted** Work Period and Collaborator authorized for this test. Never reuse an irreplaceable period or post into actual financial history. Record the work period ID/date, collaborator, and all before-values before modifying any record. If none exists or a safe fixture cannot be prepared through approved UI steps, **BLOCKED**; do not reset, seed, or directly edit SQL to fabricate one.
- **Operational prerequisites:** Stop the backend before migration, complete P-01's fully verified SQLite backup/integrity procedure with the confirmed effective `DB` path, then start normally with `make local-backend` (Terminal A) and `make local-frontend` (Terminal B). Look for `000079_work_attribution_evidence.up.sql` applied or already applied by the normal startup script. Do **not** run migration SQL by hand. In Terminal C, repository root, run `make local-smoke`; expected exit 0 and `Local smoke tests passed`. Stop on missing/failed backup, migration, or startup. Do not modify Development/Test/Production.

## AT-01 — Work performed appears on each Acúmulo item

1. Sign in as ADMIN-A, select **E2E Authorization Admin Boundary**, and choose **Português (Brasil)**.
2. Open **Períodos de trabalho**. Using visible period cards, open the recorded safe Work Period and open **Plano**. Record the original **Setor, Local e Tarefa** for the chosen Collaborator. Record the fixed daily BRL remuneration for later comparison if the fixture uses daily BRL. Do not change informed assignments.
3. Choose **Resultados Reais** and locate that Collaborator. Select **Trabalhou**. Set **Setor real**, **Local real** and **Tarefa real** to three permitted active values that differ from the informed values. Record all three displayed labels. Click **Salvar trabalho realizado**; refresh and confirm persistence.
4. Open **Acúmulo** and, **only if the Work Period and its Collaborator are explicitly approved synthetic financial fixtures**, use the ordinary Run Accrual action. Provide the required run notes, for example `Byte353 financial attribution LOCAL acceptance`.
5. Inspect that Collaborator's item in the resulting Acúmulo transactions table (even when an item is PENDING due to missing production). It must show **Trabalho realizado** followed by **Setor real**, **Local real**, **Tarefa real**, exactly matching the three saved labels. Confirm the amounts continue to reflect informed payment rules, not the actual override.

**PASS:** same three labels visible per Collaborator, with correct amount and no modification to the informed triple. **FAIL:** labels missing, wrong/mixed-Tenant labels, changed informed assignment, or changed payment basis. **BLOCKED:** an approved safe fixture or permission to run a synthetic accrual is unavailable. **Handoff:** keep the created run for AT-02; do not repeatedly recalculate or post without approval.

## AT-02 — Conta Corrente preserves the posted attribution

1. Continue as ADMIN-A in Tenant A with AT-01 PASS. If and only if the run is **READY_TO_POST** and a financial posting to this synthetic fixture is approved, use the visible **Post ready** / **Lançar prontos** action in **Acúmulo**. Stop if any amount, status, or permission is unexpected; never post a working real account simply for acceptance.
2. After confirmation, open the collaborator's **Conta Corrente** using the visible link from the posted item or the Collaborator page. Locate the entry for this Work Period (compare Work Period date/source and amount).
3. Verify the same **Setor real**, **Local real**, **Tarefa real** labels appear under **Trabalho realizado**, together with the normal amount, effective date and Work Period source. Refresh; verify persistence.
4. Return to the Work Period's **Acúmulo** and verify the posted item still shows the same attribution. Do not change a posted assignment, edit Reference Data, change amounts or reverse the transaction as a test shortcut.

**PASS:** the new posted earning contains the exact effective actual-work values in both Acúmulo and Conta Corrente, with stable amount/source after refresh. **FAIL:** missing/mismatched values or wrong amounts. **BLOCKED:** no explicitly approved synthetic financial posting available; the AT-01 READY item is still useful evidence but not proof of posting.

**Historical limitation:** older ledger rows posted *before* migration 79 have no stored work-attribution snapshot. The migration leaves those financial records unchanged instead of silently recreating historical claims from mutable data. Use a newly posted, approved synthetic item for this acceptance check. Request a separately scoped, auditable backfill if the business requires historical repair.

## AT-03 — Fallback, non-work, and separation

1. If another safe synthetic open period is available, leave one WORKED Collaborator's three actual overrides unset. Run the ordinary synthetic accrual and confirm its **Trabalho realizado** fields show the *informed* Sector, Location and Task (the effective actual work when no override was provided). Do not change the informed assignment.
2. If another Collaborator is already marked **Ausente**, observe their item in a safe existing run; it must not claim a **Trabalho realizado** triple. Do not mark a working Person absent solely to execute this case.
3. Sign out from Tenant A. Sign in separately as ADMIN-B, select **E2E Operational Isolation**, open **Períodos de trabalho** and the visible **Conta Corrente** available to ADMIN-B. Tenant A's Work Period and its financial attribution must not be exposed. Do not paste Tenant A URLs or forge IDs; authorization bypass is covered by backend regression tests.

**PASS:** applicable fallback and non-work behavior correct; Tenant A data absent in Tenant B. **FAIL:** false work claims or any Tenant A leakage. **BLOCKED:** applicable safe fixture or ADMIN-B credentials missing. Preserve read-only evidence.

## AT-04 — Locale parity

1. Sign in as ADMIN-A in Tenant A. Open the recorded safe Acúmulo item and the associated Conta Corrente entry.
2. In **Português (Brasil)**, confirm `Trabalho realizado`, `Setor real`, `Local real`, `Tarefa real`.
3. Switch language through the app selector to **English (United States)**. Confirm `Work performed`, `Actual Sector`, `Actual Location`, `Actual Task` and identical underlying values.
4. Switch back to Portuguese; values must still match, and neither language change produces a financial write.

**PASS:** labels translate, values and amounts remain invariant. **FAIL:** missing labels or changed persisted data. **BLOCKED:** inaccessible tenant or read-only entry.

## Automated acceptance gates (Terminal C, repository root)

Before running, confirm the automated suite uses isolated fixtures, never the working LOCAL database.

```bash
# Terminal C; ERS repository root
cd backend
go test ./internal/accruals -run 'TestByte353' -count=1
go test ./internal/currentaccounts -count=1
cd ..
cd frontend
npm run i18n:check
npx vitest run src/features/planning/AccrualTab.test.tsx src/features/current-accounts/CollaboratorCurrentAccountPage.test.tsx
cd ..
make local-check
```

**PASS:** all commands exit 0 with no failed tests. **FAIL:** any reproducible failure. **BLOCKED:** missing toolchain, unsafe test database configuration, or inability to run required checks. Never record PASS for tests not run.

## Cleanup, evidence, promotion

- Preserve the P-01 database backup, checksum, Work Period/Collaborator IDs, the transaction's source and displayed values, and non-sensitive screenshots. Keep synthetic posted financial history for an explicit later cleanup decision; never delete, reverse or restore simply to erase a test.
- Stop only the LOCAL services that this session started with Ctrl+C in their original Terminals A and B, if the operator wants them stopped. Do not stop unrelated services. This suite creates no Docker containers; if `make local-check` creates any, identify and remove **only its test-created containers**, and verify its ports are released according to the repository's test cleanup. Do not run an indiscriminate Docker prune.
- Record **PASS / FAIL / BLOCKED / N/A** separately for AT-01 through AT-04, with identity, Tenant, date, fixture, actual values, expected/observed results, and known limitations.
- Promotion requires successful automated checks, required safe manual acceptance, independent review and green CI. **Any real financial discrepancy or cross-Tenant leakage blocks promotion.**

## Glossary Impact

**Work attribution / Atribuição do trabalho realizado** means the effective Sector, Location and Task recorded for work actually performed (explicit actual overrides when present, otherwise informed values). It is recorded as a snapshot on new accrual evidence and posted Ledger Entries. **Compensation basis / Base de remuneração** remains the informed assignment. No other identity, financial ownership, or domain terms change.
