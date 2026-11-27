# Byte 35.7 — Audited Authentication Account login correction

**Baseline:** branch `1121-t09-onboarding-development-correction`, committed HEAD SHA `1a0a7b7a8e162c0bc5982476a263566235cde8c7`.

## Purpose and invariant

A GLOBAL Application Administrator can correct an existing Authentication Account login without creating another Account, Person, Membership, AccountActor, Tenant Actor, Role Grant, or Journey. The login and the global Person contact email are separate. Updating a Person contact email is explicitly optional and is permitted only if that Person currently has the **old login as their contact email**. A distinct existing Person contact email is never silently overwritten. No login may match an existing Account login or another global Person's contact email (case-insensitive).

Operation: **Administration → Authentication → Change login** on the selected Account. Requires `authz.manage` in actual GLOBAL Administration context; ordinary Tenant Administrators and Application Administrators operating under a Tenant Support Access Lease cannot use this action. An administrator cannot change their own Account login through this workflow. Require a nonblank, correctly formed email, confirmation of the new email, and a 10–500-character change reason. The server independently validates the new login and reason and uses an `expectedLogin` precondition to detect stale account lists.

The account login update, optional Person contact email update, existing-session revocation, outstanding password-reset-token invalidation, and mandatory authorization audit (`authentication.accounts.login.change`, with old/new login, reason and Person-email decision) occur in a **single database transaction**. A failed audit write rolls back *all* changes. The user's password hash and first-password-change flag are preserved. A fresh sign-in uses the new login and existing valid password. The operation intentionally does **not** send an email or change passwords.

**Security:** This is a deployed, authenticated administrative capability, not a database repair command. Never use direct SQL, E2E provisioning scripts, or direct deployed server edits to correct an Account in Training or Production. Do not copy passwords, reset tokens, Person private fields or cookie values into evidence. The auditor should record the target Account ID, both login values, the reason, the operation and correlation ID (not the session secret).

## Patch and automated checks (LOCAL)

From the clean branch at the SHA above, apply the delivered patch following the established `~/Downloads` and `git apply --check` SOP. Do **not** reset or replace an existing LOCAL database. Automated unit tests use their own temporary test databases.

```bash
cd backend
go test ./internal/authentication ./internal/http/routes
cd ..

cd frontend
npm ci
npm run i18n:check
npm run test:run -- src/features/auth/AuthenticationAdminPage.test.ts
npm run check
cd ..

make local-check
```

**PASS:** Every command exits 0; the backend tests cover successful login correction, unchanged Account/Person/Actor/Membership relationships, old login rejection, new login success, session revocation, reset-token invalidation, unique and stale login rejections, no unintended Person-email update, and atomic rollback after an injected audit failure. The frontend tests and exact `en-US`/`pt-BR` locale parity pass. **FAIL:** any command fails. Do not merge or promote with failing checks.

If local-check starts disposable Docker containers, record their actual names/IDs beforehand, remove **only those test-created containers** even if a check fails, and verify any test-reserved port (notably 8080) is released by the test. Do not stop unrelated running services or databases.

## Manual LOCAL acceptance — UI first

### LC-01 — Successful typo correction, with Person email explicitly selected

**Environment:** LOCAL with normal running ERS. **Identities:** (A) an authorized LOCAL GLOBAL Application Administrator; (B) a different ordinary LOCAL Person/Account belonging to an approved non-Production Tenant. **Context:** A chooses Global Administration (`*`), not Tenant Support Access or a Tenant workspace. **Prerequisite:** the Account's current login and its bound Person's contact email both contain an approved synthetic typo, with a unique corrected email available; B knows their existing password (store only in 1Password).

1. As **B**, sign in with the original login. Confirm that B can view the expected authorized Tenant context and ordinary Person data. Leave the session open in a separate browser profile.
2. As **A**, sign in in another browser profile. Select **Global Administration → Authentication**. Find B by the *original* login and verify the Account ID and bound global Person displayed.
3. Select **Change login** for B's Account. Confirm the original login is shown, and that the option to update the Person contact email is available because it currently matches the old login.
4. Enter the unique corrected login twice, exactly. Enter a meaningful audit reason such as `Correction of training Account login typo`. Select **Also correct this Person's contact email**. Click **Save new login** once.
5. **Expected:** success message names the corrected login. The same Account ID, global Person ID, all Actor bindings, roles, and Memberships are still present. The Person contact email now matches the corrected login. Reopen the Account to confirm.
6. Return to **B**'s still-open browser session and try a protected page operation or refresh a protected page. **Expected:** the old session cannot be used; B must authenticate again. Sign in with the old login and original password — **rejected**. Sign in with the corrected login and the same password — **accepted**, with original Tenant access and mandatory password-change state retained if previously applicable.
7. As **A**, open **Administration → Audit Logs** and locate `authentication.accounts.login.change` for the Account ID. Verify actor attribution, old/new login, reason, and whether Person contact email was updated. Do not capture secrets.

