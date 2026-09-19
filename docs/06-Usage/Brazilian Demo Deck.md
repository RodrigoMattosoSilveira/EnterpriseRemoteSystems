# Brazilian Prospect Demo Deck — Mineração Serra Dourada

> Canonical source for the Bite 31.5 prospect presentation. The live application is the primary visual; these slides frame the story and transitions.

## Slide 1 — Enterprise Remote Systems

**Headline:** Operação remota com identidade, trabalho e finanças conectados.

**On-screen points**

- Pessoas e Jornadas separadas, com histórico preservado.
- Planejamento e produção conectados à remuneração.
- Despesas, Conta Corrente e Recibos com proveniência.
- Dados isolados por Tenant.

**Presenter objective**

Open with the business problem: remote operations generate many linked facts about people, work, compensation, deductions, and acknowledgements. ERS keeps those facts connected rather than spreading them across disconnected spreadsheets and messages.

**Transition**

“Antes de entrar na operação, vou mostrar primeiro o limite de dados que estamos usando nesta demonstração.”

---

## Slide 2 — Tenant boundary first

**Headline:** Cada operação é vista dentro de um Tenant explícito.

**Demo anchor**

```text
Mineração Serra Dourada — DEMO
DEMO_BR_SERRA_DOURADA
```

**On-screen points**

- The selected Tenant is visible in the application shell.
- People and operational records are loaded in that Tenant context.
- Tenant context and authorization are separate from display language.
- The demo uses synthetic data only.

**Presenter objective**

Establish the security/data-isolation story before showing People. Do not imply that a Tenant name is a cosmetic filter; it is the operating boundary for the records being demonstrated.

**Transition**

“Com o limite do Tenant claro, começamos pela identidade permanente das pessoas.”

---

## Slide 3 — Person is the durable identity

**Headline:** A Pessoa permanece mesmo quando a relação operacional muda.

**Demo anchors**

- Mariana Alves — Tenant Administrator and Person.
- João Ferreira — active Collaborator.
- Camila Souza — active commission Collaborator.
- Rafael Lima — historical Journey plus current Journey.
- Beatriz Nascimento — Person with no Collaborator Journey.

**Presenter objective**

Explain that Person, Membership, and Collaborator Journey are different concepts. Use Beatriz to show that a complete Person does not have to be a Collaborator. Use Rafael to show that a Person can preserve multiple Journeys through time.

**Transition**

“Agora vamos sair do cadastro da Pessoa e olhar a relação operacional: a Jornada.”

---

## Slide 4 — Journey preserves employment/engagement history

**Headline:** Uma nova Jornada não apaga a anterior.

**Demo anchor**

Rafael Lima has:

- one historical finished Journey;
- one newer active Journey;
- current daily wage of `R$ 350,00` per worked day.

**Presenter objective**

Show why lifecycle history matters. The prospect should see that current work settings can change without rewriting the Person or erasing the historical Journey.

**Transition**

“Com os Colaboradores ativos definidos, o próximo passo é planejar quem trabalha, onde e em quê.”

---

## Slide 5 — Planning connects people to work

**Headline:** O Período de Trabalho organiza o plano e o realizado.

**Demo anchors**

- completed period: scenario anchor `- 2 days`, `DAY`, `06:00-18:00`, `FULLY_POSTED`;
- future period: scenario anchor `+ 1 day`, `DAY`, `06:00-18:00`, `PLANNING`;
- João, Camila, and Rafael are included in both;
- the completed period records all three as `WORKED`.

**Presenter objective**

Use the future period to explain planning and the completed period to explain the bridge from actual work to accrual.

**Transition**

“Quando o trabalho realizado está registrado, a produção e as regras de remuneração podem gerar valor com proveniência.”

---

## Slide 6 — Production drives explainable accrual

**Headline:** Produção registrada → apropriação explicável.

**Demo anchors**

