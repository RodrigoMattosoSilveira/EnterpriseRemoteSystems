# Byte 35.6S.1 — Customer Support Onboarding (operator guide)

**Purpose:** Give a named Customer Support Specialist a **personal, non-Production Authentication Account**, practice materials, and a clear functional/technical training program. This is onboarding, **not** a new ERS authorization Role, a Production support lease, or any 35.5–35.7 launch approval.

**Baseline:** This guide is shipped from branch `1089-byte-356s1-customer-support-onboarding-and-training`. Use the **actual committed/deployed SHA**, not the historical branch SHA, for acceptance. The release coordinator owns that value.

## A. Who does what (assign actual humans before starting)

| Term | Meaning in this guide | Allowed activities |
|---|---|---|
| **Training Coordinator** | Named staff member who owns the lessons, non-secret evidence and readiness decision | Reviews documentation, observes browser tests; never receives the trainee's password |
| **Non-Production Application Administrator** | Approved GLOBAL ERS administrator in DEV; not the trainee | Can create a Tenant using **Administration → Tenants**; cannot automatically create a Tenant Administrator by doing so |
| **Training Tenant Administrator** | Individually authorized Tenant Actor in the *dedicated training Tenant* | Creates/links a Person, enables Authentication where UI permits, and grants `TENANT_VIEWER` |
| **Customer Support Specialist (trainee)** | The prospective support professional: an individual human, never a shared E2E login | Signs in, changes initial password, explores authorized training Tenant and performs permitted exercises |
| **Technical Operator** | Authorized engineer/operations person who owns deployed DEV revision, fixture/data readiness and escalations | Checks revision/health, provisioned Tenant administrators, and explains expected vs observed behavior; does not hand over DB, vault or infrastructure secrets |

**Roles are responsibilities, not ERS Role Grants.** `TENANT_VIEWER`, `EARNINGS_OPERATOR`, `EXPENSE_OPERATOR`, and `TENANT_ADMIN` are actual existing ERS tenant Role codes. No `CUSTOMER_SUPPORT` Role exists at this baseline. The trainee **must not** receive `APPLICATION_ADMIN`, standing Production credentials, a Production support lease, a global Actor, a privileged database account, or a recovery credential. `TENANT_VIEWER` is the preferred first role (read-only visibility across the assigned Tenant, including some administrative/audit information); it is not a cross-Tenant read grant. A supervised later operator exercise requires separate documented approval **only in the dedicated non-Production training Tenant**, using existing grant/revoke UI.

## B. Choose safe environment and training data

**Preferred:** DEV at <https://dev.enterpriseremotesystems.com> (HTTPS). **Not TST** during 35.5/35.6/35.7 Test rehearsals; **never Production**. Do not expose a LOCAL development server to an outside trainee, turn on HTTP fallback in deployed environments, or disable security checks. DEV can be rebuilt on deployment; an onboarding account may need to be recreated or reverified after an approved DEV rebuild. The Training Coordinator records the DEV release SHA and repeats T01/T03 after any replacement.

**Preserve the Byte 35.4C fixture:** Its exact synthetic Tenants `TRAIN354C_A` and `TRAIN354C_B` are integrity-pinned and their complete scoped data are subject to a deterministic checksum. **Do not add the real support trainee, roles or training edits to either Tenant**: that would invalidate `make byte354c-training-verify-local` / the deployed verification contract. Training material for those fixtures may be shown by an authorized instructor or used in a separately approved rehearsal, but **never share an existing `training354c.*` login/password with the trainee**.

Use an **existing, independently approved DEV training-only Tenant** with a working Tenant Administrator, or have the approved GLOBAL administrator create a **new** Tenant in DEV: **Administration → Tenants → Create Tenant**. Suggested nonreserved code: `ERS_SUPPORT_TRAINING` and name `ERS — Customer Support Training (Synthetic)`. Check that it does not already exist before creating it. Mark description clearly **SYNTHETIC TRAINING ONLY — NO CUSTOMER RECORDS**. The new Tenant is empty; it does **not** automatically get a Tenant Administrator or seeded data. Open **Administration → Tenants → [the new Tenant] → Tenant Administrators**. The existing UI can assign an **eligible pre-existing Tenant Actor** from its candidate selector, but cannot invent the underlying Person, Account, or Membership. The GLOBAL administrator should use **Assign Tenant Administrator** only for an explicitly approved candidate who is eligible under cross-Tenant role restrictions, and confirm the Tenant reports `ACTIVE_READY`. If no eligible candidate exists, request the established, authorized initial-Tenant-Administrator enrollment procedure from the Technical Operator and verify its login before continuing. **If no authorized Training Tenant Administrator can be enrolled through an established safe procedure, STOP/BLOCKED.** Do not use E2E/Production bootstrap tools, ad-hoc SQL or import customer data as a workaround.

