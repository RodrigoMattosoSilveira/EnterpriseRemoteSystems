# Brazilian Demo Presenter Runbook

## Purpose

This runbook is the executable Bite 31.5 presenter script for the deterministic Brazilian demo. It supports the dedicated LOCAL Bite 31.4 database and deployed Development/Test environments using the same synthetic Tenant.

The baseline demo is intentionally read-only. It uses seeded records so the presenter can move quickly, avoid accidental state drift, and reset to a known scenario when necessary.

## Presenter preflight

### Identity and fixture

Use exactly this presenter identity:

```text
Name:     Mariana Alves
Login:    demo.tenant-admin@example.test
Password: Demo-31.4-Brasil!
Role:     TENANT_ADMIN
Tenant:   Mineração Serra Dourada — DEMO
Tenant ID: demo-br-serra-dourada
Tenant code: DEMO_BR_SERRA_DOURADA
```

The default scenario anchor is `2026-09-18`.

The current fixture provisions only Mariana’s Authentication Account. João Ferreira, Camila Souza, Rafael Lima, and Beatriz Nascimento are demo Persons, but this source tree does not give them sign-in credentials. Do not attempt those sign-ins during the baseline demo.

### 1. Reset the demo database

Choose exactly one environment.

For a LOCAL rehearsal, stop any backend process using the dedicated demo database and run:

```bash
make brazilian-demo-local-reset
make brazilian-demo-local-verify
make brazilian-demo-presentation-check
```

For the deployed Development environment, run this **single pre-demo command** on the ERS server:

```bash
make brazilian-demo-server-reset ENV=development
```

For the deployed Test environment, run the same command with the Test environment selected:

```bash
make brazilian-demo-server-reset ENV=test
```

The server command is intentionally destructive to the selected Development/Test backend database volume. It refuses Production, takes a verified backup of the current database, recreates a clean migrated backend database using the already-deployed image, seeds and verifies `Mineração Serra Dourada — DEMO`, restarts the complete stack without building/deploying new images, and finishes with backend/public smoke checks. You do **not** need to stop Docker containers manually.

If using a non-default scenario anchor, use the same single server command with the anchor:

```bash
make brazilian-demo-server-reset ENV=test BRAZILIAN_DEMO_AS_OF=2026-10-15
```

For LOCAL, pass the same anchor to reset and verification. Record the scenario anchor. The completed Work Period is `anchor - 2 days`; the future planning Work Period is `anchor + 1 day`.

### 2. Start the backend

In Terminal 1:

```bash
ERS_DATABASE_PATH=data/brazilian-demo.db make local-backend
```

Leave it running.

### 3. Start the frontend

In Terminal 2:

```bash
make local-frontend
```

Confirm the revision printed by `make local-frontend` corresponds to the branch being demonstrated.

### 4. Prepare the browser

1. Open the local ERS URL printed by the frontend.
2. Sign in with `demo.tenant-admin@example.test` / `Demo-31.4-Brasil!`.
3. In the **Idioma** selector, choose **Português (Brasil)**.
4. Confirm the Tenant selector shows **Mineração Serra Dourada — DEMO** with code `DEMO_BR_SERRA_DOURADA`.
5. Do not create, edit, inform, post, cancel, print, or return records during the baseline demo.

### 5. Know the three numbers before presenting

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

---

## Executive demo — approximately 12 minutes

### Stop 1 — Establish the Tenant boundary

**Identity:** Mariana Alves — Tenant Administrator.

**Required context:** `Mineração Serra Dourada — DEMO`.

**UI navigation:** remain on the initial authenticated workspace. Use the Tenant selector in the top bar; do not navigate by URL.

**Actions**

1. Point to the Tenant selector.
2. Read the selected Tenant name aloud: **Mineração Serra Dourada — DEMO**.
3. Briefly point out the code `DEMO_BR_SERRA_DOURADA`.
4. Point to **Idioma** and confirm **Português (Brasil)**.

**Talk track**

“Antes de olhar pessoas ou finanças, este é o limite operacional da demonstração. Tudo o que eu abrir agora está sendo carregado no contexto deste Tenant. O idioma é apresentação; ele não muda o Tenant nem a autorização.”