- Gold Production: `80 g`.
- João: `R$ 300,00` daily earning.
- Camila: `5% × 80 g = 4 g` gold commission.
- Rafael: `R$ 350,00` daily earning.

**Presenter objective**

Make Camila the arithmetic proof point: the prospect can mentally verify `5% × 80 g = 4 g`. Emphasize that the posted earning retains the Work Period/assignment source rather than becoming an unexplained balance.

**Transition**

“Remuneração é só metade da história. A operação também precisa registrar despesas e mostrar o efeito líquido para cada Pessoa.”

---

## Slide 7 — Expenses remain traceable

**Headline:** A despesa não é apenas um número negativo.

**Demo anchors**

- João: two canteen meals, `2 × R$ 35,00 = R$ 70,00`.
- Rafael: synthetic flight, `R$ 350,00`.
- Each expense creates a traceable debit in the Current Account.

**Presenter objective**

Show source provenance from Expense to ledger debit. Explain that a correction or receipt lifecycle should not destroy the original business context.

**Transition**

“O resultado aparece na Conta Corrente, onde crédito e débito ficam reunidos sem perder a origem.”

---

## Slide 8 — Current Account explains the balance

**Headline:** O saldo é consequência de lançamentos auditáveis.

**Demo anchors**

```text
João   +R$ 300,00 - R$ 70,00 = R$ 230,00
Camila +4 g                    = 4 g
Rafael +R$ 350,00 - R$ 350,00 = R$ 0,00
```

**Presenter objective**

Do not present balances as opaque totals. Open João’s Current Account and point to the earning credit and canteen debit. If time permits, contrast Camila’s gold unit and Rafael’s zero BRL balance.

**Transition**

“Alguns débitos também exigem controle documental. É aí que entra o ciclo de Recibos.”

---

## Slide 9 — Receipt state is operational control

**Headline:** Pendência e conclusão são visíveis, não implícitas.

**Demo anchors**

- João receipt: `PENDING_ISSUE` / **Pendente de emissão**.
- Rafael receipt: `RETURNED` / **Devolvido**.

**Presenter objective**

Contrast pending work with completed evidence. The important point is not the status code itself; it is that the office can see what still requires action and what has already completed the receipt lifecycle.

**Transition**

“Com isso, fechamos o ciclo: identidade, trabalho, produção, valor, despesa e evidência permanecem conectados.”

---

## Slide 10 — One connected operating record

**Headline:** Do cadastro à evidência financeira, a história permanece ligada.

**On-screen chain**

```text
Tenant
→ Pessoa
→ Jornada
→ Período de Trabalho
→ Produção / Apropriação
→ Despesa
→ Conta Corrente
→ Recibo
```

**Presenter objective**

Summarize the value proposition in business language: less reconciliation, clearer responsibility, preserved history, and a visible operating boundary.

**Transition**

Use Slide 11 for executive close or continue into the deep-demo extension.

---

## Slide 11 — Executive close

**Headline:** O que o prospect acabou de ver

**On-screen points**

- Tenant boundary is explicit.
- Person identity survives Journey lifecycle changes.
- Planning and actual work connect to compensation.
- Financial balances can be explained from source events.
- Receipt work has visible pending/completed states.
- Portuguese presentation does not alter canonical data semantics.

**Closing question**

“Qual dessas etapas hoje exige mais reconciliação manual ou mais confiança em planilhas na sua operação?”

---

## Slide 12 — Deep-demo extension map

**Headline:** Aprofundamento opcional

**Choose based on prospect interest**

- **Identity/lifecycle:** Beatriz vs. active Collaborators; Rafael historical/current Journeys.
- **Operations:** future Work Period planning and assignments.
- **Compensation:** Camila’s `5% × 80 g = 4 g` commission provenance.
- **Finance:** João’s `R$ 230,00` balance and source links.
- **Controls:** João pending receipt vs. Rafael returned receipt.

**Presenter objective**

Do not continue mechanically through every screen. Use the prospect’s questions to select one or two deep-demo branches while preserving the same deterministic fixture.
