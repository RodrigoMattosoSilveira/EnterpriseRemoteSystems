# Byte 35.3 — Next-period performed-work carry-forward regression

**Environment:** LOCAL only. **Purpose:** Verify a new Work Period uses the previous period's recorded actual Setor/Local/Tarefa for a Collaborator who worked, while keeping previous informed assignment and posted financial evidence unchanged. This supplements **MT-03** in `byte-35-3-actual-work-location-override.md` and replaces its former informed-only planning expectation.

## 0. Identity, evidence and STOP conditions

- **Tester:** Tenant A Administrator — `e2e-authz-admin-tenant-admin@example.com` (LOCAL ADMIN-A; password from 1Password vault `ers-development`, never record it).
- **Tenant/context:** `E2E Authorization Admin Boundary` / Tenant A; locale **Português (Brasil)**; application started through the standard LOCAL backend/frontend commands.
- **Preconditions:** Existing P-01 LOCAL technical readiness and verified backup **PASS**; focused regression and `make local-check` **PASS**. A dedicated synthetic source Work Period (period **P**) has an included Collaborator with **Trabalhou**, a recorded *different* actual Setor, Local and Tarefa, and a correctly executed **Acúmulo**. Do not create another accrual, change financial entries or reset the database to satisfy this test.
- **Safety:** Work on approved synthetic test records only. Do not edit the source period after accrual. Do not use a Production, Test or Development environment. If the prior period/code/source cannot be identified, safe fixture data is unavailable, or the database is not protected as required in P-01, **BLOCKED** and stop before any write. Do not use SQL, DevTools, or API calls.
- **Evidence:** Record the approved source period's visible date, code, name, Collaborator name, informed values, saved actual values, and posted Accrual/Conta Corrente evidence (IDs or non-sensitive screenshots only). Do not record credentials or private financial amounts.

## 1. NP-01 — Verify the source values (read-only)

1. Open the LOCAL app URL shown by `make local-frontend`; sign in as **ADMIN-A** using the authorized credential from 1Password; explicitly select **E2E Authorization Admin Boundary**.
2. Set **Português (Brasil)**. Navigate to **Períodos de Trabalho** and open the approved source period **P** by its displayed card (not a manually composed URL).
3. Select **Plano / Atribuições do Plano**; record the *informed* Setor, Local, and Tarefa for the selected Collaborator. Return without saving.
4. Select **Resultados Reais**; verify the outcome **Trabalhou** and record the final saved **Setor real**, **Local real**, **Tarefa real**; these must differ from informed values for this regression. Return without saving.
5. Select **Acúmulo**; confirm the existing executed run displays the performed-work triple. In **Conta Corrente** for this same Collaborator in Tenant A, verify the posted record displays the same triple. Record the observation; do **not** execute/post another accrual.

**PASS:** source informed and actual values can be identified distinctly; the already-posted record retains the actual-work attribution. **FAIL:** wrong/missing values in established source/financial evidence. **BLOCKED:** no safe or identifiable source. **End state:** source unchanged.

## 2. NP-02 — Create a new same-code Work Period and inspect the proposal

**Identity/context:** ADMIN-A / Tenant A / Português (Brasil). **Starting state:** NP-01 PASS; an approved future date not already used for the same period code; no later/intervening same-code period that could become a different template source. Obtain authorization to create one synthetic LOCAL period. If any prerequisite fails, **BLOCKED**, do not create it.

