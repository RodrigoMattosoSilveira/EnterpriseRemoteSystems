# Brazilian Demo Presenter Runbook

## Purpose

This runbook is the executable Bite 31.5 presenter script for the deterministic Brazilian demo. It supports the dedicated LOCAL Bite 31.4 database and deployed Development/Test environments using the same synthetic Locatário.

The baseline business-data demo is intentionally read-only. It uses seeded records so the presenter can move quickly, avoid accidental state drift, and reset to a known scenario when necessary. An optional authentication demonstration intentionally changes João Ferreira's password through the Administrador do Locatário reset-token flow; the next Brazilian-demo database reset restores the deterministic fixture.

## Presenter preflight

### Identity and fixture

Use exactly this presenter identity:

```text
Name:      Mariana Alves
Login:     demo.tenant-admin@example.test
Password:  Demo-31.4-Brasil!
Role:      TENANT_ADMIN
Locatário:    Mineração Serra Dourada — DEMO
Locatário ID: demo-br-serra-dourada
Locatário code: DEMO_BR_SERRA_DOURADA
```

The default scenario anchor is `2026-09-18`.

The fixture also provisions canonical self-service Authentication Accounts for the three active demo Collaborators:

```text
João Ferreira
Login:    demo31.4.joao@example.test
Seeded password: Demo-31.4-Person!

Camila Souza
Login:    demo31.4.camila@example.test
Seeded password: Demo-31.4-Person!

Rafael Lima
Login:    demo31.4.rafael@example.test
Seeded password: Demo-31.4-Person!
```

Beatriz Nascimento intentionally remains a Person with a Vínculo com o Locatário but no Authentication Account.

For the optional password-reset demonstration, do not rely on João's seeded password. Have Mariana issue a one-time reset token and set João's demo password to:

```text
Demo-31.5-Joao!
```

That password change exists only in the selected demo database. The next `brazilian-demo-local-reset` or `brazilian-demo-server-reset` recreates the fixture and restores João's seeded authentication state.

### 1. Choose the environment and reset the Brazilian demo

Use exactly one environment for a presentation. Never run the Brazilian demo reset against Production.

#### LOCAL

Stop any backend process currently using `backend/data/brazilian-demo.db`, then run from the repository root:

```bash
make brazilian-demo-local-reset
make brazilian-demo-local-verify
make brazilian-demo-presentation-check
```

If using a non-default scenario anchor, pass the same `BRAZILIAN_DEMO_AS_OF` value to reset and verification. Record the scenario anchor. The completed Work Period is `anchor - 2 days`; the future planning Work Period is `anchor + 1 day`.

#### Development

On the ERS server:

```bash
cd /opt/EnterpriseRemoteSystems/development
make brazilian-demo-server-reset ENV=development
```

This is the **single deterministic pre-demo command** for Development. It backs up the existing database, replaces the Development backend-data volume with a clean migrated Brazilian demo database, seeds and verifies `Mineração Serra Dourada — DEMO`, restarts the complete Development stack using the already-deployed images, and runs backend/public smoke checks. Do not stop Docker containers manually before running it.

#### Test

On the ERS server:

```bash
cd /opt/EnterpriseRemoteSystems/test
make brazilian-demo-server-reset ENV=test
```

This is the **single deterministic pre-demo command** for Test and has the same behavior as Development. Do not stop Docker containers manually before running it.

For a non-default anchor:

```bash
make brazilian-demo-server-reset ENV=test BRAZILIAN_DEMO_AS_OF=2026-10-15
```

The server reset is destructive to the selected Development/Test backend database volume, but it takes a verified pre-demo backup first and always refuses Production.

### 2. Run the demo LOCAL after resetting the database

After `make brazilian-demo-local-reset` and verification complete:

**Terminal 1 — backend**

```bash
ERS_DATABASE_PATH=data/brazilian-demo.db make local-backend
```

Leave the backend running.

**Terminal 2 — frontend**

```bash
make local-frontend
```

Confirm the revision printed by `make local-frontend` is the revision intended for the presentation.

Then open the local ERS URL printed by the frontend and continue with **Prepare the browser** below.

After the LOCAL presentation, stop the frontend and backend with `Ctrl+C`. The ordinary local application database is separate from `backend/data/brazilian-demo.db`; starting the normal local backend again does not require a Docker/server reset.

### 3. Run the demo on Development

1. Run the Development pre-demo reset from **Choose the environment and reset the Brazilian demo**.
2. Wait for the command to finish successfully. It already restarts and smoke-tests the Development stack.
3. Open the normal deployed Development URL in the browser.
4. Continue with **Prepare the browser** below.
5. After the presentation, return Development to the normal resettable ERS dataset using **Return Development/Test to the normal application after the demo** below.

