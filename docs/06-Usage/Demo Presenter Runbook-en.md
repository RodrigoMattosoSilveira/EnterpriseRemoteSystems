# Demo Presenter Runbook — Brazilian Demo

## Purpose

This is the executable Bite 31.5 presenter script for the deterministic Brazilian demo. It supports the dedicated Bite 31.4 LOCAL database and deployed Development/Test environments using the same synthetic Tenant.

The baseline business-data demo is intentionally read-only. Seeded records let the presenter move quickly, avoid accidental state drift, and reset to a known scenario when necessary. An optional authentication demonstration changes only João Ferreira's synthetic password; the next Brazilian-demo database reset restores the deterministic fixture.

Because the live demo is configured for Brazilian Portuguese, **Portuguese UI labels are shown in bold** where the presenter must click or confirm them. All presenter instructions and talk track in this file are English.

## Presenter preflight

### Presenter identity and fixture

Use exactly this presenter identity:

```text
Name:        Mariana Alves
Login:       demo.tenant-admin@example.test
Password:    Demo-31.4-Brasil!
Role:        TENANT_ADMIN
Tenant:      Mineração Serra Dourada — DEMO
Tenant ID:   demo-br-serra-dourada
Tenant code: DEMO_BR_SERRA_DOURADA
```

The default scenario anchor is `2026-09-18`.

The fixture also provisions canonical self-service Authentication Accounts for the three active demo Collaborators:

```text
João Ferreira
Login: demo31.4.joao@example.test
Seeded password: Demo-31.4-Person!

Camila Souza
Login: demo31.4.camila@example.test
Seeded password: Demo-31.4-Person!

Rafael Lima
Login: demo31.4.rafael@example.test
Seeded password: Demo-31.4-Person!
```

Beatriz Nascimento intentionally remains a Person with a Tenant Membership but no Authentication Account.

For the optional password-reset demonstration, set João's demo password to:

```text
Demo-31.5-Joao!
```

That change exists only in the selected demo database. The next `brazilian-demo-local-reset` or `brazilian-demo-server-reset` restores João's seeded authentication state.

### 1. Choose the environment and reset the Brazilian demo

Use exactly one environment for a presentation. Never run the Brazilian demo reset against Production.

#### LOCAL

Stop any backend process currently using `backend/data/brazilian-demo.db`, then run from the repository root:

```bash
make brazilian-demo-local-reset
make brazilian-demo-local-verify
make brazilian-demo-presentation-check
```

If you use a non-default scenario anchor, pass the same `BRAZILIAN_DEMO_AS_OF` value to reset and verification. Record the anchor. The completed Work Period is `anchor - 2 days`; the future planning Work Period is `anchor + 1 day`.

#### Development

On the ERS server:

```bash
cd /opt/EnterpriseRemoteSystems/development
make brazilian-demo-server-reset ENV=development
```

This is the single deterministic pre-demo command for Development. It backs up the current database, replaces the Development backend-data volume with a clean migrated Brazilian demo database, seeds and verifies `Mineração Serra Dourada — DEMO`, restarts the complete stack using the already-deployed images, and runs health/public smoke checks. Do not stop Docker containers manually first.

#### Test

On the ERS server:

```bash
cd /opt/EnterpriseRemoteSystems/test
make brazilian-demo-server-reset ENV=test
```

For a non-default anchor:

```bash
make brazilian-demo-server-reset ENV=test BRAZILIAN_DEMO_AS_OF=2026-10-15
```

The reset is destructive to the selected Development/Test database volume, but it creates a verified pre-demo backup first and always refuses Production.

### 2. Run the demo in LOCAL

After reset and verification:

**Terminal 1 — backend**

```bash
ERS_DATABASE_PATH=data/brazilian-demo.db make local-backend
```

**Terminal 2 — frontend**

```bash
make local-frontend
```

Confirm that the revision printed by the frontend is the revision intended for the presentation. Open the LOCAL URL printed by the frontend and continue with **Prepare the browser**.