**Do not** imply that changing language changes stored data or security scope.

**Transition:** “Com o limite claro, começamos pela Pessoa.”

### Stop 2 — People as durable identity

**UI navigation:** select **Pessoas** in the main navigation.

**Actions**

1. Confirm the page heading is **Pessoas**.
2. Point to the Tenant-boundary information near the People workspace.
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

“Em uma única história vimos o limite do Tenant, a identidade da Pessoa, o histórico de Jornada, o trabalho planejado e realizado, produção, remuneração, despesa, Conta Corrente e recibo. O objetivo é reduzir reconciliação manual sem perder a origem de cada decisão e valor.”

Ask:

“Qual dessas etapas hoje exige mais reconciliação manual ou mais confiança em planilhas na sua operação?”

---

## Deep demo — extend the session to approximately 25–35 minutes

Run the executive path first, then select the branches below based on prospect interest. Do not run every branch by default.

### Deep branch A — Beatriz: Person without Collaborator Journey

**UI navigation:** **Pessoas** → **Beatriz Nascimento**.

**Actions**

1. Show that Beatriz has a complete Person record.
2. Explain the Tenant Membership context visible on the Person page.
3. Confirm there is no active Collaborator Journey to open.
4. Do not create one.

**Talk track**

“Ter uma Pessoa no Tenant não significa automaticamente ter uma Jornada de Colaborador. Essa separação permite cadastrar e governar identidade sem inventar uma relação operacional que ainda não existe.”

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

### Recovery 2 — Wrong Tenant or context appears selected

1. Stop the business narration.
2. Open the Tenant selector.
3. Select **Mineração Serra Dourada — DEMO**.
4. Wait for the workspace to finish loading.
5. Re-open **Pessoas** and confirm the seeded names are present before continuing.

If the demo Tenant is not available, do not continue using another Tenant. Sign out, verify the correct database/backend process is running, then sign in again.

### Recovery 3 — Wrong language

1. Use **Idioma**.
2. Choose **Português (Brasil)**.
3. Confirm **Pessoas**, **Colaboradores**, **Períodos de trabalho**, **Produção de ouro**, **Despesas**, and **Recibos pendentes** are shown in Portuguese.
4. Continue without changing Tenant context.

### Recovery 4 — A seeded record was mutated

If any presenter accidentally creates, edits, informs, posts, cancels, prints, signs, returns, or otherwise changes the fixture:

1. End the session and stop the backend using `brazilian-demo.db`.
2. Run:

```bash
make brazilian-demo-local-reset
make brazilian-demo-local-verify
```

3. Restart the backend against `data/brazilian-demo.db`.
4. Sign in again as Mariana.
5. Select **Português (Brasil)**.
6. Confirm the three expected balances before resuming:

```text
João:   R$ 230,00
Camila: 4 g
Rafael: R$ 0,00
```

### Recovery 5 — A number does not match the script

Do not explain the mismatch away.

1. Confirm the selected Tenant is `Mineração Serra Dourada — DEMO`.
2. Confirm you used the intended scenario anchor.
3. Run `make brazilian-demo-local-verify` with the same `BRAZILIAN_DEMO_AS_OF` value used for reset.
4. If verification fails, reset the demo database before presenting again.
5. If verification passes but the UI still differs, treat that as a product defect rather than changing the presenter story.

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
5. Sign in and re-check Tenant, locale, and balances.

---

## Closing

### Standard close

“ERS mantém identidade, histórico operacional, planejamento, produção e finanças conectados dentro de um limite explícito de Tenant. Nesta demonstração, cada saldo e cada pendência que vimos consegue voltar ao evento que o originou.”

Then ask the prospect to choose the most relevant next discussion:

- identity and Journey lifecycle;
- planning/operations;
- compensation and production;
- expenses and Current Account;
- receipt/document controls;
- Tenant/security boundary.

### Presenter guardrails

- Never use Production/customer data for this demo.
- Never switch to another Tenant just to keep a broken demo moving.
- Never invent a login for a seeded Person who has no Authentication Account.
- Never hide a fixture/UI mismatch with narration; recover or report it.
- Prefer seeded read-only states for the baseline story.
- Reset after any intentional or accidental mutation before the next presentation.