Do not run a separate `server-up` immediately after `brazilian-demo-server-reset`; the pre-demo command has already started the complete stack.

### 4. Run the demo on Test

1. Run the Test pre-demo reset from **Choose the environment and reset the Brazilian demo**.
2. Wait for the command to finish successfully. It already restarts and smoke-tests the Test stack.
3. Open the normal deployed Test URL in the browser.
4. Continue with **Prepare the browser** below.
5. After the presentation, return Test to the normal resettable ERS dataset using **Return Development/Test to the normal application after the demo** below.

Do not run a separate `server-up` immediately after `brazilian-demo-server-reset`; the pre-demo command has already started the complete stack.

### 5. Prepare the browser

1. Open the ERS URL for the selected environment.
2. Sign in with `demo.tenant-admin@example.test` / `Demo-31.4-Brasil!`.
3. In the **Idioma** selector, choose **Português (Brasil)**.
4. Confirm the seletor de Locatário shows **Mineração Serra Dourada — DEMO** with code `DEMO_BR_SERRA_DOURADA`.
5. Do not create, edit, inform, post, cancel, print, return, or otherwise mutate business records during the baseline business-data demo.
6. If you intend to demonstrate João's self-service perspective, use the controlled password-reset flow below rather than guessing or reusing Mariana's password.

### 6. Update João's password through the Administrador do Locatário UI

Use this flow when you want to demonstrate both administração de autenticação do Locatário and João's self-service experience. It intentionally mutates only João's synthetic demo credential.

**Starting identity:** Mariana Alves — Administrador do Locatário.

**Required context:** `Mineração Serra Dourada — DEMO`, with **Português (Brasil)** selected.

1. In the main navigation, open **Pessoas**.
2. Find and open **João Ferreira**.
3. On João's Person page, scroll to the **Autenticação** section.
4. Confirm the section shows status **Habilitada** and login `demo31.4.joao@example.test`.
5. Select **Emitir token de redefinição de senha**.
6. Confirm the UI displays **Token de redefinição de uso único para demo31.4.joao@example.test**.
7. Note that the raw token is displayed only once and has an expiration time.
8. Select **Abrir página de redefinição**. The token should already be populated on **Redefinir senha**.
9. Enter the following synthetic demo password in **Nova senha**:

```text
Demo-31.5-Joao!
```

10. Enter the same value in **Confirmar nova senha**.
11. Select **Redefinir senha**.
12. Confirm the application reports that the password was reset for `demo31.4.joao@example.test` and returns to the sign-in flow.
13. Sign in as João using:

```text
Login:    demo31.4.joao@example.test
Password: Demo-31.5-Joao!
```

14. Confirm João reaches his ordinary com escopo do Locatário self-service experience rather than Mariana's Administrador do Locatário workspace.

Completing the reset changes João's global Authentication Account password and revokes existing sessions for that account across Locatários. The reset page also ends the current browser session after success, so using the same browser provides a natural transition from Mariana's administrative action to João's sign-in. If you want Mariana to remain signed in simultaneously, use a separate browser profile/window for João.

The next deterministic Brazilian-demo database reset discards this password change and restores the seeded password `Demo-31.4-Person!`.

### 7. Know the three numbers before presenting

```text
João:   R$ 230,00
Camila: 4 g
Rafael: R$ 0,00
```

Also remember:

```text
Gold Production: 80 g
Camila commission: 5% × 80 g = 4 g
João canteen expense: R$ 70,00
Rafael flight expense: R$ 350,00
```

### 8. Return Development/Test to the normal application after the demo

A plain `server-up` is **not sufficient** after a Brazilian demo because it would restart the same Brazilian demo database volume. Restore the ordinary resettable Development/Test application data with `testdata-server-reset`.

#### Development — post-demo reset

On the ERS server:

```bash
cd /opt/EnterpriseRemoteSystems/development
make testdata-server-reset ENV=development
make server-backend-health ENV=development
make server-smoke ENV=development
```

`testdata-server-reset` stops the selected Development stack, recreates the normal backend database volume, applies migrations, loads the standard resettable ERS test datasets, and starts the Development stack again. The explicit health and smoke commands verify the relaunched application.

#### Test — post-demo reset

On the ERS server:

```bash
cd /opt/EnterpriseRemoteSystems/test
make testdata-server-reset ENV=test
make server-backend-health ENV=test
make server-smoke ENV=test
```

This returns Test to the **standard resettable Test dataset** and relaunches the Test stack. It does **not** restore whatever ad hoc Test database state existed immediately before the demo.