After the presentation, stop frontend and backend with `Ctrl+C`. The ordinary LOCAL application database is separate from `backend/data/brazilian-demo.db`; return to normal development by starting the LOCAL backend without `ERS_DATABASE_PATH=data/brazilian-demo.db`.

### 3. Run the demo on Development

1. Run the Development reset described above.
2. Wait for the command to complete successfully.
3. Open the normal deployed Development URL.
4. Continue with **Prepare the browser**.
5. After the presentation, restore the normal resettable ERS dataset using **Return Development/Test to the normal application**.

Do not run a separate `server-up` immediately after `brazilian-demo-server-reset`; the reset already starts the complete stack.

### 4. Run the demo on Test

1. Run the Test reset described above.
2. Wait for the command to complete successfully.
3. Open the normal deployed Test URL.
4. Continue with **Prepare the browser**.
5. After the presentation, restore the normal resettable ERS dataset using **Return Development/Test to the normal application**.

### 5. Prepare the browser

1. Open the ERS URL for the selected environment.
2. Sign in with `demo.tenant-admin@example.test` / `Demo-31.4-Brasil!`.
3. In **Idioma**, choose **Português (Brasil)**.
4. Confirm that the Tenant selector shows **Mineração Serra Dourada — DEMO** with code `DEMO_BR_SERRA_DOURADA`.
5. During the baseline path, do not create, edit, inform, post, cancel, print, return, or otherwise mutate business records.
6. If you plan to show João's self-service experience, use the controlled password-reset flow below.

### 6. Update João's password through the Tenant Administrator UI

Use this flow only when you want to demonstrate both Tenant authentication administration and João's self-service experience.

**Starting identity:** Mariana Alves — Tenant Administrator.

**Required context:** `Mineração Serra Dourada — DEMO`, with **Português (Brasil)** selected.

1. Open **Pessoas**.
2. Find and open **João Ferreira**.
3. On João's Person page, scroll to **Autenticação**.
4. Confirm status **Habilitada** and login `demo31.4.joao@example.test`.
5. Select **Emitir token de redefinição de senha**.
6. Confirm **Token de redefinição de uso único para demo31.4.joao@example.test**.
7. Note that the raw token is displayed only once and has an expiration time.
8. Select **Abrir página de redefinição**.
9. In **Nova senha**, enter:

```text
Demo-31.5-Joao!
```

10. Enter the same value in **Confirmar nova senha**.
11. Select **Redefinir senha**.
12. Confirm success and the return to the sign-in flow.
13. Sign in as João with `demo31.4.joao@example.test` / `Demo-31.5-Joao!`.
14. Confirm João reaches the ordinary Tenant-scoped self-service experience, not Mariana's administrative workspace.

The reset revokes existing sessions for that account. If Mariana must remain signed in, use a separate browser profile/window for João. The next deterministic reset restores `Demo-31.4-Person!`.

### 7. Know the key numbers before presenting

```text
João:   R$ 230,00
Camila: 4 g
Rafael: R$ 0,00
```

Also remember:

```text
Gold Production: 80 g
Camila commission: 5% × 80 g = 4 g
João canteen Expense: R$ 70,00
Rafael flight Expense: R$ 350,00
```

### 8. Return Development/Test to the normal application

A plain `server-up` is not sufficient after a Brazilian demo because it would restart the same Brazilian demo database volume. Restore the normal resettable dataset with `testdata-server-reset`.

#### Development — post-demo reset

```bash
cd /opt/EnterpriseRemoteSystems/development
make testdata-server-reset ENV=development
make server-backend-health ENV=development
make server-smoke ENV=development
```

#### Test — post-demo reset

```bash
cd /opt/EnterpriseRemoteSystems/test
make testdata-server-reset ENV=test
make server-backend-health ENV=test
make server-smoke ENV=test
```

This returns Test to the **standard resettable Test dataset**. It does **not** restore whatever ad hoc Test database state existed before the demo.

#### Future Test-state preservation

If exact preservation of ad hoc Test state becomes operationally important, add a supported restore workflow before relying on Test for stateful work around a prospect demo. The intended sequence is:

