# Byte 35.4 — Tenant Functional and Operational Readiness: Manual Acceptance

**Authoritative source:** `docs/bite-35/launch-plan.md`, specifically 35.4 (formerly 34.2). **Branch:** `1049-byte---354-tenant-functional-and-operational-readiness`. **Environment for hands-on checks:** authorized LOCAL or dedicated Development/Test synthetic Tenants; **never Production** for this acceptance. **Customer language:** `pt-BR`; functional tests are **UI first**. **Technical-only tests:** operator commands below. This suite does **not** establish Production launch authorization.

## Preparation — identities, Tenant, and protected test data

**Coordinator:** named ERS functional trainer and a **separate** technical operator. Verify the following identities in the correct non-Production vault (LOCAL/Development `ers-development`, Test `ers-test`). Do not assert these accounts work without an actual sign-in. Passwords must never be transcribed into this evidence.

| Alias | Expected LOCAL test identity | Role, context |
|---|---|---|
| APP | verified global Application Administrator (credential via authorized 1Password item) | Global administration ONLY |
| ADMIN-A | `e2e-authz-admin-tenant-admin@example.com` | Tenant Administrator, `E2E Authorization Admin Boundary` (Tenant A) |
| ADMIN-B | `e2e-isolation-tenant-admin@example.com` | Tenant Administrator, `E2E Operational Isolation` (Tenant B) |
| EARN-A | `e2e-authz-admin-earnings-operator@example.com` | Earnings Operator, A |
| EXP-A | `e2e-authz-admin-expenses-operator@example.com` | Expenses Operator, A |
| COLLAB-A | `e2e-byte352-collaborator-a@example.com` | Collaborator/Person self-service, A |
| SHARED | `e2e-byte352-shared@example.com` | Single Person/Account, separate Tenant A and B memberships/Actors |

**These are expected historical fixture labels, not proof of existence or credentials.** Independently verify each Account/role/active Tenant/Journey against the current environment before testing; if missing, mark dependent scenarios **BLOCKED**. APP is never a substitute for ADMIN-A. Where a write is needed, the operator and trainer must name a **disposable synthetic record**, approved change boundaries, before the test. Never reset a valuable LOCAL database, generate Production fixtures, or use a real Customer Person/Journey for test data.

Record one line per test in the [readiness evidence template](byte-35-4-readiness-evidence.template.json) or equivalent protected worksheet: date/time/time zone; exact SHA/environment; identity alias; selected Tenant; synthetic Person/Journey/Period identifiers where relevant; observed result; screenshot/log reference (redacted); reviewer; status `PASS`, `FAIL`, `BLOCKED` or justified `N/A`. Do not commit completed records containing tenant/customer information. The template begins with every case `NOT_RUN`.

**STOP immediately** on wrong environment, wrong Tenant or Actor, missing account/permission, unexpected financial mutation, missing test cleanup authority, unverified deployment identity, any data leakage, or a page that would require a destructive step. Lack of evidence is `BLOCKED`, not `PASS`. No automatic credentials or database reset are authorized by these instructions.

## Functional customer training — UI only, in Portuguese

The trainer uses [Manual completo de treinamento e operação da Entidade](byte-35-4-manual-do-tenant-pt-br.md); the customer is never asked to run CLI, SQL, Docker or API calls. Unless a test says otherwise, exercise read-only navigation and **Cancel** before any final save or signature. Do not leave a browser authenticated between different identities.

### F01 — Login, language and selected Tenant

**Identity/context:** ADMIN-A / Tenant A / authorized LOCAL browser; then ADMIN-B / Tenant B in a new signed-in session. **Precondition:** two verified, independent credentials.

1. As ADMIN-A, sign in by the visible login page; select Tenant A and **Português (Brasil)** using the visible controls.
2. Refresh and confirm Tenant A and Portuguese remain coherent; inspect navigation options.
3. Sign out completely. As ADMIN-B, sign in, choose Tenant B and Portuguese.
4. Confirm the displayed Tenant and authorized navigation differ as expected; sign out.

**PASS:** each session is bound to its intended Tenant/Actor, locale is `pt-BR`, no other Tenant's records exposed. **FAIL:** incorrect context, cross-Tenant data or untranslated customer-facing content. **BLOCKED:** missing credentials or selector.

### F02 — Pessoas and Tenant Membership

**Identity/context:** ADMIN-A / Tenant A; synthetic shared Person only after fixture verification.

