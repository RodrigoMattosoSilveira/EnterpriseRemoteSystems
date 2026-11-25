# Bite 35.7 / T09 — First Tenant Administrator onboarding (UI-first)

**Patch baseline:** `1096-356s1a-trn-environment-and-deployment` / `979bb15db694552dc607aca1c0adf254cc82aee5` (committed HEAD ZIP).  **Scope:** exactly the missing initial candidate creation step. Not a Tenant data import, E2E bootstrap, database repair, or change to Global Application Administrator identity.

## Purpose and boundary

A newly created Tenant has `ACTIVE_NO_TENANT_ADMIN`. The standard **Assign Tenant Administrator** selector correctly requires a pre-existing canonical Account-bound Tenant Actor, but a new Tenant has none and its own People workflow requires a Tenant Administrator. The bounded control-plane action **Create first Tenant Administrator candidate** resolves this bootstrap dependency.

The action is available only to an authenticated **GLOBAL Application Administrator** with existing Tenant-management permission, only for an active Tenant having **zero active Tenant Administrator assignments and zero Account-bound Tenant Actor candidates**. It creates **one new human** with **one global Person**, **one ordinary Authentication Account**, **one ACTIVE Membership in precisely this Tenant**, **one Tenant Actor and its canonical AccountActor binding**, and a transactional audit row. The new Account requires a first-password change. The action **does not grant TENANT_ADMIN or any other Role**. The separate existing **Assign Tenant Administrator** action is still required and applies existing cardinality (maximum two, two distinct Persons) and cross-Tenant Role restrictions.

The operation fails without writing partial identity records if any account/login/Person identifier or Actor key already exists globally, if the Tenant already has a candidate or assignment, if the Tenant is inactive, or if Person/password validation fails. Existing Persons may not be duplicated; this narrowly scoped create-only operation does not provide Person reuse or expose other Tenants' identity data. GLOBAL Application Administrator Accounts are never attached to a Person, Membership or Tenant Actor.

## Before LOCAL testing

1. **Environment:** LOCAL development, with its normal supported application startup and existing LOCAL database. Do not delete, reset, replace or migrate a working LOCAL database merely for this test. Use an explicitly approved isolated test fixture if current LOCAL data must be preserved untouched.
2. **Identity:** `TRN_HUMAN_ADMIN_A` or `TRN_HUMAN_ADMIN_B` is the **GLOBAL Application Administrator** in Training; in LOCAL use the explicitly provisioned LOCAL GLOBAL Application Administrator. A *different actual human* will be the new Tenant Administrator; do not reuse either global administrator's Account or Actor.
3. **Authorization/data:** have the first Tenant Administrator's approved legal first and last names, nickname, valid CPF, RG, Brazilian mobile, unique login email and unique temporary password (12–72 UTF-8 bytes). These fields follow the existing Person domain. Do **not** create fabricated CPF/RG for an actual person, place customer data in Training, send credentials in chat, or commit any credential file. If identity-data processing is not approved for TRN, this exercise is **BLOCKED** until privacy-safe onboarding is approved.
4. **Scope:** only the already approved synthetic Training Tenant (for example `ERS_SUPPORT_TRAINING`, **if that is its actual code**) should be used. Search before creating a Tenant. Do not create a replacement for an existing one.

## Automated verification — Mac LOCAL repository

```bash
# Verify the exact baseline before applying the patch.
git branch --show-current
git rev-parse HEAD

# After applying the patch in ~/Downloads:
cd backend
go test ./internal/tenants
cd ..

cd frontend
npm ci
npm run i18n:check
npm run test:run -- src/features/tenants/TenantDetailPage.test.tsx
npm run check
cd ..

make local-check
```

**PASS:** all commands finish with exit code 0, the `TestInitialTenantAdminCandidate*` backend tests pass, frontend candidate-creation regression passes, and both locales have exact parity. **FAIL:** a test/command fails. Do not promote a failing change.

These automated tests create isolated temporary databases via their existing test framework, not via a Production or Training DB reset. Do not manually remove any volume. If a Docker-based test creates a specifically identified disposable container, ensure that same container is removed after the test and that it does not leave its test port occupied; do not stop unrelated infrastructure.

## Manual LOCAL acceptance (UI first)

### MT-01 — Create initial candidate, no privilege grant

