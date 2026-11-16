# Byte 35.6S.1 — Manual acceptance (T01–T12)

**Goal:** Independently establish that the named Customer Support Specialist can study and use ERS within an approved synthetic **Development Training Tenant** using her own account, without access to customer Production, infrastructure, or another Tenant. This is not customer signoff, the 35.6 two-human recovery test, or the 35.7 launch gate.

**Participants:** (1) **Training Coordinator** — observes and records tests, (2) **Training Tenant Administrator** — authorized account provisioning within that Tenant, (3) **Customer Support Specialist** — the trainee, and (4) **Technical Operator** — verifies deployed DEV version and escalations. Record *actual people responsible* privately; these are not new ERS Role codes. `TENANT_VIEWER` is the trainee's initial real tenant Role code. Do not use a generic Application Administrator session for the trainee.

**Preconditions:** Read `byte-35-6s1-onboarding-operator-guide.md` and `byte-35-6s1-customer-support-handbook-pt-br.md`. An approved Training Tenant exists in DEV with an individually controlled Tenant Administrator, only synthetic business data, and a separate new trainee Account. **Do not use** integrity-pinned `TRAIN354C_A` / `TRAIN354C_B` for onboarding writes. If an administrator, training identity or approved personal-data handling does not exist, record **BLOCKED** rather than create ad-hoc SQL identities. No LOCAL database reset, Production database write, private credential copying or E2E password sharing is permitted.

**Evidence protocol:** In each test record T-ID, observed screen (non-sensitive text), environment, Tenant code, actual deployed SHA (collected by the Technical Operator as shown in the guide), reviewer, status and escalation. Keep identity documents, passwords and session tokens out of evidence. `PASS` means directly observed, `FAIL` means observed wrong behavior/security boundary, `BLOCKED` means the scenario could not safely run. Tests are UI-first; only T01 has an authorized technical operator command.

## T01 — Confirm correct DEV deployment and documentation

**Identity:** Technical Operator collects revision; Training Coordinator reviews; trainee does not use server shell. **Environment:** deployed `https://dev.enterpriseremotesystems.com`.

1. Technical Operator opens the **Development** deployment run in GitHub Actions and identifies the successful deployed commit SHA. If shell confirmation is authorized, execute `cd /opt/EnterpriseRemoteSystems/development && git rev-parse HEAD` on the deployed Linux host; compare values and record only the matching 40-character SHA.
2. In a browser open `https://dev.enterpriseremotesystems.com/api/v1/healthz`; confirm HTTP `200` and no TLS warning.
3. Training Coordinator shares the approved **read-only** four-document training folder and trainee opens the support handbook and customer manual. Record only its non-secret location.

**Expected:** HTTPS DEV healthy, exact deployed SHA known, documents readable. **PASS:** all observed and recorded. **FAIL:** unexpected TLS/hostname mismatch or wrong deployment. **BLOCKED:** no approved operator, environment or documentation. **Cleanup:** close public health tab; no server changes.

## T02 — Verify an isolated synthetic Training Tenant

**Identity:** Training Tenant Administrator; Training Coordinator observes. **Environment:** DEV, explicitly selected dedicated training Tenant.

1. Administrator signs in with their **own** account, opens Tenant/context selector and selects the named training Tenant.
2. Open **People / Pessoas**; verify the visible records are documented as synthetic. Record only the Tenant code and a fictitious sample record identifier.
3. Confirm code is **not** `TRAIN354C_A`, `TRAIN354C_B`, any E2E fixture Tenant, or a customer Tenant. Confirm there is no customer Person, CPF, financial entry or attachment copied into training.

**Expected:** A separate non-Production Tenant with only synthetic records. **PASS:** isolation and synthetic origin verified. **FAIL:** customer records or immutable 35.4C fixtures modified. **BLOCKED:** no verified training Tenant / Tenant Administrator. **Cleanup:** sign out, no writes.

## T03 — Personal Account, Membership and first-login password change

**Identity:** Training Tenant Administrator for provisioning; trainee for login; Training Coordinator observes. **Environment:** DEV, dedicated training Tenant only.

1. Administrator locates **one** Person with the trainee's exact approved login email in **People**; verifies active Membership for this Tenant. If identity creation is not already approved and completed, follow the operator guide **section C** and do not invent a CPF.
2. In Person detail → **Authentication**, verify the individual Account login and enabled status. If needed use the approved Enable Authentication UI with a unique initial password from 1Password. Administrator signs out.
3. Trainee opens a new browser session, signs in with **her own** Account, changes the initial password when required, signs out and signs in again using the new password.
4. Training Coordinator verifies the account is not a fixture or a shared trainer login; do not record password, token, or identity documents.