1. Sign in ADMIN-A, select A, choose **Pessoas** via visible navigation.
2. Search for the approved fictitious Person, open detail and check Tenant Membership.
3. Open an available edit form and cancel **without saving**. Confirm no Person duplication.
4. Search again and confirm the Tenant-B-only Membership cannot be inferred from this Tenant's UI.

**PASS:** correct shared Person under allowed Tenant scope; no unintended change. **BLOCKED:** no safe shared Person fixture. **FAIL:** Tenant-B membership leakage or duplicate Person.

### F03 — Colaborador/Jornada and balance invariants

**Identity/context:** ADMIN-A / Tenant A / existing disposable synthetic Journey.

1. Navigate **Colaboradores** → choose approved Colaborador → inspect Journey and dates.
2. Open one active and, if available, one closed Journey. Check closed state is not editable.
3. Read displayed balances, without posting/closing anything. Review that new Journeys are initialized at zero.

**PASS:** selected Journey belongs to Tenant A, closed Journey read-only, no nonzero-balance closure available. **BLOCKED:** no matching fixtures for the active/closed checks. **FAIL:** cross-Tenant or invalid closure behavior.

### F04 — Plano, substituições e proposta de trabalho do período seguinte

**Identity/context:** EARN-A / Entidade A / Período de Trabalho sintético em Planejamento, com permissão de edição de plano. **Pré-requisito para gravação:** período descartável aprovado, duas ou quatro Pessoas elegíveis e autorização específica para salvar a atribuição. Para comparar proposta herdada, exigir período anterior com mesmo código e resultado real `WORKED`. Sem esses dados, marcar o subcaso `BLOCKED`, nunca criar lançamentos financeiros para forçar cobertura.

Use o [Manual completo de treinamento e operação da Entidade](byte-35-4-manual-do-tenant-pt-br.md), **Capítulos 04 e 05**, incluindo os exercícios **F04-S01 a F04-S08**. Todos os passos a seguir são UI-first:

1. Entre como **EARN-A**, selecione A → **Períodos de Trabalho** → período **editável** → **Plano**. Registre data, código, nome e estado; use **Limpar filtros** para visualizar todas as linhas.
2. Em cada linha, explique a diferença entre **✓ (incluído)**, **Disp. A/F/L**, **Cand.** e **Repl.**. Em `pt-BR`, **F significa Folga** (o inglês usa D), e a coluna de substituição ainda exibe o cabeçalho compacto **Repl.**.
3. Execute **F04-S01 e F04-S02** para verificar plano normal e candidato local sem vínculo salvo. Não afirme que só marcar Cand. grava substituição.
4. Em **F04-S03**, prepare a Pessoa afastada (Ana, **F**) e a Pessoa que vai trabalhar (Bruno, **A**, **✓**, **Cand.**). Escolha **Ana em Repl. da linha de Bruno**. A substituição tem direção **Bruno → Ana**. Só salve no período descartável aprovado; reabra e comprove persistência.
5. Em exercícios separados, execute **F04-S04 a F04-S07**: alvo em Licença, proibição de alvo duplicado, ausência de alvo A e retirada de vínculo. Registre quais foram apenas lidos e quais foram efetivamente salvos.
6. Em **F04-S08**, abra um novo período sem atribuição salva e com o **mesmo código** de um anterior. Compare atribuição informada, trabalho real de `WORKED` e campos que usam fallback; não marque a opção de atualizar **padrões futuros** apenas para verificar a proposta.
7. Em **Informar / Imprimir**, confira a lista de afastados F/L sem substituto. Não marque a escala como informada a menos que exista aprovação de escrita específica. Registre evidência redigida por cenário.

**PASS:** direção correta, eligibilidade e persistência de substituições aprovadas, proposta de trabalho real sem reescrever histórico e ausência de mutação não autorizada. **BLOCKED:** falta período descartável, Pessoas ou histórico de mesmo código; indicar precisamente os cenários S01–S08 não executados. **FAIL:** substituição invertida, vínculo perdido após salvar, alvo duplicado ou mudança silenciosa de dados financeiros/Jornada.

### F05 — Informar and print, without pretending acceptance

**Identity/context:** EARN-A / Tenant A / synthetic period in planning status.

1. Open the period → **Informar**. Inspect the informed roster and printable plan.
2. Use **Imprimir plano** without exposing real names; discard print preview.
3. If a separately approved disposable period exists, execute **Marcar como informado**; otherwise leave unchanged and record mutation subcase BLOCKED.
4. Confirm this operation does **not** claim automated notification or collaborator acceptance (deferred item `34.4`).

**PASS:** correct informed roster and print view; no false collaborator acceptance. **FAIL:** application represents informing as automatic acceptance. **BLOCKED:** no safe mutable fixture for Step 3.

