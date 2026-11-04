# Bite 35.1 — Launch Baseline and Scope Freeze — Manual Acceptance

**Operator:** ERS developer. **Environment/context:** LOCAL Mac Terminal, ERS repository root, no ERS browser login, no credentials. **Starting branch:** `1032-byte---351-launch-baseline-and-scope-freezeselect-stable-code-identify-deferred-work-establish-the-release-baseline`. **Source SHA:** `9ecd5b075d08ec19c1f368690e95bc621b984fb1` (the parent baseline, not the SHA after committing 35.1). **No Test/Production mutation is permitted.**

Record for every test: exact current HEAD SHA, UTC execution date/time, operator, command exit status, observed output, PASS/FAIL/BLOCKED, and relevant CI run URL. Do not record credentials. Tests are deliberately short: 35.1 freezes scope, it does not rehearse or authorize Production.

## B35.1-01 — Revision and branch ancestry (LOCAL Terminal)

1. Open Terminal on the Mac. `cd` to the root of the ERS repository.
2. Execute:

   ```bash
   git fetch origin
   git branch --show-current
   git rev-parse HEAD
   git status --short
   git merge-base --is-ancestor 9ecd5b075d08ec19c1f368690e95bc621b984fb1 HEAD
   echo "ANCESTOR_EXIT=$?"
   ```

3. **Expected:** the current branch is exactly the 1032 branch above; the SHA reported by `git rev-parse HEAD` is the newly committed 35.1 revision; `git status --short` prints no lines; `ANCESTOR_EXIT=0`. **STOP/BLOCKED** if ancestry fails, current checkout is wrong, or state is dirty. If Git reports an unknown baseline commit, fetch the relevant history rather than assuming ancestry.
4. Record both the starting SHA and committed 35.1 HEAD. No deployed change occurs.

## B35.1-02 — Verify scope manifest and negative cases (LOCAL Terminal)

1. Execute from repository root:

   ```bash
   make byte351-baseline-check
   python3 -B scripts/ers-byte351-baseline-check.py --git-check --require-clean
   ```

2. **Expected:** the first target passes the manifest and its negative regressions; the second prints `PASS: Bite 35.1 scope frozen` and `NOT VERIFIED` for deployed operations, with exit code 0. **FAIL:** a different required sub-bite, missing deferred item, unsupported claimed acceptance, failing test, or missing baseline ancestor. The checker is read-only and cannot prove real backup security.
3. Record output and exact SHA. No temporary files or Docker containers are created by these commands.

## B35.1-03 — Compare current Development/Test tracked content (LOCAL Terminal)

1. Execute:

   ```bash
   git fetch origin
   git rev-parse origin/development
   git rev-parse origin/test
   git diff --quiet origin/development origin/test
   echo "TREE_COMPARISON_EXIT=$?"
   ```

2. **Expected for the previously observed baseline:** `TREE_COMPARISON_EXIT=0`, although commit SHAs may differ. If it is nonzero today, record **BLOCKED — branches diverged since recorded observation**; do not rewrite history to imply they always matched. Record the actual two commit SHAs and current exit status. This test does not overwrite Test or perform a promotion.

## B35.1-04 — Review scope and deferrals (LOCAL, repository documentation)

1. Open `docs/bite-35/launch-plan.md` with your normal editor and `docs/bite-35/launch-baseline.json` in a second tab.
2. Confirm all seven rows of 35.1–35.7 match the agreed November 2 launch plan; note the original 34.1/34.3/34.2 mappings; verify the Actual Sector/Location compensation statement, 1Password-only custody, signed Opening Balance Adjustment requirement, and distinction between Functional and Operational training.
3. Confirm 34.4, 34.5, 33.6.6+, 33.6.8E/F are **deferred**, not shown as implemented; no new S3 policy, bucket or credentials are created.
4. Confirm all six safety gates are listed and none is marked passed without evidence. **PASS** only if the records match the decisions. **FAIL** if planned work is mislabeled implemented or a deferred item is made an implicit launch prerequisite.

## B35.1-05 — CI and cleanup (LOCAL Terminal and GitHub UI)