**Expected:** one individually controlled Account and active correct Membership, first-login password change enforced. **PASS:** new credential works, old initial credential no longer used, no duplicate Account. **FAIL:** bypass, leaked credential, or duplicate Account. **BLOCKED:** absence of approved personal data or account provisioning. **Cleanup:** sign out all sessions.

## T04 — Tenant Viewer authorization and prohibited actions

**Identity:** trainee as `TENANT_VIEWER`; Training Tenant Administrator verifies role separately. **Environment:** DEV, training Tenant.

1. Administrator opens **Administration → Tenant Authorization / Delegated Roles**, searches trainee login, verifies `TENANT_VIEWER` granted for the **training Tenant only** and no `TENANT_ADMIN` or `APPLICATION_ADMIN`. Signs out.
2. Trainee signs in and opens visible **People**, **Planning**, **Expenses**, **Current Account** or other read-only pages, where enabled by Tenant data.
3. Verify create/edit/delete/save/grant controls are absent or disabled for the read-only trainee (where such controls ordinarily exist for a Tenant Administrator). **Do not attempt a forbidden write through an API/DevTools.**

**Expected:** least privilege, no modifications and no global administration. **PASS:** all expected boundaries observed. **FAIL:** unauthorized write/admin privilege. **BLOCKED:** user lacks `TENANT_VIEWER` or no representative page. **Cleanup:** cancel open forms, sign out.

## T05 — Explain People, Membership, Actors and Journeys

**Identity:** trainee (`TENANT_VIEWER`), with trainer present. **Environment:** DEV, training Tenant, synthetic Person.

1. Open **People** and a fictitious Person detail. Explain global Person versus Tenant Membership versus currently selected Actor using the handbook terminology table.
2. Open **Collaborators** and a synthetic Journey (if authorized); identify its dates and distinguish current from closed history.
3. Trainer asks the trainee to explain why switching Tenant cannot silently reuse the previous Actor or the financial context of another Tenant.

**Expected:** correct explanation, no Person/Account duplication or changes. **PASS:** all three concepts explained and observed. **FAIL:** incorrect cross-Tenant data appears. **BLOCKED:** no synthetic Person/Journey seeded. **Cleanup:** navigate away; no writes.

## T06 — Explain planning, informed and actual work

**Identity:** trainee (`TENANT_VIEWER`); trainer owns demonstrations. **Environment:** DEV, training Tenant and synthetic work period.

1. Open **Planning / Planejamento** and a fictitious period. Identify Sector, Location, Task and assignment status.
2. With the trainer, explain the difference between **planned**, **informed**, and **actual/effective** work and why an actual-work override does not destroy informed evidence.
3. Review the substitution quick-reference card (**Cand.**, **Subst.**) and explain one fictitious replacement scenario without saving.

**Expected:** correct terminology and record provenance. **PASS:** clear explanation, no writes. **FAIL:** saved unapproved change or wrong data attribution. **BLOCKED:** no training period or permission to view. **Cleanup:** cancel forms, sign out.

## T07 — Explain earnings, expenses, receipts and Current Account

**Identity:** trainee (`TENANT_VIEWER`). **Environment:** DEV, training Tenant and synthetic Journey.

1. Open a fictitious earnings/accrual record, identify period and origin; observe without posting or confirming.
2. Open a fictitious expense; explain its origin and allowed correction workflow without creating/reversing it.
3. Open **Current Account**, identify BRL and GOLD_GRAM units separately, and clarify that balances are Journey-scoped.
4. Open a synthetic pending Receipt if available; explain whether collaborator or Tenant must accept based on settlement direction. **Do not sign.**

**Expected:** correct explanation; no financial mutation. **PASS:** four distinctions explained. **FAIL:** unauthorized posting/signing, cross-Tenant values, wrong signer. **BLOCKED:** any required synthetic record absent. **Cleanup:** close views, no writes.

## T08 — First-line technical diagnosis: authentication and permission failure

**Identity:** trainee and trainer; both on **their own accounts**. **Environment:** DEV, synthetic examples only.

1. Trainer presents a hypothetical user report: "I cannot open Expenses." Trainee identifies checks: HTTPS host, login, selected Tenant, active Membership, assigned role, and expected permission.
2. Ask trainee to distinguish a genuinely denied write by `TENANT_VIEWER` (expected) from an unexpected broken read (possibly a defect).
3. Record a sanitized ticket with steps, expected and observed UI, relevant role, non-sensitive time/locale and escalation recipient.

**Expected:** safe diagnosis without credentials, SQL or bypass. **PASS:** clear classification and escalation. **FAIL:** request to share passwords/administrator credentials or bypass authorization. **BLOCKED:** trainer or sample issue unavailable. **Cleanup:** delete only disposable unsent ticket draft if requested.

## T09 — Cross-Tenant isolation, no customer visibility

