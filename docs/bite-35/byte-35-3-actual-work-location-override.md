# Byte 35.3 — Actual Work Sector, Location and Task Override

## Accepted business rule

The informed assignment (`sectorId`, `locationId`, `taskId`) is immutable for the purpose of this override. Actual work is recorded separately (`actualSectorId`, `actualLocationId`, `actualTaskId`) with the actual outcome. A blank override means the informed assignment applies. Accruals and compensation must continue to use the informed assignment. The most recent informed assignment, not the actual override, is the next planning default. Work outcomes cannot be modified after the Work Period is CLOSED.

## LOCAL acceptance (UI first)

**Identity:** Tenant A Administrator `e2e-authz-admin-tenant-admin@example.com`, credential in `ers-development` 1Password. **Context:** `E2E Authorization Admin Boundary`. **Environment:** LOCAL.

1. Back up the LOCAL SQLite database with the backend stopped, and verify `PRAGMA integrity_check` before applying any migrations. Never reset or destroy a working LOCAL database for this test.
2. Start the LOCAL backend and frontend. Log in as Tenant A Administrator, select Tenant A, set Português (Brasil).
3. Open **Períodos de trabalho** through the UI. Select an OPEN, non-CLOSED Work Period whose informed roster includes a collaborator and has a saved assignment. If necessary, use a dedicated test Work Period instead of modifying historical production-like data. Record the collaborator, planned Sector, Location and Task, and the Work Period ID.
4. Select the **Resultados** tab. Identify the collaborator. Confirm **Atribuição informada** shows the original Sector/Location/Task and the compensation notice states that pay uses the informed assignment.
5. Choose **Trabalhou**, select a different active **Setor real**, **Local real** and **Tarefa real**, and select **Salvar trabalho realizado**. Refresh the page. Record the three actual IDs or names.
6. Confirm the actual Sector/Location/Task values retain the override, while **Atribuição informada** remains unchanged. Verify the original informed roster still shows the original Sector/Location/Task.
7. Change only **Tarefa real** (keeping actual Sector and Location unchanged), save, refresh, and verify all three values persist independently.
8. Navigate to the next Work Period of the same period code. In planning, verify the default Sector/Location/Task comes from the informed assignment, not the actual override. Do not save a new next-period plan unless testing a dedicated fixture.
9. Confirm any accrual preview or posted accrual for the test assignment still uses the informed Sector/Location/Task. Do not post real financial entries solely for this UI test.
10. Attempt to submit an inactive, wrong-type, or other-Tenant reference only through available UI options. The selectors must not offer inactive references; the backend regression test covers forged references.
11. Switch to English and confirm the same controls are correctly translated without changing saved values.

**PASS:** Actual values persist independently, informed values and next-plan defaults are unchanged, and compensation logic remains based on informed assignment. No cross-Tenant or invalid reference is accepted.

**FAIL:** Any change to informed assignment, payment calculation from actual fields, missing translation, lost actual value, or unauthorized actual reference. **BLOCKED:** Missing test identities, access, work period, valid alternative references, or failed migration/integrity checks.

**Cleanup:** No test container is required. Use a dedicated test Work Period, do not overwrite established financial evidence. Where a new test Work Period and references were created, record their IDs and preserve audit trace; remove only test-specific disposable fixtures through supported UI actions where safe. Do not reset the database.