For initial lessons, the Training Tenant Administrator creates **only fictitious business records**, via normal UI (People, Journeys, Planning, Expenses, and so on), or uses an existing approved isolated synthetic training dataset. Do not copy real customer People, CPF, expenses, photos, balances, or documents. Never reset the 35.4C fixtures or the working DEV database to repair training setup.

## C. Create the trainee's own access (UI-first, trainee not yet signed in)

**Preconditions:** verified deployed DEV HTTPS; dedicated training Tenant; authorized Training Tenant Administrator already able to sign in; approval to represent the staff member in ERS. The current **People** form requires identifying fields, including CPF, RG, phone and email. Collect and record personal data **only with appropriate authorization and access protections**; do not invent a fake CPF for a real staff member. If using a real Person record in DEV is not approved, mark **BLOCKED** and request a privacy-preserving training identity design rather than fabricating identity or bypassing validation. Do not include these values in evidence documents.

1. **Training Tenant Administrator / DEV / training Tenant**: sign in with their individually managed credential from 1Password, choose the dedicated training Tenant in the context selector; check the Tenant name/code at the top. Open **People / Pessoas**. Search the exact intended email to avoid duplicate Global Person records. If the Person already exists, use the established **Add Membership / Adicionar vínculo** workflow for this Tenant; do not create a second Person or Authentication Account. If absent and authorized, use **Create Person**, fill the required identity fields and submit. Verify one active Person-Tenant Membership for this Tenant.
2. Open that Person's detail page → **Authentication / Autenticação** (existing `PersonAuthenticationSection`). Check whether Authentication is already enabled. If not, use **Enable Authentication / Habilitar autenticação** and enter a **unique temporary password** from the approved 1Password onboarding item, with confirmation. If the section is missing or returns a permission error, STOP; do not call internal APIs or use SQL to force it.
3. Alternatively, an authorized **GLOBAL Application Administrator** may use **Administration → Authentication → Create account** with the **exact Tenant and Person email** *after the active Membership exists*. The existing UI requires a temporary password and forces first change (`mustChangePassword: true`). Do not create another account if one already exists. Never use GLOBAL administration to grant a tenant role indirectly.
4. **Training Tenant Administrator / same training Tenant**: open **Administration → Tenant Authorization / Delegated Roles**, search the trainee's exact Account login, verify the Tenant binding and active Membership, and grant **`TENANT_VIEWER`**. Record the authorized role code, Tenant code, and visible result **without** the temporary password. If the Actor does not appear, return to People → Person → Authentication rather than creating an unbound Actor. Never grant `TENANT_ADMIN` merely to unlock training.
5. **Trainee / DEV / new browser session**: sign in at the HTTPS DEV URL using **her own email/account** and 1Password-controlled initial password; complete the mandatory first-login password-change screen; sign out and sign back in with the **new** credential. Choose the training Tenant if offered. Verify visible Tenant, read-only sections and no global administration or other customer Tenant. If access does not work, STOP and ask the Training Tenant Administrator/Technical Operator to review via UI; never exchange password or session cookies in chat/tickets.

**Credential custody:** 1Password is the approved store. The trainee owns her personal credential; an authorized administrator may securely issue the initial one-time password, but must not retain or reuse it after first change. No passwords, login tokens, reset URLs, CPF, or session cookies are committed or copied into reports. If credential handoff cannot be completed securely, mark **BLOCKED**.

## D. Verify the actual environment revision and reference material

The trainee uses browser UI only. The **Technical Operator** collects the DEV deployment revision from the approved deployment record (GitHub Actions deployment for Development with successful result and exact commit SHA), and may independently confirm on the **authorized** Linux DEV host:

```bash
# Authorized Technical Operator ONLY, on the deployed Linux host:
cd /opt/EnterpriseRemoteSystems/development
pwd
# Expected path: /opt/EnterpriseRemoteSystems/development
git rev-parse HEAD
# Expected: one 40-character hexadecimal SHA. Copy only the SHA to the evidence record.
```

If the release revision from GitHub and that deployed checkout differ, mark **BLOCKED** and investigate; do not assume this feature branch is deployed simply because a patch was committed. Without server access, the Training Coordinator must request a signed/traceable revision from the responsible operator, **not guess** the SHA.

In a browser open <https://dev.enterpriseremotesystems.com/api/v1/healthz>; expected: reachable HTTPS health response (normal condition is HTTP `200`). This proves availability only, **not** identity/role isolation. Do not use HTTP for deployed DEV/TST/PRD.