**Identity:** trainee (`TENANT_VIEWER`). **Environment:** DEV, training Tenant.

1. From the UI Tenant selector, identify available Tenant names; verify the support trainee is authorized **only** for the dedicated Training Tenant (or record any *separately approved* additional synthetic context).
2. Open a synthetic Person/Current Account in training and then navigate to Tenant selection again; verify no other Tenant's financial information appears.
3. Confirm absence of Global administration, Production/customer Tenant data, permanent support lease, and cross-Tenant permissions. Do not try direct API access or impersonate customer users.

**Expected:** Tenant isolation. **PASS:** only training data visible and role scoped. **FAIL:** access to another customer's Tenant or stale cached data. **BLOCKED:** tenant context unavailable/unknown. **Cleanup:** sign out.

## T10 — Incident reporting and escalation tabletop

**Identity:** trainee and Technical Operator or Training Coordinator. **Environment:** meeting / DEV synthetic facts; no system changes.

1. Give trainee three **hypothetical** cases: unauthorized cross-Tenant data, failed login due to security suspension, and inconsistent BRL/Gold balance.
2. For each, record severity, first safe action, minimum non-sensitive evidence, responsible escalation person, and what she must **not** do.
3. Show one sample ticket following the handbook's `TREINO-CS-001` template. The Technical Operator confirms the escalation contact is reachable.

**Expected:** immediate STOP/security escalation for cross-Tenant suspicion; no password collection; no direct balance repair. **PASS:** all three safely handled. **FAIL:** unsafe bypass, data export or attempted infrastructure recovery. **BLOCKED:** responsible escalation person missing. **Cleanup:** retain sanitized tabletop record only.

## T11 — Brazilian Portuguese documentation and support communication

**Identity:** trainee and Training Coordinator. **Environment:** DEV UI `pt-BR` and approved read-only documents.

1. Set **Português (Brasil)** in the language selector; navigate between a Person and Planning page; inspect terminology in the handbook and actual UI.
2. Explain in Brazilian Portuguese the differences between Entidade, Pessoa, Vínculo, Ator, Colaborador, Jornada, Conta Corrente and Recibo.
3. Draft a two-paragraph customer response to a synthetic permissions problem, without credentials or customer-specific identifiers; the trainer reviews accuracy and tone.

**Expected:** correct terminology and accessible documentation. **PASS:** Portuguese explanation and customer-friendly response accepted. **FAIL:** misleading grant/role advice, privacy leak or material English untranslated UI not documented for correction. **BLOCKED:** documents/locale not available. **Cleanup:** save only reviewed sanitized training message.

## T12 — Custody, session cleanup and readiness decision

**Identity:** trainee, Training Coordinator and Technical Operator. **Environment:** DEV plus operator's private evidence file.

1. Confirm the trainee's password is individual, no default/shared E2E account was provided, and no temporary admin/operator Role Grant remains. Sign out from all trainee/trainer sessions.
2. Reconfirm there is no standing Production access or Production Support Access Lease; no sensitive info is present in notes or screenshots. If the DEV deployment was rebuilt, **repeat T01 and T03** before acceptance.
3. Coordinator completes the private evidence record created by the tool; run its `check` command from the operator guide. Review `REVIEW READY` output as **format review only** and independently sign the training acceptance record if actual observations support PASS.
4. Technical Operator confirms this byte created no containers or servers. If other tests created any, clean only their recorded containers and verify only the affected ports are released. Preserve existing DEV data and synthetic records; do not reset the database.

**Expected:** private evidence, clean session, retained approved training account, independent human assessment. **PASS:** all T01–T12 actually observed and separate human review completed. **FAIL:** secret leak, unresolved excess privilege, fabricated results or unsafe cleanup. **BLOCKED:** any missing test or incomplete human review. **Cleanup:** sign out, close temporary files securely, keep non-secret evidence in approved private location.

## Final disposition

| Outcome | Meaning |
|---|---|
| **PASS — Training ready** | Coordinator directly observed T01–T12 and approved the trainee's **non-Production** access only |
| **FAIL — Corrective action required** | A safety boundary or functional requirement was demonstrated to fail |
| **BLOCKED — Incomplete** | Missing approved Tenant, personal identity handling, documentation, training case, or reviewer |

Never equate offline test PASS, the evidence JSON `REVIEW READY`, or course completion with a Production customer-support authorization or a 35.7 launch approval.

## Glossary Impact

**Customer Support Specialist** remains an operational job, not a Role. **Training Tenant** remains a normal synthetic non-Production Entidade, not a special database or Tenant type. `TENANT_VIEWER` is the pre-existing read-only Tenant Role. No changes to the canonical definitions of Person, Membership, Actor, Journey, Current Account or Receipt.