### F06 — Resultados, effective versus informed work

**Identity/context:** EARN-A / Tenant A / approved open synthetic Work Period, one test assignment; written authorization to alter it.

1. Open **Períodos de trabalho** → chosen period → **Resultados**.
2. Record informed Setor/Local/Tarefa; select an outcome and **different** effective Setor/Local/Tarefa only if the fixture is authorized for writes.
3. Save and reopen the same assignment. Confirm both distinct sets remain visible.
4. Verify the informed compensation basis is unchanged and that a CLOSED period rejects edits.
5. Record the final synthetic values and leave them for fixture owner reconciliation; do not rewrite live data.

**PASS:** effective evidence persists without changing informed values or earnings basis, CLOSED read-only. **BLOCKED:** no approved writable record. **FAIL:** compensation changes only because effective work differs.

### F07 — Produção de Ouro / Acúmulo / evidências conforme o papel

**Identidades/contextos:** primeiro **EARN-A / Entidade A** (consulta de produção no Acúmulo, sem pressupor `gold_production.read` ou `.manage`); depois, em nova sessão, **ADMIN-A / Entidade A**, com permissão de produção/Conta Corrente, se efetivamente concedida. **Pré-requisito:** período sintético com produção registrada; para conciliação financeira, item de Acúmulo já lançado, sem criar dados para passar no teste.

1. Entre como **EARN-A**, selecione A → **Períodos de Trabalho** → período aprovado → **Acúmulo** → **Ouro Produzido**. Leia Local, data, gramas e observações. A falta do menu administrativo **Produção de Ouro** para EARN-A **não é falha**.
2. Revise os itens do Acúmulo, observações, estados e pendências. Não execute novo Acúmulo nem lance itens nesse exercício.
3. Saia completamente. Entre como **ADMIN-A** na mesma Entidade e, **se autorizado**, abra **Produção de Ouro**. Compare os registros com o mesmo período, sem salvar alteração.
4. Ainda como ADMIN-A, abra a Jornada fictícia com item de Acúmulo **já lançado** em **Conta Corrente**. Inspecione a atribuição informada e o trabalho realizado sem modificar saldos.
5. Se faltar produção ou lançamento histórico, registre o respectivo subcaso **BLOCKED**. Não modifique permissões, produção ou finanças para completar a evidência.

**PASS:** interface coerente com cada permissão, produção consultável em Acúmulo e histórico financeiro rastreável sem reescrever remuneração informada. **BLOCKED:** falta registro ou papel autorizado e verificado. **FAIL:** acesso indevido, contexto incorreto ou valores alterados pela simples mudança de Setor/Local/Tarefa efetivos.

### F08 — Expenses and correction discipline

**Identity/context:** EXP-A / Tenant A / approved synthetic expense, no write.

1. Sign in EXP-A, select A → **Despesas** and search by the approved fictitious Colaborador.
2. Inspect expense detail; open **Nova despesa**, review required fields, then **Cancelar**.
3. Confirm ordinary editing of posted expense is not silently allowed; authorized correction uses cancellation/recreation with audit trail where supported.
4. Sign out; do not create an actual charge.

**PASS:** expenses are tenant-scoped, permission-consistent, cancellable/recreatable only through authorized workflow. **BLOCKED:** no expense fixture. **FAIL:** unauthorized edit or cross-Tenant expense.

### F09 — Conta Corrente and Journey-specific values

**Identity/context:** ADMIN-A / Tenant A / approved synthetic Journey with ledger history.

1. Open **Colaboradores** → approved Colaborador → selected **Jornada** → **Conta Corrente**.
2. Switch between credits, debits, gains, expenses and outstanding receipts; check BRL and GOLD_GRAM separately.
3. When available, open **Ganhos atuais e futuros** and verify reference to this Journey, not lifetime Person total.
4. Inspect one Work Period attribution snapshot without changing balances.

**PASS:** correct Journey-scoped history/projection and units. **BLOCKED:** no qualifying history. **FAIL:** balance/history from another Journey or Tenant.

### F10 — Direction-specific Receipts and settlement

**Identity/context:** COLLAB-A / A to inspect Colaborador-side receipt; ADMIN-A / A to inspect Tenant-side receipt. **Prerequisite:** safe synthetic pending receipts of both directions; no signature unless specifically approved.