```text
Pre-demo Test state
    ↓
Verified backup
    ↓
Brazilian demo reset
    ↓
Presentation
    ↓
Restore exact pre-demo backup
    ↓
Backend health + public smoke verification
```

Until that restore capability exists, use `make testdata-server-reset ENV=test` only when returning to the standard resettable dataset is acceptable. Do not manually copy SQLite files into Docker volumes as an ad hoc restore procedure.

---

## Executive demo — approximately 14 minutes

### Stop 1 — Tenant data is fully isolated

**Identity:** Mariana Alves — Tenant Administrator.

**Required context:** `Mineração Serra Dourada — DEMO`.

**UI navigation:** remain in the initial authenticated workspace. Use the Tenant selector in the top bar; do not type a URL.

**Actions**

1. Point to the Tenant selector.
2. Read **Mineração Serra Dourada — DEMO** aloud.
3. Show code `DEMO_BR_SERRA_DOURADA`.
4. Confirm **Idioma → Português (Brasil)**.

**Talk track**

“Before we look at people or finances, this is the operational boundary of the demo. Everything I open now is loaded in the context of this Tenant. Language changes presentation; it does not change Tenant identity or authorization.”

**Transition:** “With the boundary clear, we start with the Person.”

### Stop 2 — Person as durable identity

**UI navigation:** open **Pessoas**.

**Actions**

1. Confirm heading **Pessoas**.
2. Show João Ferreira, Camila Souza, Rafael Lima, Beatriz Nascimento, and Mariana Alves.
3. Open **Rafael Lima**.

**Talk track**

“A Person is durable identity. It is not the same thing as a Journey. That lets ERS preserve operational history without creating a new identity whenever the working relationship changes.”

**Transition:** “Rafael is a useful example because he has history and a current Journey.”

### Stop 3 — Rafael Journey history

**UI navigation:** on Rafael's Person page, use **Abrir Jornada atual** in **Status do Perfil**.

**Actions**

1. Explain that Rafael has a historical closed Journey and a newer active Journey.
2. On the active Journey, show the daily BRL compensation of `R$ 350,00` when visible.
3. Do not edit the Journey.

**Talk track**

“A Journey can end and another can begin without deleting the Person or rewriting history. That is important for auditability and for understanding which operating rule applied at each point in time.”

**Transition:** “Now we will see how that Journey participates in a real Work Period.”

### Stop 4 — Completed Work Period and posted work

**UI navigation:** open **Períodos de trabalho**.

**Actions**

1. Open the period at `scenario anchor - 2 days`, code `DAY`, schedule `06:00-18:00`.
2. Confirm it is the completed/posted period, not the future planning period.
3. Show João, Camila, and Rafael as participants.
4. Show that all three were recorded as worked.
5. Open **Acúmulo** only to inspect the already-posted result; do not run another accrual.

**Talk track**

“The Work Period joins plan, actual work, and the basis for accrual. The compensation we show later can trace back to the work that created it.”

**Transition:** “This period also has Gold Production recorded.”

### Stop 5 — Gold Production and explainable accrual

**UI navigation:** open **Produção de ouro** from the main navigation or the visible Work Period production link.

**Actions**

1. Locate the production entry for the completed Work Period.
2. Show `80 g`.
3. Return to the Work Period through a visible UI control.
4. Open **Acúmulo** and show the posted items.
5. Highlight Camila's `4 g` result.

**Talk track**

“Camila's rule is deliberately easy to verify: five percent of 80 grams is 4 grams. The value does not appear in isolation; it comes from production, Work Period, assignment, and compensation rule.”

**Transition:** “Compensation is only half of the financial story. Next we show Expenses.”

### Stop 6 — Traceable Expenses

**UI navigation:** open **Despesas** from the main navigation.

**Actions**

1. Locate João Ferreira's canteen Expense.
2. Open the Expense.
3. Show quantity `2`, unit price `R$ 35,00` when rendered, and total `R$ 70,00`.
4. Show the related Person/Journey and financial-source/receipt controls when visible.
5. Return to the **Despesas** list.
6. Locate Rafael Lima's flight Expense and show total `R$ 350,00`.
7. Do not cancel, replace, or advance any receipt state.