#### Future Test-state preservation

The Brazilian-demo server reset already takes a verified pre-demo database backup. At present, ERS does not provide a paired, general-purpose command that safely restores that exact backup into the Test backend volume and then performs health/smoke verification.

If preserving ad hoc Test state becomes operationally important, add a supported restore workflow before relying on Test for stateful work around a prospect demo. The intended future sequence is:

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

Until that restore capability exists, use `make testdata-server-reset ENV=test` after a Test demo only when it is acceptable to return Test to the standard resettable dataset. Do not manually copy SQLite files into Docker volumes as an ad hoc restore procedure.

---

## Executive demo — approximately 12 minutes

### Stop 1 — Establish the limite do Locatário

**Identity:** Mariana Alves — Administrador do Locatário.

**Required context:** `Mineração Serra Dourada — DEMO`.

**UI navigation:** remain on the initial authenticated workspace. Use the seletor de Locatário in the top bar; do not navigate by URL.

**Actions**

1. Point to the seletor de Locatário.
2. Read the selected Locatário name aloud: **Mineração Serra Dourada — DEMO**.
3. Briefly point out the code `DEMO_BR_SERRA_DOURADA`.
4. Point to **Idioma** and confirm **Português (Brasil)**.

**Talk track**

“Antes de olhar pessoas ou finanças, este é o limite operacional da demonstração. Tudo o que eu abrir agora está sendo carregado no contexto deste Locatário. O idioma é apresentação; ele não muda o Locatário nem a autorização.”

**Do not** imply that changing language changes stored data or security scope.

**Transition:** “Com o limite claro, começamos pela Pessoa.”

### Stop 2 — People as durable identity

**UI navigation:** select **Pessoas** in the main navigation.

**Actions**

1. Confirm the page heading is **Pessoas**.
2. Point to the Locatário-boundary information near the People workspace.
3. Locate the seeded People list.
4. Point out João Ferreira, Camila Souza, Rafael Lima, Beatriz Nascimento, and Mariana Alves.
5. Open **Rafael Lima** by clicking his row/card/link in the UI.

**Talk track**

“A Pessoa é a identidade durável. Ela não é a mesma coisa que uma Jornada. Isso permite preservar histórico operacional sem criar uma nova identidade toda vez que a relação de trabalho muda.”

**Transition:** “Rafael é o melhor exemplo disso porque ele tem histórico e uma Jornada atual.”

### Stop 3 — Rafael Journey history

**UI navigation:** from Rafael’s Person detail, follow the visible Collaborator/Journey action into his current Collaborator detail. If the Person detail presents Journey history first, point to both the historical finished Journey and the active Journey before opening the active one.

**Actions**

1. Identify Rafael’s historical finished Journey.
2. Identify Rafael’s newer active Journey.
3. On the active Journey, point out the daily BRL compensation of `R$ 350,00` when visible.
4. Do not edit the Journey.

**Talk track**

“Uma Jornada pode terminar e outra começar sem apagar a Pessoa nem reescrever o histórico. Isso é importante para auditoria e para entender qual regra operacional estava vigente em cada período.”

**Transition:** “Agora vamos ver como a Jornada participa de um Período de Trabalho real.”

### Stop 4 — Completed Work Period and posted work

**UI navigation:** select **Períodos de trabalho** in the main navigation.

**Actions**

1. Open the Work Period dated `scenario anchor - 2 days` with code `DAY` and schedule `06:00-18:00`.
2. Confirm it is the completed/posted period, not the future `PLANNING` period.
3. In the planning/outcomes area, point out João, Camila, and Rafael.
4. Show that the completed assignments record all three as worked.
5. Open the accrual area only to inspect the already-posted result; do not run or re-run an accrual.

**Talk track**

“O Período de Trabalho reúne o plano, o realizado e a base para apropriação. O ponto importante aqui é a ligação: a remuneração que veremos depois consegue voltar ao trabalho que a originou.”

**Transition:** “Esse período também tem produção de ouro registrada.”

### Stop 5 — Gold Production and explainable accrual

**UI navigation:** use **Produção de ouro** from the main navigation or the visible Work Period production link.

**Actions**

1. Locate the seeded production entry for the completed Work Period.
2. Point to `80 g` of Gold Production.
3. Return to the completed Work Period through the visible UI control.
4. Open the accrual area and point to the posted items.
5. Highlight Camila’s `4 g` result.

**Talk track**

“A regra da Camila é intencionalmente simples para a demonstração: cinco por cento de 80 gramas são 4 gramas. O valor não aparece solto; ele vem de produção, Período de Trabalho, atribuição e regra de remuneração.”