1. **GLOBAL Application Administrator / LOCAL / GLOBAL context:** sign in to the LOCAL application. Confirm the current context is **Global Administration**, not any Tenant.
2. Open **Administration → Tenants**. Create or locate an approved **empty synthetic test Tenant**. Confirm it is active and shows **`ACTIVE_NO_TENANT_ADMIN`** and zero assigned Tenant Administrators. Record the exact Tenant ID and code. Do not delete a pre-existing Tenant.
3. Open **Administration → Tenants → [Tenant] → Tenant Administrators**. Confirm the candidate list contains no Actors. Select **Create first Tenant Administrator candidate**.
4. Enter the separately authorized new human's real, approved Person identifiers and new tenant Actor key; enter their unique login email and temporary password manually. Use a separate human from the GLOBAL administrator, with individual credential custody. Do not use an existing Person or Account.
5. Submit **Create candidate** once. Observe the completion message and the new candidate in **Select an eligible active actor**. Do **not** select **Assign Admin** yet.
6. Refresh the Tenant page. Confirm it still shows **`ACTIVE_NO_TENANT_ADMIN`** with zero Tenant Administrator grants, and the candidate remains selectable. Confirm the GLOBAL administrator remains in the GLOBAL context.

**PASS:** new eligible candidate exists as an Account-bound Actor; there is still zero `TENANT_ADMIN` authority until a separate assignment. **FAIL:** automatic role grant, duplicate global Person, a changed GLOBAL Account, missing candidate, or different Tenant data exposed. **BLOCKED:** no legitimate approved human identity information.

### MT-02 — Explicit assignment activates Tenant

1. **Same GLOBAL Administrator / LOCAL / Global Administration:** select the candidate created in MT-01 in the **Assign Tenant Administrator** selector.
2. Select **Assign Admin**, confirm the selected Actor/person, and verify the Tenant status updates to **`ACTIVE_READY`**, with **one active Tenant Administrator assignment**.
3. Sign out of the Global Administrator browser profile. In a **separate browser profile**, sign in as the newly enrolled **Tenant Administrator** with their own initial password.
4. On the mandatory first-password-change screen, manually enter the *current initial password*, then the new final password twice. Do not accept LastPass suggestions for the current password. Sign out and sign in again using the final password.
5. Confirm the operating context is the **exact synthetic Tenant**, not Global Administration or another Tenant. Confirm the new Tenant Administrator can access the permitted **People** workflow without an Application Administrator role.

**PASS:** one canonical tenant-scoped identity, one `TENANT_ADMIN` grant, `ACTIVE_READY`, correct independent login/first-password-change, and no GLOBAL admin privileges. **FAIL:** wrong scope, global Actor binding, inability to log in, or duplicate Person.

### MT-03 — Reject attempts outside the narrow boundary

1. **GLOBAL Administrator / LOCAL:** refresh the Tenant detail page after MT-02. Confirm **Create first Tenant Administrator candidate** is no longer offered. Never retry the create-only operation to add a second administrator; use the normal Tenant-admin assignment workflow for an already eligible Person.
2. Open an existing Tenant already containing a candidate or assignment; confirm the create-only control is absent.
3. **Tenant Administrator / separate browser / exact Tenant context:** confirm the GLOBAL administrative Tenant catalog and initial-candidate control are not available. A Tenant Administrator must use the normal Person/Membership/Authentication workflows for ongoing management.

**PASS:** create-only action is unavailable once a candidate or assignment exists, and Tenant Administrators have no access to it. **FAIL:** duplicate creation, permission escalation or bypass.

## Approved Training continuation

Only after LOCAL and CI tests pass and the revised Test candidate is promoted using the established approved Training deployment process:

1. Reopen **the existing synthetic Training Tenant**, not a replacement. Sign in with `TRN_HUMAN_ADMIN_A` or `TRN_HUMAN_ADMIN_B` in **GLOBAL** context; these remain Application Administrators only.
2. Follow MT-01 (new separately approved Tenant Administrator Person/Account/Actor), then MT-02 (explicit role assignment). The new Account is separate from the global T08 Accounts.
3. Record only nonsecret Tenant ID/code, Actor ID/key, Account ID, Membership ID, assigned Role and login PASS/FAIL; keep passwords and CPF/RG out of screenshots and evidence logs.
4. Continue T09 with the trainee Person/Membership/Authentication/`TENANT_VIEWER` process, using the now independently authenticated Tenant Administrator.

**Training PASS:** Tenant is `ACTIVE_READY`, the separate human has a canonical tenant-scoped Account/Actor/Membership and can authenticate, the two T08 global administrators still have only GLOBAL identities, and no E2E/reset/DB import was used. **BLOCKED:** no authorized distinct human, personal-data permission, or approved new deployment. T06–T08 acceptance results do not need repeating.

## Glossary impact

No new domain term and no redefinition of existing terms. **First Tenant Administrator candidate** is a restricted onboarding *operation*, not a new role or Actor type. Retain existing glossary definitions of global Person, Authentication Account, AccountActor, Person–Tenant Membership, Tenant Actor, Tenant Administrator, Application Administrator, and `ACTIVE_READY` without changes.