1. Select **Períodos de Trabalho** → **Adicionar Período de Trabalho**.
2. In **Data de trabalho**, enter the approved date **after** source period P's date. In **Código do período**, enter **exactly** P's period code (for example `DAY` only when that is P's actual code). Enter **Nome** = `BYTE353 — herança de trabalho — LOCAL`. In **Início**, enter `06:00`; in **Fim**, enter `18:00`. If the proposed date/code is already used or the source is not the most recent earlier period with that code, stop; do not create the period.
3. Click **Criar Período de Trabalho** once. The application should open the new Work Period (call it period **N**) in planning state. Record its displayed date, code and name. **Do not save its assignments yet.**
4. Open **Plano / Atribuições do Plano**. Confirm **Fonte do modelo** identifies period **P** by date and name. If it points to a different period, **BLOCKED** and do not save any plan.
5. Find the same Collaborator. Record the three *proposed* values shown for **Setor**, **Local**, **Tarefa**. They must equal the **saved actual values from period P**, not P's earlier informed values.
6. Refresh the browser and open **Plano** again. Verify the values persist. Return to period P, inspect **Plano** and **Resultados Reais** read-only and verify P's original informed and actual values have not changed.

**PASS:** the same-code new plan proposes all three saved actual values, persists through refresh and leaves period P unchanged. **FAIL:** any proposed value reverts to the old informed assignment or P's values change. **BLOCKED:** cannot establish safe source, date, identity, code, or new-period state. **End state:** period N created but *its assignments unsaved*; period P and financial evidence unchanged.

## 3. NP-03 — Save the new plan (optional controlled write)

**Identity/context:** ADMIN-A / Tenant A / Português (Brasil). **Starting state:** NP-02 PASS; period N is an approved disposable synthetic fixture, in PLANNING state. Never perform this step on an established production-like or financially active period.

1. Open period N → **Plano**; find the recorded Collaborator. Confirm the proposed Setor/Local/Tarefa match NP-02 and that this row is selected.
2. Click **Salvar plano** (or the visible **Salvar plano (N selecionados)** button) exactly once. Do not use **Atribuição do Plano** or the option that changes the Collaborator's Journey-wide future defaults.
3. Refresh period N → **Plano**. Confirm the Collaborator's **informed assignment for N** now equals P's saved actual values. Confirm no actual outcome has been invented for N.
4. Reopen period P → **Plano**, **Resultados Reais** and its existing **Acúmulo**/Conta Corrente evidence. Confirm all P's informed, actual and posted values remain unchanged.

**PASS:** N's informed values equal P's recorded actual values; N has no fabricated actual outcome; P and posted ledger evidence are unchanged. **FAIL:** any unrelated value or evidence is modified. **BLOCKED:** permission/fixture/financial-safety prerequisite is missing. **End state:** record N's identifier as retained synthetic test evidence; do not delete or reset it.

## 4. Negative cases and test completion

- Per-field informed fallback (only one override saved), non-WORKED outcomes, inactive/wrong-Tenant references, saved-plan precedence and same-code matching are covered by `TestByte353` backend regression tests. Do not manipulate real Tenant references or create financially destructive fixtures to reproduce these manually.
- Record **PASS/FAIL/BLOCKED/N/A** separately for NP-01, NP-02 and NP-03; NP-03 may be **N/A** if only read-only proposal verification was authorized. Keep the exact selected Tenant, identity, source/target dates/codes, values and evidence.
- Retain the synthetic period and backup under the existing P-03 cleanup/evidence policy. No Docker containers are introduced by this UI-only test. For repository tests that start isolated containers, use repository-scoped teardown only; record container IDs and verify required ports are released. Never stop unrelated Docker containers.
- **Promotion gate:** A proven wrong default is **FAIL**, missing mandatory evidence is **BLOCKED**. LOCAL PASS requires the existing Byte 35.3 gates, the focused regression checks, and successful verification that the new plan uses prior recorded actual work without modifying compensation evidence.

## Glossary impact

**Next-period performed-work carry-forward / Herança do trabalho realizado para o próximo período:** a new same-code Work Period proposes the latest prior INCLUDED/WORKED Collaborator's effective actual Setor, Local and Tarefa, falling back to informed values for individual missing/inactive overrides. It changes only the *proposal* until the new period is saved. The source period's **Atribuição informada** stays the pay basis for that period; Journey-wide defaults and posted Conta Corrente evidence are never rewritten by carry-forward.