**Talk track**

“An Expense is not just a negative number. João has two meals totaling R$ 70,00, while Rafael has a R$ 350,00 flight. Each Expense preserves calculation context and its connection to the financial effect.”

**Transition:** “Now we will see credit and debit together in the Current Account.”

### Stop 7 — João Current Account

**UI navigation:** open **Colaboradores** → **João Ferreira** → **Conta Corrente**.

**Actions**

1. Confirm the account identifies João.
2. Show the posted earning credit of `R$ 300,00`.
3. Show the Expense debit of `R$ 70,00`.
4. Show the resulting balance of `R$ 230,00`.
5. Use source/provenance controls to demonstrate links to operational records when useful.

**Talk track**

“The balance is not an unexplained total. João earned R$ 300,00 for work and has a R$ 70,00 canteen Expense. The result is R$ 230,00, and each entry retains its source.”

**Transition:** “The debit also creates a receipt obligation.”

### Stop 8 — Pending versus completed receipt control

**UI navigation:** open **Recibos pendentes**.

**Actions**

1. Locate João's receipt `RCP-DEMO-BR-0001`.
2. Confirm **Pendente de emissão**.
3. Explain that it represents outstanding control work; do not print or advance it.
4. For contrast, open **Colaboradores** → **Rafael Lima** → **Conta Corrente**.
5. Identify the `R$ 350,00` flight debit and its returned receipt state when visible.
6. If needed, open the flight Expense through its source link and show **Devolvido**.

**Talk track**

“João still has an operational action pending. Rafael, by contrast, has a flight debit that exactly offsets the day's earning and a receipt that has already been returned. ERS makes outstanding work distinct from completed evidence.”

### Stop 9 — Executive close

Return to the deck's executive close or remain on the financial evidence if the audience is engaged there.

**Talk track**

“In one connected story we saw the Tenant boundary, Person identity, Journey history, planned and actual work, production, compensation, Expenses, Current Account, and receipts. The goal is to reduce manual reconciliation without losing the source of each decision and value.”

Ask:

“Which of these steps currently requires the most manual reconciliation or the most trust in spreadsheets in your operation?”

---

## Deep demo — extend the session to approximately 25–35 minutes

Run the executive path first, then select only the branches relevant to the audience.

### Deep branch A — Beatriz: Person without Collaborator Journey

**UI navigation:** **Pessoas** → **Beatriz Nascimento**.

1. Show the complete Person record.
2. Show the Tenant Membership context.
3. Confirm there is no active Collaborator Journey to open.
4. Do not create one.

**Talk track:** “Having a Person in the Tenant does not automatically mean having a Collaborator Journey. That separation lets ERS govern identity without inventing an operating relationship that does not exist yet.”

### Deep branch B — Future planning without mutation

**UI navigation:** **Períodos de trabalho** → period at `scenario anchor + 1 day`, status `PLANNING`.

1. Show João, Camila, and Rafael as planned Collaborators.
2. Show sector/location/task assignment details where visible.
3. Explain the difference between planned and actual state.
4. Do not inform the Work Period or change assignments.

**Talk track:** “This is tomorrow's plan. The team is already included, but we are not turning the plan into actual work during the demo.”

### Deep branch C — Camila commission provenance

**UI navigation:** **Colaboradores** → **Camila Souza** → **Conta Corrente**.

1. Show the `4 g` balance.
2. Open the earning source when available.
3. Trace it back to the completed Work Period/accrual context.
4. Reconnect the result to the `80 g` production entry.

**Talk track:** “The Current Account preserves both value unit and source. Four grams are the result of the 5% rule applied to 80 grams produced.”

### Deep branch D — João Expense provenance

**UI navigation:** **Despesas** → João Ferreira's canteen Expense.

1. Show quantity `2`.
2. Show unit price `R$ 35,00` when rendered.
3. Show total `R$ 70,00`.
4. Show Person/Journey, debit, and receipt relationships without advancing receipt state.