1. After committing 35.1, open GitHub → repository → Actions, locate the CI run for the **exact** `git rev-parse HEAD` revision on the 1032 branch, and review the `Bite 35.1 launch baseline and scope freeze` step as well as the existing jobs. Record CI run URL, SHA, and result. Prior-SHA green CI does not count.
2. From LOCAL Terminal, execute:

   ```bash
   git status --short
   docker ps -a --format '{{.ID}} {{.Names}}' | grep -E 'ers.*(byte351|bite35)' || true
   lsof -nP -iTCP:8080 -sTCP:LISTEN || true
   ```

3. **Expected:** clean working tree, no test-created 35.1 Docker containers, and port 8080 is free or has a pre-existing documented owner. These 35.1 tests create **no** Docker containers; do not stop unrelated containers. If a container is definitely identified as test-created by a separate 35.1 attempt, stop and remove **only that recorded container ID**, then repeat inspection. **PASS** only if the matching-sha CI and cleanup inspection succeed; otherwise record **BLOCKED**.

## Acceptance decision

**Bite 35.1 PASS:** B35.1-01 through -05 are complete with recorded evidence. This approves the **planning and source baseline only**, not Production deployment. Launch functionality, seed data, off-host restore and security remain pending for their designated sub-bites.

---

# Byte 35.2 — Brazilian Portuguese Completion — Revised Manual Acceptance

**Revision scope:** correct the identity and fixture prerequisites in the original B35.2-01 through B35.2-05 suite. **Source branch:** `1035-byte---352-brazilian-portuguese-completion`; **source HEAD inspected:** `d995304998faf99fc07fd4438aa5065d54e741db`. **Environment for execution:** LOCAL only. Do not execute this suite against Development, Test, or Production. The currently committed HEAD must be recorded when tests are performed; it may differ after this documentation revision is committed.

This suite distinguishes **verified code-defined fixture names** from **actually verified browser credentials**. The email addresses below are from `backend/cmd/provision-e2e-admin/tenant_fixtures.go`; the repository does not reveal or guarantee working passwords in any particular database. No invented password is supplied. Do not use a Global Application Administrator as a substitute for a Tenant Administrator. Do not modify any actual customer financial record.

## Identity and fixture contract — execute before B35.2-01

| ID | Role/context | Exact username | Credential source and verification |
| --- | --- | --- | --- |
| APP-LOCAL | Application Administrator; **Global administration** | `e2e-admin-local@enterpriseremotesystems.com` | 1Password → `ers-development` → `ERS LOCAL Application Administrator`; browser login confirmed by operator, repeat before suite |
| TENANT-A | Tenant Administrator; `E2E Authorization Admin Boundary` (`E2EAUTHZADMIN`) | `e2e-authz-admin-tenant-admin@example.com` | The LOCAL E2E provisioning command sets this account's password from the **password supplied to that provisioning run**; authenticate in browser before treating as ready; no pre-existing working credential is assumed |
| TENANT-B | Tenant Administrator; `E2E Operational Isolation` (`E2EISOLATION`) | `e2e-isolation-tenant-admin@example.com` | Same LOCAL E2E provisioning credential rule; independently verify browser login and selected Tenant |
| MULTI | Person across two E2E Tenants; `E2E Multi Tenant A/B` | `e2e-multi-tenant-person@example.com` | Code-defined fixture; password from last E2E provisioning, but **not accepted** until independent browser verification |
| EARNINGS | `EARNINGS_OPERATOR` in disposable test Tenant | **Not established by the general provisioning fixture contract** | BLOCKED until a named account, grant, password custody and browser sign-in are recorded |
| EXPENSES | `EXPENSES_OPERATOR` in disposable test Tenant | **Not established by the general provisioning fixture contract** | BLOCKED until a named account, grant, password custody and browser sign-in are recorded |
| COLLAB | Collaborator/Person with an active Journey in disposable Tenant | **Not established as a general-purpose fixture for this suite** | BLOCKED until the account, Journey, credential and permissions are independently verified |

**Security and credential handling:** A single E2E provisioning password is used by the current provisioning code for multiple test fixture accounts; that is an existing code behavior, not a recommended human-password design. Store it only in an access-controlled, appropriately labeled 1Password test-fixture item; do not paste it into a Markdown file, Git, terminal command history, tickets, or ChatGPT. Do **not** assume the Application Administrator's currently working password still matches the passwords of TENANT-A/B: a later administrator-only change or separate provisioning might have changed one without the others. Do not rotate working credentials just to make this manual suite pass.