**PASS:** all expectations in steps 5–7. **FAIL:** a duplicate identity is created, original login still authenticates, active old session remains usable, Account/Person/Actor/Membership/role identities change, wrong contact email is modified, or audit entry is absent. **BLOCKED:** no approved isolated identities or no legitimate authorized admin; do not manufacture personal identifiers or modify TRN/Production to make a test pass.

### LC-02 — Validation and authorization, no writes (visible feedback required)

**Identity/context:** A / LOCAL / GLOBAL unless otherwise stated. Use an Account unrelated to A and leave it unchanged in these negative checks.

1. Open **Change login**. Confirm the empty form displays a visible explanation below each required field (new login, confirmation, reason), explaining why **Save new login** is disabled. Enter two different new-login/confirmation values. **Expected:** the confirmation field visibly says the emails do not match, and Save remains disabled. Correct the confirmation. **Expected:** the mismatch message disappears.
2. Enter the Account's existing login as its new login. **Expected:** an inline message says the new login must differ from the existing login. Enter an invalid email address. **Expected:** an inline invalid-email explanation. Enter a reason shorter than 10 bytes or only whitespace. **Expected:** the reason field explains its minimum length. Correct the input and verify that messages disappear as each field becomes valid. **Save** must enable only when all fields are acceptable.
3. With otherwise valid fields, enter a login already used by another Account or another Person's contact email and submit. **Expected:** the server rejects it; a clear error message appears **beside the Change login form**, not only at the top of the Administration page. Correct the email to verify that the old error clears. The original Account login, Person contact email, and canonical bindings must remain unchanged.
4. In a separate browser profile, sign in as a **Tenant Administrator**, select that Tenant, and confirm that GLOBAL Authentication Accounts administration/change-login is unavailable. This role restriction is not a form validation error; it is a protected navigation/authorization boundary. The backend route must reject Tenant-scoped requests (automated handler test).
5. Sign back in as A / GLOBAL. Locate A's **own** Account. **Expected:** its Change login action is disabled **and the screen visibly states** why the administrator cannot change their own login. Do not attempt to bypass the restriction.

**PASS:** all invalid, duplicate, unauthorized and self-change attempts are blocked **with the described visible feedback**, and no Account login, Person email, Actor binding, Membership, or Role Grant is modified. **FAIL:** an invalid operation succeeds, or the button is disabled / server rejects a request **without a visible, specific explanation**. Automated tests cover stale-view and audit-write rollback cases. Never edit a working DB directly.

### LC-03 — Two email fields remain independent

**Identity/context:** A / LOCAL / GLOBAL. **Prerequisite:** use another separately approved synthetic Person/Account whose Person email matches its current Account login. Do not reuse the already corrected LC-01 identity.

1. Open the Account's **Change login** form. Enter and confirm a new unique login and a reason; **leave the Person email checkbox unchecked**.
2. Save. Confirm the Account login has changed and its Person contact email is still the original value.
3. In the authorized Tenant People workspace as the correct Tenant Administrator, confirm the Person remains unchanged and no second Person was created.

**PASS:** login and contact email remain independently managed, with no identity duplication. **FAIL:** Person email changes without explicit approval.

## TRN correction after approved promotion

Only after the code has passed LOCAL and CI and been promoted **Development → Test → Training** under the applicable release and backup/restore gates:

1. **TRN / Global Application Administrator / GLOBAL context:** open `https://trn.enterpriseremotesystems.com`, navigate to **Administration → Authentication**, and find the existing `raining.csat.a@example.com` Account. Verify the global Person and Account ID before touching anything.
2. Confirm the proposed `training.csat.a@example.com` does not belong to another Account/Person; the backend enforces this again at save time.
3. Select **Change login**; enter `training.csat.a@example.com` twice and an accurate reason. **Only if the bound Person contact email still equals `raining.csat.a@example.com`**, explicitly check the option to correct the Person contact email too.
4. Save once, verify the corrected Account login, unchanged Account ID/Person binding, and transaction audit. If it rejects a stale or conflicting value, **STOP**; do not recreate the Account or directly edit TRN DB.
5. **Different human / trainee / own TRN browser profile:** sign out of existing session (or confirm revoked session), sign in using `training.csat.a@example.com` and the existing password held in 1Password; verify the expected Tenant context and grants, then verify the old login is rejected.
6. Record the evidence and T09 outcome. Revalidation of existing sessions, password-change status, and authorized Tenant pages is required.

**PASS:** unique corrected login; old login rejected; Person/Account/Actors/Memberships/roles/Journey preserved; auditable operation. **BLOCKED:** no approved change, missing independent trainee, or missing release/Training approval.

## Glossary impact

No new canonical identity entity. Clarify **Person Email** as global Person contact data and **Authentication Account Login** as a globally unique, application-authentication identifier. Explicitly document that changing either does **not** implicitly change the other, and that an audited GLOBAL Application Administrator login correction does not create/replace a Person, Account, Actor, or Membership, nor grant/revoke Tenant Roles. No change to **Tenant Support Access Lease** or **AccountActor** definitions.