**Talk track:** “The Expense preserves calculation context. It is not merely minus seventy: it is two meals, a unit price, a total, and linked financial records.”

### Deep branch E — Rafael zero balance with completed control

**UI navigation:** **Colaboradores** → **Rafael Lima** → **Conta Corrente**.

1. Show `+R$ 350,00` earning.
2. Show `-R$ 350,00` flight Expense.
3. Confirm balance `R$ 0,00`.
4. Follow the Expense/receipt link and show **Devolvido**.

**Talk track:** “A zero balance does not mean no history. There is a credit, a debit, and completed receipt evidence; the provenance remains intact.”

---

## Recovery

### Recovery 1 — Lost your place in the UI

1. Use visible navigation instead of typing a URL.
2. Return to **Pessoas**.
3. Confirm **Mineração Serra Dourada — DEMO** in the top bar.
4. Resume from the next story stop.

### Recovery 2 — Wrong Tenant or context selected

1. Stop the business narration.
2. Open the Tenant selector.
3. Select **Mineração Serra Dourada — DEMO**.
4. Wait for the workspace to finish loading.
5. Re-open **Pessoas** and confirm the seeded names.

If the demo Tenant is unavailable, do not continue with another Tenant. Sign out, verify the correct database/backend process, then sign in again.

### Recovery 3 — Wrong language

1. Use **Idioma**.
2. Choose **Português (Brasil)**.
3. Confirm **Pessoas**, **Colaboradores**, **Períodos de trabalho**, **Produção de ouro**, **Despesas**, and **Recibos pendentes**.
4. Continue without changing Tenant context.

### Recovery 4 — Seeded record or demo credential was mutated

End the current session and reset the same environment.

**LOCAL**

```bash
make brazilian-demo-local-reset
make brazilian-demo-local-verify
```

Then restart the backend with `ERS_DATABASE_PATH=data/brazilian-demo.db make local-backend` and the frontend with `make local-frontend`.

**Development**

```bash
cd /opt/EnterpriseRemoteSystems/development
make brazilian-demo-server-reset ENV=development
```

**Test**

```bash
cd /opt/EnterpriseRemoteSystems/test
make brazilian-demo-server-reset ENV=test
```

Sign in again as Mariana, select **Português (Brasil)**, and confirm:

```text
João:   R$ 230,00
Camila: 4 g
Rafael: R$ 0,00
```

### Recovery 5 — A number does not match the script

1. Confirm `Mineração Serra Dourada — DEMO`.
2. Confirm the scenario anchor.
3. In LOCAL, run `make brazilian-demo-local-verify` with the same `BRAZILIAN_DEMO_AS_OF` used for reset.
4. In Development/Test, re-run the matching environment reset.
5. If verification fails, do not present from that environment.
6. If verification passes but the UI still differs, record a product defect instead of changing the presenter story.

### Recovery 6 — Backend/frontend started against the wrong database or revision

1. Stop both processes.
2. Start the backend:

```bash
ERS_DATABASE_PATH=data/brazilian-demo.db make local-backend
```

3. Start the frontend:

```bash
make local-frontend
```

4. Confirm the frontend revision.
5. Sign in again and re-check Tenant, language, and balances.

---

## Closing

### Standard close

“ERS keeps identity, operational history, planning, production, and finance connected inside an explicit Tenant boundary. In this demo, every balance and every outstanding item can trace back to the event that created it.”

Ask the audience which topic should be explored next:

- identity and Journey lifecycle;
- planning and operations;
- compensation and production;
- Expenses and Current Account;
- receipt/document controls;
- Tenant/security boundary.

### Presenter guardrails

- Never use Production/customer data for this demo.
- Never switch to another Tenant merely to keep a broken demo moving.
- Never invent a login for a seeded Person with no Authentication Account.
- Never hide a fixture/UI mismatch with narration; recover or report it.
- Prefer seeded read-only states for the baseline story.
- Reset after any intentional or accidental mutation before the next presentation.