### Prerequisite P-01 — Verify LOCAL runtime (operator, Terminal on Mac)

1. In Terminal A at repository root, run `git branch --show-current`, `git rev-parse HEAD`, `git status --short`. Require the branch named above and a clean committed checkout. Record the actual SHA.
2. In Terminal A, run `lsof -nP -iTCP:8080 -sTCP:LISTEN`. If the intended LOCAL backend is not running, start it in a separate terminal with `ERS_RESET_DATABASE=false ERS_PROVISION_E2E_ADMIN=false make local-backend`. Do not start a second listener or use `ERS_RESET_DATABASE=true`.
3. If the LOCAL frontend is not running, open another terminal and run `make local-frontend`. Open the displayed LOCAL address in a **normal Microsoft Edge tab** (normally `http://localhost:5173`). **PASS:** the sign-in page opens and backend startup identifies `APP_ENV=local` and the expected LOCAL database. **STOP:** database/path/environment differs.
4. These steps do not provision accounts, apply a migration intentionally, or reset the database. If a backend is already running, do not restart it unnecessarily.

### Prerequisite P-02 — Verify every identity used by this run (UI-first)

1. In a normal Edge tab, sign in as **APP-LOCAL** with its 1Password credential. Confirm **Global administration**; record PASS/FAIL. Sign out using the ERS interface.
2. Sign in as **TENANT-A** using the credential held for the *LOCAL E2E Tenant fixtures*. Choose its Tenant if prompted. Confirm selected Tenant name **E2E Authorization Admin Boundary**, then confirm the application displays `Preços do ouro`, `Lista de preços`, and `Configurações da conta` after selecting Português (Brasil). Record a separate PASS/FAIL for login, Tenant selection, and each menu item. **Do not continue financial tests as APP-LOCAL.** Sign out.
3. Sign in as **TENANT-B** using its test-fixture credential. Confirm Tenant **E2E Operational Isolation**. Sign out.
4. If a named EARNINGS, EXPENSES or COLLAB identity is used later, record its exact login (never password), source in 1Password, Tenant, role, permissions, and browser sign-in before starting those steps. A missing identity is **BLOCKED — prerequisite fixture absent**, not PASS, and is not evidence of a localization defect.
5. If TENANT-A/B cannot sign in: **STOP their tests.** Do not guess credentials, change role grants, rotate passwords, or reset a database. Resolve the fixture prerequisite as a separate controlled setup task with a database backup and explicit fixture effects.

### Prerequisite P-03 — Record test data and protect shared data

1. In TENANT-A's UI, inspect Gold Prices, Price List, Account Settings, and Reference Data. Record whether relevant records already exist; do not alter existing prices or policy settings merely to inspect translations.
2. Use read-only and validation-only actions as the default. A create/edit action is permitted only for an **explicitly identified disposable record** created for this suite in LOCAL with a documented way to clean it up. If no such record exists, mark the mutation check **BLOCKED**, not PASS.
3. This revision intentionally introduces **no** new standard Tenant, account, default password, financial ledger entry, or seed mutation. Existing E2E fixtures are available in the software, but their real deployed state remains subject to P-02 verification.

## B35.2-01 — Source and locale integrity (LOCAL Terminal)

1. From repository root, verify the current branch, committed HEAD, clean working tree, and ancestor `cb55d6fc1dc1fff0258742b394f8214f7ba97fd8` by running `git merge-base --is-ancestor cb55d6fc1dc1fff0258742b394f8214f7ba97fd8 HEAD; echo $?`. Expected result: `0`.
2. Run `make byte352-i18n-check`, then `make local-check`. Record each exit status and the exact HEAD SHA. **PASS:** both return 0, language keys/interpolations and static-literal check pass. **FAIL:** any test fails. Do not substitute earlier results from another SHA.

## B35.2-02 — Portuguese financial administration (LOCAL, UI)

**Identities:** APP-LOCAL only for locale contract in Step 1; **TENANT-A for Steps 2–4**. Require P-01, P-02, P-03 PASS. Do not confuse Global administration with Tenant financial administration.