**Transition:** “Agora eu vou mostrar o resultado financeiro de um Colaborador em BRL.”

### Stop 6 — João Current Account

**UI navigation:** select **Colaboradores**, open **João Ferreira**, then select the visible **Conta Corrente** action.

**Actions**

1. Confirm the account context identifies João.
2. Point to the posted earning credit of `R$ 300,00`.
3. Point to the canteen Expense debit of `R$ 70,00`.
4. Point to the resulting balance of `R$ 230,00`.
5. Use the source/provenance controls to show that entries link back to their operational source when helpful.

**Talk track**

“O saldo não é um total sem explicação. João recebeu R$ 300,00 pelo trabalho e teve R$ 70,00 de despesa de cantina. O resultado é R$ 230,00, e cada lançamento mantém a sua origem.”

**Transition:** “O débito da cantina também gera uma obrigação de recibo.”

### Stop 7 — Pending versus completed receipt control

**UI navigation:** select **Recibos pendentes** in the main navigation.

**Actions**

1. Locate João’s receipt `RCP-DEMO-BR-0001`.
2. Confirm the status is **Pendente de emissão**.
3. Explain that it represents outstanding control work; do not print or advance it.
4. To contrast completed evidence, return to **Colaboradores**, open **Rafael Lima**, open **Conta Corrente**, and identify the `R$ 350,00` flight debit and its returned receipt state when visible.
5. If the returned receipt is not visible from the Current Account at the current viewport/filter, open the flight Expense through its source link and show the **Devolvido** receipt status there.

**Talk track**

“João ainda tem uma ação operacional pendente. Rafael, por outro lado, tem o débito da passagem compensando exatamente o ganho do dia e o recibo já devolvido. O sistema deixa claro o que ainda exige trabalho e o que já virou evidência concluída.”

**Transition:** “Com isso fechamos o ciclo completo da operação.”

### Stop 8 — Executive close

Return to the slide deck’s **Executive close** slide or remain on Rafael/receipt evidence if the prospect is engaged there.

**Talk track**

“Em uma única história vimos o limite do Locatário, a identidade da Pessoa, o histórico de Jornada, o trabalho planejado e realizado, produção, remuneração, despesa, Conta Corrente e recibo. O objetivo é reduzir reconciliação manual sem perder a origem de cada decisão e valor.”

Ask:

“Qual dessas etapas hoje exige mais reconciliação manual ou mais confiança em planilhas na sua operação?”

---

## Deep demo — extend the session to approximately 25–35 minutes

Run the executive path first, then select the branches below based on prospect interest. Do not run every branch by default.

### Deep branch A — Beatriz: Person without Collaborator Journey

**UI navigation:** **Pessoas** → **Beatriz Nascimento**.

**Actions**

1. Show that Beatriz has a complete Person record.
2. Explain the Vínculo com o contexto do Locatário visible on the Person page.
3. Confirm there is no active Collaborator Journey to open.
4. Do not create one.

**Talk track**

“Ter uma Pessoa no Locatário não significa automaticamente ter uma Jornada de Colaborador. Essa separação permite cadastrar e governar identidade sem inventar uma relação operacional que ainda não existe.”

### Deep branch B — Future planning without mutating it

**UI navigation:** **Períodos de trabalho** → open the Work Period dated `scenario anchor + 1 day` with status `PLANNING`.

**Actions**

1. Point out João, Camila, and Rafael as included planned Collaborators.
2. Show sector/location/task assignment details where visible.
3. Explain the difference between planned and actual state.
4. Do not select actions that inform the Work Period or change assignments.

**Talk track**

“Este é o amanhã planejado. A equipe já está incluída, mas ainda não estamos transformando plano em realizado. A demonstração mantém esse estado pendente de propósito.”

### Deep branch C — Camila commission provenance

**UI navigation:** **Colaboradores** → **Camila Souza** → **Conta Corrente**.

**Actions**

1. Show Camila’s gold balance of `4 g`.
2. Open the earning source/provenance link when available.
3. Trace it back to the completed Work Period/accrual context.
4. Reconnect the result to the `80 g` Gold Production entry.

**Talk track**

“Camila não está em BRL neste exemplo. A Conta Corrente preserva a unidade de valor e a origem. Quatro gramas são o resultado da regra de 5% sobre 80 gramas produzidos.”

### Deep branch D — João Expense provenance

**UI navigation:** **Despesas** → locate João Ferreira’s canteen Expense.

**Actions**

1. Open the Expense.
2. Point to quantity `2` and unit price `R$ 35,00` where rendered.
3. Point to total `R$ 70,00`.
4. Show the linked debit/receipt controls without advancing the receipt lifecycle.