Provide the trainee read-only access to these curated, versioned files through an approved documentation-sharing channel (no need for GitHub code, database, secrets or server access):

- [`byte-35-6s1-customer-support-handbook-pt-br.md`](byte-35-6s1-customer-support-handbook-pt-br.md), the support handbook;
- [`byte-35-4-manual-da-entidade-pt-br.md`](byte-35-4-manual-da-entidade-pt-br.md), customer-facing business manual;
- [`byte-35-4a-cartao-substituicoes-pt-br.md`](byte-35-4a-cartao-substituicoes-pt-br.md), substitutions quick reference;
- [`byte-35-6s1-manual-acceptance.md`](byte-35-6s1-manual-acceptance.md), T01–T12 training acceptance exercises.

A shared folder may be used if it is approved and access restricted to the trainee and trainer. Record its **read-only location**, not a secret share token. Access to `docs/bite-35/byte-35-6-administrator-and-recovery-runbook.md`, Production vaults, backups, and credentials is **not** part of onboarding.

## E. Evidence collection and results (do not confuse reported evidence with actual verification)

Operator-only offline tool, executed from the local repository root by the Training Coordinator:

```bash
python3 -B scripts/ers-byte356s1-onboarding.py init \
  --output "$HOME/Downloads/ers-support-onboarding-evidence.json"
```

Expected: `BLOCKED: empty support onboarding evidence created ...; no access provisioned`. The file is created with private file mode `0600`; the tool **refuses to overwrite** an existing record. Edit this private file in a local editor. Supply the actual DEV SHA, approved trainee login, exact training Tenant code, names of owners, documentation location, and a concise **observation** plus **reviewer** for each manual test T01–T12. Set the six confirmation fields to `true` **only after direct authorized observation**; never tick a box because code or CI passed. Never paste credentials or sensitive personal details into the JSON.

```bash
python3 -B scripts/ers-byte356s1-onboarding.py check \
  --record "$HOME/Downloads/ers-support-onboarding-evidence.json"
```

Expected until all work is complete: one or more `BLOCKED` findings, exit `1`. If complete: `REVIEW READY`, exit `0` **only as a format/completeness result**, followed by `NOT INDEPENDENTLY VERIFIED` and `NOT PRODUCTION AUTHORIZATION`. A human must review genuine screen results, identity custody and role scope. This script does **not** query ERS, write a database, authenticate, grant permissions, approve Production or independently verify reported statements.

**PASS:** actual separately observed trainee login, only a synthetic training Tenant, permitted `TENANT_VIEWER` access, learning exercises, individual password change, and reviewed evidence. **FAIL:** unintended customer/Production access, Tenant boundary leak, unauthorized mutation, or secrets in evidence. **BLOCKED:** missing Tenant administrator, personal-data consent, deployed revision, safe credential handoff, documentation, or training material.

## F. Rehearsal, cleanup and operational boundaries

Work through T01–T12 with the trainee. Use screen sharing for supervised business operations without sharing trainer credentials. The trainee's initial `TENANT_VIEWER` identity must remain read-only. An authorized instructor may use a **separate** training Tenant operator identity for write demonstrations. Granting extra roles to the trainee is a **separate** approved exercise with exact Tenant and explicit revoke afterward; do not assume all features are available to a read-only Viewer.

Cleanup after a session: sign out both browser identities, close any open forms without saving, retain approved synthetic records and the individual's training account for future training, confirm no temporary delegated role remained, and preserve private evidence. No containers, database migrations, backups, reset operations or services are created by this byte; there is no Docker teardown for the new offline checker. If other tests created containers, stop/remove **only their recorded container IDs**, verify affected ports were released, and do not stop unrelated infrastructure.

When support work begins in Production, **35.6S.2 must separately specify and validate** time-limited Tenant Support Access Leases for an appropriate non-global support identity, auditing, approvals, privacy, and escalation. Nothing in 35.6S.1 grants it. Also, TST/Production 35.5, 35.6 and 35.7 gates remain unchanged.

## Glossary Impact

**Customer Support Specialist / Especialista de Suporte:** operational function, **not** an existing ERS authorization Role. **Training Tenant / Entidade de Treinamento:** approved non-Production Tenant containing only synthetic business data, **not** a new Tenant type. **Training Coordinator / Coordenador(a) de Treinamento:** operator responsibility, not a Role Grant. Existing domain meanings for Pessoa, Vínculo, Ator, Jornada, Conta Corrente, Entidade and Recibo are unchanged.