1. Sign in COLLAB-A; open **Recibos pendentes** and review a receipt where Tenant pays Colaborador. Confirm payer, recipient, value and that collaborator signature is the required confirmation. **Do not sign.** Sign out.
2. Sign in ADMIN-A; inspect receipt where Colaborador pays Tenant. Verify Tenant Administrator must sign. **Do not sign.**
3. Inspect synthetic closure state; confirm unpaid/nonzero balance or required unsigned receipt blocks closing the Journey.
4. Sign out; record which direction was actually available.

**PASS:** direction and permitted signer correct, no mutation. **BLOCKED:** one or both receipt directions unavailable; record subcase. **FAIL:** wrong signer or bypass of required receipt.

### F11 — Tenant administration and least privilege

**Identity/context:** ADMIN-A / A; EARN-A / A; EXP-A / A, each in their own sessions.

1. ADMIN-A: use visible **Autorização**, **Dados de referência**, **Lista de preços**, **Preços do ouro** and **Configurações da conta** where granted; review without saving/granting. Sign out.
2. EARN-A: confirm permitted earnings/planning views; confirm Expenses-only management actions are not available. Sign out.
3. EXP-A: confirm expenses views; confirm earnings/Role Grant management actions are not available. Sign out.
4. Record any missing expected menu as **BLOCKED** until verified against intended permissions, not as permission to escalate.

**PASS:** separation of roles and Tenant scope. **FAIL:** unauthorized operation/role elevation. **BLOCKED:** absent privileges or fixture cannot be reconciled.

### F12 — Collaborator self-service and cross-Tenant Person

**Identity/context:** COLLAB-A / A, then SHARED / A and B, independent sessions. **Prerequisite:** verified global Person shared across two Tenant Memberships/Actors.

1. COLLAB-A: open personal **Pessoas** view, own Jornada, **Conta Corrente**, receipts; observe without editing someone else's information; sign out.
2. SHARED: sign in, select A and note Person ID/name, Journey and allowed ledger scope.
3. Use the UI Tenant selector to choose B; verify same Person/Account but distinct Membership, Actor, Journey and financial context.
4. Switch back to A; confirm no cached Tenant-B ledger is displayed. Sign out.

**PASS:** canonical Person/Account and strict isolation. **FAIL:** cross-Tenant leak or incorrect effective Actor. **BLOCKED:** missing SHARED fixture/Journey.

## Technical operator acceptance — no customer participation in shell commands

### O01 — Operator and safe baseline

**Identity/context:** named technical operator / LOCAL, not APP. **Steps:** (1) Record owner/alternate, expected SHA, environment and escalation route. (2) Run `pwd`, `git branch --show-current`, `git rev-parse HEAD`, `git status --short`. (3) Confirm secrets are referenced only through approved 1Password sources. **PASS:** correct SHA, clean checkout, named owners and credential source. **BLOCKED:** missing owner, dirty tree or unknown environment. **FAIL:** leaked secret or unsafe state.

### O02 — Offline check, LOCAL regression and matching CI

**Identity/context:** developer / LOCAL checkout at the **new committed SHA**. **Steps:** (1) Run `make byte354-readiness-check`. (2) Run `make byte351-baseline-check`, `make byte352-i18n-check`, `make local-check`; record each exit status. (3) Open GitHub Actions, locate CI at **the exact same SHA** and record URL and result. **PASS:** all checks 0 and matching-SHA CI green. **BLOCKED:** missing dependencies/CI. **FAIL:** reproducible test error. The static check is not customer or Production evidence.

### O03 — Roles and two non-Production Tenants

**Identity/context:** test coordinator + APP/ADMIN-A/ADMIN-B/EARN-A/EXP-A/COLLAB-A/SHARED / their stated contexts. **Steps:** (1) Verify the seven account credentials individually through sign-in. (2) Compare visible authority with O03 matrix in the technical runbook. (3) Perform F01, F11 and F12 negative Tenant-access checks. (4) Record exact fixture/Tenant identifiers. **PASS:** all present and properly scoped. **BLOCKED:** any missing account or synthetic fixture. **FAIL:** privilege/cross-Tenant leak.

### O04 — Observable operations and backup-failure ownership

**Identity/context:** designated monitoring operator / authorized non-Production target. **Steps:** (1) Identify exact target, then run only the approved HTTPS `healthz` read-only command from O04. (2) Identify owner and proof for daily backup schedule, failure alerts and last reviewed alert. (3) Record newest successful backup date and source of evidence without copying secrets. **PASS:** health `200` and actual, attributable schedule/alert evidence. **BLOCKED:** schedule/alert/owner not confirmed. **FAIL:** health outage or documented missed backup. No Production probe required.

### O05 — Real restore evidence, not simulated signoff