**Talk track**

“A despesa guarda o contexto do cálculo. Não é apenas ‘menos setenta’: são duas refeições com preço unitário, total, Pessoa/Jornada e lançamento financeiro relacionados.”

### Deep branch E — Rafael zero balance and completed control

**UI navigation:** **Colaboradores** → **Rafael Lima** → **Conta Corrente**.

**Actions**

1. Point to `+R$ 350,00` earning.
2. Point to `-R$ 350,00` flight Expense.
3. Confirm the resulting BRL balance is `R$ 0,00`.
4. Follow the Expense or receipt link and show status **Devolvido**.

**Talk track**

“Saldo zero não significa ausência de história. Aqui há um crédito, um débito e evidência de recibo concluída. O valor líquido é zero, mas a proveniência continua disponível.”

---

## Recovery

Use recovery paths in this order. Do not improvise database edits during a prospect session.

### Recovery 1 — Lost your place in the UI

1. Use the visible main navigation rather than typing a URL.
2. Return to **Pessoas** as the stable starting workspace.
3. Confirm the top bar still shows **Mineração Serra Dourada — DEMO**.
4. Resume from the next story stop.

### Recovery 2 — Wrong Locatário or context appears selected

1. Stop the business narration.
2. Open the seletor de Locatário.
3. Select **Mineração Serra Dourada — DEMO**.
4. Wait for the workspace to finish loading.
5. Re-open **Pessoas** and confirm the seeded names are present before continuing.

If the demo Locatário is not available, do not continue using another Locatário. Sign out, verify the correct database/backend process is running, then sign in again.

### Recovery 3 — Wrong language

1. Use **Idioma**.
2. Choose **Português (Brasil)**.
3. Confirm **Pessoas**, **Colaboradores**, **Períodos de trabalho**, **Produção de ouro**, **Despesas**, and **Recibos pendentes** are shown in Portuguese.
4. Continue without changing contexto do Locatário.

### Recovery 4 — A seeded record or demo credential was mutated

If any presenter accidentally changes business fixture data, or if João's password-reset demonstration has already changed his credential and you need to return to the deterministic starting state:

1. End the current presentation session.
2. Reset the same environment used for the demo:

**LOCAL**

```bash
make brazilian-demo-local-reset
make brazilian-demo-local-verify
```

Then restart the backend against `data/brazilian-demo.db` and restart the frontend if necessary.

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

3. Sign in again as Mariana.
4. Select **Português (Brasil)**.
5. Confirm the three expected balances before resuming:

```text
João:   R$ 230,00
Camila: 4 g
Rafael: R$ 0,00
```

A deterministic reset also restores João, Camila, and Rafael to the seeded self-service password `Demo-31.4-Person!`.

### Recovery 5 — A number does not match the script

Do not explain the mismatch away.

1. Confirm the selected Locatário is `Mineração Serra Dourada — DEMO`.
2. Confirm you used the intended scenario anchor.
3. For LOCAL, run `make brazilian-demo-local-verify` with the same `BRAZILIAN_DEMO_AS_OF` value used for reset.
4. For Development or Test, re-run the corresponding `make brazilian-demo-server-reset ENV=development|test`; the server reset verifies a fresh snapshot of the actual deployed database before it completes.
5. If verification/reset fails, do not present from that environment.
6. If verification passes but the UI still differs, treat that as a product defect rather than changing the presenter story.

### Recovery 6 — Backend/frontend was started against the wrong database or revision

1. Stop both processes.
2. Restart the backend with:

```bash
ERS_DATABASE_PATH=data/brazilian-demo.db make local-backend
```

3. Restart the frontend with:

```bash
make local-frontend
```

4. Confirm the frontend revision printed at startup is the revision intended for the demo.
5. Sign in and re-check Locatário, locale, and balances.

---

## Closing

### Standard close

“ERS mantém identidade, histórico operacional, planejamento, produção e finanças conectados dentro de um limite explícito de Locatário. Nesta demonstração, cada saldo e cada pendência que vimos consegue voltar ao evento que o originou.”

Then ask the prospect to choose the most relevant next discussion:

- identity and Journey lifecycle;
- planning/operations;
- compensation and production;
- expenses and Current Account;
- receipt/document controls;
- Locatário/security boundary.

### Presenter guardrails

- Never use Production/customer data for this demo.
- Never switch to another Locatário just to keep a broken demo moving.
- Never invent a login for a seeded Person who has no Authentication Account.
- Never hide a fixture/UI mismatch with narration; recover or report it.
- Prefer seeded read-only states for the baseline story.
- Reset after any intentional or accidental mutation before the next presentation.