1. **APP-LOCAL:** Open normal Edge tab, sign in with verified credential. Use the Language selector to select **Português (Brasil)**. Refresh the tab. Expected: selection remains Portuguese. For this locale-contract check only, DevTools Console may evaluate `document.documentElement.lang`; expected exactly `"pt-BR"`. Sign out. Record PASS/FAIL.
2. **TENANT-A:** Sign in and ensure selected Tenant is **E2E Authorization Admin Boundary**. If needed, select Português (Brasil). In the normal app navigation, select **Preços do ouro**. Read the heading, explanatory text, links, input labels, buttons, empty state (if present), history headings, statuses and BRL/date formatting. **PASS:** all visible customer-facing text is Portuguese or a legitimate fixed identifier; no other Tenant data appears. Do **not** create or edit a gold price.
3. Still **TENANT-A**, select **Lista de preços** through the application navigation. Check headings, category filter, inactive-items checkbox, table headers, buttons, create/edit form labels and empty-filter guidance. Open a form without saving, observe any safe required-field validation and cancel. **PASS:** Portuguese labels and messages and no mutation. Optional create/edit verification is **BLOCKED** unless a disposable LOCAL record and cleanup are identified ahead of time.
4. Still **TENANT-A**, select **Configurações da conta** through navigation. Check description, warning, approval-policy status and action text. **Do not change policy** solely for translation review. **PASS:** relevant text is Portuguese; no mutation. Configuration-change success-message coverage is **BLOCKED** without isolated disposable setup.
5. Sign out. Record individual results for Steps 1–4. If the Gold Prices, Price List, or Account Settings links are absent for TENANT-A, record the missing link and **BLOCKED — permission/fixture prerequisite**, not a translation failure. Never grant APP-LOCAL Tenant authority to work around the missing link.

## B35.2-03 — Portuguese global and Tenant administration (LOCAL, UI)

**Identities:** APP-LOCAL for Steps 1–3, TENANT-A for Step 4. P-02 must pass for each.

1. **APP-LOCAL**, Global administration, Portuguese: through visible navigation select **Autorização**. Verify headings, Actor/Role terminology, filters, explanatory text, and empty states. Inspect only; do not grant/revoke roles.
2. Through visible navigation select **Logs de auditoria**. Verify heading, filter labels and messages, entries (if any), and empty state (if any). No audit mutation.
3. Through visible navigation select **Acesso de suporte**. Verify the Request and Lease history sections, Tenant combobox, permission descriptions, actions and warnings. Open/close cards and filter without submitting a lease. Sign out.
4. **TENANT-A:** sign in, select E2E Authorization Admin Boundary, confirm Portuguese; through visible navigation open **Autorização** and **Dados de referência**. Check roles, filter prompts, labels, and read-only list content. Do not modify reference data or grants. Sign out.
5. **PASS:** checked text is Portuguese and each identity remains within its authorized scope. **FAIL:** untranslated visible customer text, cross-Tenant leakage, or authorization bypass. **BLOCKED:** missing fixture permission or page. Record the exact role and page.

## B35.2-04 — English switch, persistence and validation (LOCAL, UI)

**Identity:** verified TENANT-A, selected E2E Authorization Admin Boundary. Use **two normal Edge tabs in the same browser profile**; not an InPrivate + normal tab pair.

1. Sign in; select English (United States). Visit **Gold prices**, **Price list**, and **Authorization** through their visible navigation links. Expected: English copy with no translation keys displayed.
2. Select Português (Brasil), refresh, revisit **Preços do ouro** and **Lista de preços**; expected Portuguese remains and `<html lang>` is `pt-BR` (DevTools only if necessary).
3. Open a second normal tab for the same LOCAL site. In Tab B switch to English. Return focus to Tab A and verify the locale synchronizes; repeat switching to Portuguese and refocusing. **PASS:** both tabs reflect the selected locale according to the persisted locale contract.
4. Open a form available to TENANT-A, leave a required field empty (or supply an invalid value) and attempt to submit **only if this is guaranteed to be rejected before a write**. Verify the field validation text in Portuguese, then cancel. If the form might save, **do not submit** and mark this validation subcase BLOCKED.
5. Sign out in both tabs. **FAIL:** raw I18N keys, untranslated customer-facing messages, broken storage synchronization, or clipped text.