**Identity/context:** authorized recovery technician / isolated non-Production rehearsal. **Steps:** (1) Obtain change approval and canonical runbook. (2) Identify verified authentic off-host backup, restore-point ID and separate staging target. (3) Execute the existing documented recovery rehearsal **only in a separate approved exercise**, record SQLite integrity and foreign-key output, isolated health, measured RPO and RTO. (4) Record exact object/receipt evidence and confirmation of no live DB replacement. **PASS:** real isolated restore verified and measurements within approved objectives. **BLOCKED:** no technician, backup, approved environment or evidence. **FAIL:** integrity failure, live data replacement or unmet objectives.

### O06 — Authorization and Support Access Lease

**Identity/context:** APP global, then ADMIN-A Tenant A; separate sign-ins. **Steps:** (1) APP reviews global control plane and Lease request/history without creating leases. (2) ADMIN-A confirms approval rights are tenant-scoped and access is temporary/permissions-bounded. (3) Confirm no new Person/Actor/Membership/Role Grant is created through this read-only review. (4) Record denied cross-Tenant test outcomes. **PASS:** scope and lease rules respected. **BLOCKED:** inaccessible UI/identity. **FAIL:** unauthorized access or mutation.

### O07 — Incident tabletop (no destructive actions)

**Identity/context:** on-duty technical operator and business contact / tabletop, LOCAL or meeting. **Steps:** (1) Simulate cross-Tenant leak, failed migration and missing backup as three **hypothetical** scenarios. (2) For each record incident owner, escalation, STOP action, protected evidence location, and decision authority. (3) Do not actually revoke roles, restore data or kill services. **PASS:** complete actionable escalation record for all three; **BLOCKED:** missing owner/authority; **FAIL:** procedure recommends destructive shortcut.

### O08 — Handoff dependencies and unresolved LastPass contradiction

**Identity/context:** release owner + alternate / pre-promotion review. **Steps:** (1) Review Bite 35.5 / 35.6 / 35.7 pending work. (2) Read `ops/recovery-access.production.env` and canonical recovery runbook **without displaying secret values**. (3) Record that historical LastPass locators conflict with the 1Password-only launch contract, and assign correction/verification to **35.6**. (4) Identify all four deferred items (34.4, 34.5, 33.6.6+, 33.6.8E/F). **PASS for 35.4 documentation:** blockers accurately described and assigned. **Production gate remains BLOCKED** until reconciled. **FAIL:** claimed resolution or Production acceptance without evidence.

### O09 — Session teardown, no leaked test containers/ports

**Identity/context:** test coordinator / LOCAL. **Steps:** (1) Record `docker ps -a --format '{{.ID}} {{.Names}}'` if Docker is installed, and `lsof -nP -iTCP:8080 -sTCP:LISTEN`. (2) This Byte 35.4 checker creates **no containers or servers**; if other explicitly authorized test jobs created containers, stop/remove **only their recorded IDs**, even on failure. (3) Stop only frontend/backend processes that this test started, with Ctrl+C in their terminals. (4) Repeat inventory; confirm no test-created container remains and port 8080 is released **when this suite owned that port**. (5) Sign out all identities and record any remaining synthetic writes requiring reconciliation. **PASS:** clean ownership-aware teardown; **BLOCKED:** unknown process/container ownership; **FAIL:** unhandled leaks or indiscriminate cleanup.

## Evidence, independent review and promotion decision

- **Functional readiness PASS** means all F01–F12 required procedures were demonstrated in `pt-BR` by their intended identities in the correct Tenant, with evidence. If required synthetic fixtures or safe authorized write contexts are missing, report **BLOCKED**, not a partial PASS.
- **Technical readiness PASS** means O01–O09 have independent evidence, including actual operations/restore verification where required. A script validating Markdown does not establish O04/O05.
- **Byte 35.4 acceptance PASS** requires both above, matching-SHA CI, a non-secret evidence package, human trainer/customer and operator signoff, and no unresolved byte-specific defects. Remaining 35.5/35.6/35.7 dependencies are recorded separately and **continue to block Production activation**.
- **N/A** may only be used if the reviewer documents why the case genuinely does not apply; absence of data/credentials/permission is `BLOCKED`. Do not promote based on guessed outcome.
- This byte adds neither migrations nor business logic changes. For production go-live, use the six launch gates and separate authorizations in Byte 35.7.

**Glossary impact:** no changes to canonical ERS terms. Customer training clarifies the distinction between **informado** and **efetivo**, and between **Pessoa, Associação, Ator, Colaborador, Jornada, Conta Corrente** and **Recibo**. Proposed terminology changes require separate explicit review, not silent scope expansion.