## B35.2-05 — Customer-facing workflow language sweep and closure

**Identity schedule (mandatory):** APP-LOCAL → TENANT-A → TENANT-B → EARNINGS → EXPENSES → COLLAB. **Do not substitute one identity for another.** For roles without a verified fixture, record BLOCKED and the exact screens not executed.

1. **APP-LOCAL / Global administration:** revisit global Tenants, People, Authentication, Authorization, Audit Logs and Support Access from visible navigation. Note each customer-facing untranslated message, screen and state. Sign out.
2. **TENANT-A / E2E Authorization Admin Boundary:** inspect Tenant People, Collaborators, Journeys, Work Periods/planning, Gold Prices, Price List, Reference Data, Account Settings and authorized financial history through visible navigation. For each available page inspect one ordinary and one available empty/validation state, without editing financial records. Sign out.
3. **TENANT-B / E2E Operational Isolation:** inspect corresponding permitted pages and verify Tenant names and data remain scoped to TENANT-B. Sign out.
4. **EARNINGS / designated disposable Tenant:** after independent credential/role verification, inspect assignment, work recording and earnings pages; only run mutations when explicitly disposable and safe. If EARNINGS fixture absent, record BLOCKED for these screens.
5. **EXPENSES / designated disposable Tenant:** after independent credential/role verification, inspect expense forms, history and error/validation copy. If missing, record BLOCKED.
6. **COLLAB / designated disposable Tenant:** after independent credential, Person and Journey verification, inspect self-service People, Journey, Current Account, receipts and password-change navigation. If missing, record BLOCKED.
7. For each screen/state record locale, identity, Tenant, navigation path, observed copy (quote any untranslated English), result and screenshot reference if appropriate. Unexpected English customer-facing text is **FAIL**, not waived by the static checker. Normal technical codes (`BRL`, `CPF`, `GOLD_GRAM`) are not automatically localization failures.
8. From repository root, record `git rev-parse HEAD`, matching GitHub CI run URL and status, and `git status --short`; clean tree expected. Run `docker ps -a --format '{{.ID}} {{.Names}}'` and `lsof -nP -iTCP:8080 -sTCP:LISTEN`. This suite creates no Docker containers. Do not remove unrelated containers. If you started backend/frontend processes for this suite, stop **only those processes in their original Terminals** using Ctrl+C, then verify 8080 is free. If a pre-existing backend was used, leave it running and record that fact.

**Bite 35.2 full PASS:** B35.2-01 through -05, including each role-dependent subsection, are completed with evidence and matching green CI for the accepted SHA. **BLOCKED:** unverified/missing role accounts, permissions, safe test records or CI. **FAIL:** reproducible untranslated text, unauthorized access or regressions. Partial financial/global read-only review is valuable evidence but **is not full Bite 35.2 acceptance**.

## Standard non-Production fixture policy — proposal for a separate bounded implementation

The current source already provisions deterministic Tenants `E2EAUTHZADMIN` and `E2EISOLATION` (plus multi-Tenant and support-lease fixtures) when `provision-e2e-admin` is authorized to run. These are valuable technical fixtures, **not yet a documented complete manual-testing Tenant pair across LOCAL, Development and Test**.

For the remainder of Bite 35, define **two standard, dedicated synthetic testing Tenants per non-Production environment**, with clear names (e.g., `ERS Manual Test A` and `ERS Manual Test B`), stable non-overlapping identifiers, reproducible synthetic People/Journeys, named test accounts for Tenant Administrator, Earnings Operator, Expenses Operator, and Collaborator, and a cross-Tenant Person case. Keep environment-specific credentials in `ers-development` or `ers-test` 1Password vaults and reconcile through approved non-Production deployment secrets; never reuse Production credentials. Protect Tenant Admin cardinality and cross-Tenant privacy invariants. These are **requirements for a future fixture implementation**, not a claim that the accounts already exist.

A fixture implementation must be idempotent, restricted to LOCAL/Development/Test, safely segregated from customer records, audited when it changes authorization, and tested for no Production execution, no reset/data loss, no cross-Tenant leakage, no stale sessions after password rotation, and exact cleanup. Never use a routine deployment to reset valuable Test data without explicit approval. Add explicit PASS/FAIL credential verification for each identity *before* relying on it in a manual suite.
