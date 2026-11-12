# Bite 35.6 — Standard LOCAL Developer Test Entities

**Purpose:** Every engineer running ERS on their own machine gets the agreed, predictable LOCAL administrator, two testing Tenants, operators, collaborators, and cross-Tenant identities **with one supported installer**. The developer does not need to know fixture seeding order or write SQL. This is a LOCAL-only engineering utility; it does not satisfy actual independent-human 35.6 operational acceptance, and it never provisions deployed DEV, TST, or PRD.

**Preconditions:** On a checked-out ERS repository with Go 1.26.2, Python 3, `sqlite3`, and the established eleven distinct LOCAL passwords available from the approved `ers-development` 1Password vault. Backend must be stopped. Install with the normal LOCAL `backend/data/app.db`; any configured alternative database path causes a clear refusal. **Never use `ERS_RESET_DATABASE=true`** or copy another engineer's database.

## 1. Single supported installation command

Run from **your own** repository root (for example `~/EnterpriseRemoteSystems` on Linux or `~/projects/EnterpriseRemoteSystems` on macOS):

```bash
make local-fixtures-ensure
```

The installer itself:

1. Requires the explicit LOCAL environment; refuses a configured deployed/Test/Production environment, reset configuration, database symlinks, or a mismatched database path.
2. Stops if port 8080 is listening, and requires the operator to confirm all LOCAL backend processes are stopped (including any nonstandard port).
3. Automatically checks SQLite integrity and creates/verifies a permission-restricted backup of any **existing** LOCAL database under `backend/data/local-fixture-backups/`. The original database is verified with read-only access; the **completed, closed backup** is verified as an immutable read-only snapshot so a WAL-mode backup does not depend on new `-wal`/`-shm` sidecars when reopened on macOS. No manual backup or SQL command is required.
4. Applies the existing repository SQL migrations to that same database, creating `backend/data/app.db` only if it does not yet exist.
5. Prompts securely for the eleven **distinct** established 1Password passwords (hidden keyboard input). No credential file, command-line password, git commit, or environment-variable secret is needed.
6. Explicitly reconciles **only** the eleven deterministic fixture accounts, their role/Membership/Actor relations, and the two named test Tenants; it will update a fixture password that differs from 1Password and revoke old sessions/tokens. Unrelated Accounts and data are never reset or modified. Any conflicting/inactive/suspended fixture, wrong Tenant code, or canonical identity mismatch stops the transaction with a clear error.
7. Verifies all eleven passwords against the stored hashes and checks database integrity again. A failed identity transaction is rolled back; the pre-migration verified backup remains available for authorized recovery.

**Expected final output:**

```text
RESULT: LOCAL developer fixtures 11 PASS / 0 FAIL; two fixture Tenants + dedicated MULTI Tenants; passwords not displayed
PASS: LOCAL fixture installation and database integrity
```

Repeat the same command on another engineer's machine (or the same machine): it creates no duplicate fixtures and does **not** rehash unchanged passwords. Re-entering a different fixture password is an **explicit authorized reconciliation** (not something backend startup does implicitly).

## 2. Canonical LOCAL login roster

| Test identity | Login | Expected scope |
|---|---|---|
| APP-ADMIN | `e2e-admin-local@enterpriseremotesystems.com` | GLOBAL APPLICATION_ADMIN; **not** an ordinary Tenant Actor |
| TENANT-A | `e2e-authz-admin-tenant-admin@example.com` | Tenant A (`E2E Authorization Admin Boundary`), TENANT_ADMIN |
| TENANT-B | `e2e-isolation-tenant-admin@example.com` | Tenant B (`E2E Operational Isolation`), TENANT_ADMIN |
| EARNINGS-A | `e2e-authz-admin-earnings-operator@example.com` | Tenant A, EARNINGS_OPERATOR |
| EXPENSES-A | `e2e-authz-admin-expenses-operator@example.com` | Tenant A, EXPENSES_OPERATOR |
| EARNINGS-B | `e2e-isolation-earnings-operator@example.com` | Tenant B, EARNINGS_OPERATOR |
| EXPENSES-B | `e2e-isolation-expenses-operator@example.com` | Tenant B, EXPENSES_OPERATOR |
| COLLAB-A | `e2e-byte352-collaborator-a@example.com` | Tenant A, Collaborator |
| COLLAB-B | `e2e-byte352-collaborator-b@example.com` | Tenant B, Collaborator |
| SHARED | `e2e-byte352-shared@example.com` | One Person, two Tenant Memberships (A and B) |
| MULTI | `e2e-multi-tenant-person@example.com` | Existing dedicated MULTI Tenants `E2E Multi Tenant A` and `B` (preserves older isolation regression) |

**Why MULTI uses dedicated Tenants:** the existing E2E multi-Tenant identity intentionally has its own two deterministic Tenant IDs. Changing those memberships to the Byte 35.2 A/B Tenants would invalidate previously accepted authorization coverage, so this installer preserves them. Eleven logins, one Account per identity; SHARED/MULTI each have multiple Tenant Actors, not duplicate Accounts.

## 3. Start the normal LOCAL app

In Terminal A:

```bash
make local-backend
```

In Terminal B:

```bash
make local-frontend
```

**Expected:** The backend starts against `backend/data/app.db`. If the older `ERS_PROVISION_E2E_ADMIN=true` is still configured, normal LOCAL startup prints:

```text
LOCAL developer fixtures installed: skipping legacy E2E automatic provisioning to preserve 1Password credentials.
```

It does **not** change fixture passwords on startup. The direct legacy `provision-e2e-admin` LOCAL CLI also refuses to replace managed fixture credentials. Login with one of the LOCAL usernames above and its matching 1Password password. DEV and TST logins with `-dev`/`-tst` are a **separate proposed delivery**, not created here.

## 4. Automated regression (LOCAL + CI)

```bash
make local-fixtures-check
make local-check
```

`make local-fixtures-check` executes an isolated Go regression (fresh database, repeat-run idempotence/password-hash stability, legacy-seed reconciliation, identity scopes, rollback/preservation, explicit password reconciliation and environment rejection) plus offline Python tests (eleven-name roster, wrong database, non-LOCAL refusal and verified backup). No normal LOCAL or deployed database is touched by those automated tests. Full `make local-check` retains the established larger CI/Playwright suites.

**PASS:** checks exit `0`, matching-SHA GitHub CI is green, installer output includes the exact `11 PASS / 0 FAIL` line and browser login tests below succeed. **FAIL:** any nonzero exit, missing role/scope, failed login, unintended password rotation, or incorrect Tenant visibility. **BLOCKED:** required tooling/1Password credentials unavailable. Do not report a dry-run as a successful installed fixture.

## 5. Manual acceptance — use ordinary browser UI

**Context:** LOCAL development, the operator's own fixture database. Each test identity is a synthetic engineering fixture. Run these after a successful installation; use separate sessions/logouts rather than relying on residual Tenant selection.

1. **APP-ADMIN:** Sign in with its LOCAL credential; confirm GLOBAL Administration; no ordinary Tenant Actor appears; sign out. PASS only if GLOBAL-only.
2. **TENANT-A:** Sign in and select **E2E Authorization Admin Boundary**; confirm its Tenant Administration pages are accessible; sign out. Repeat as **TENANT-B**, selecting **E2E Operational Isolation**. Each must lack the other's delegated administration. PASS only for correct scope.
3. **EARNINGS-A** and **EARNINGS-B:** separately sign in, select their matching Tenants, check earnings functionality and absence of unintended Tenant Admin authority; sign out after each. PASS only for role and Tenant isolation.
4. **EXPENSES-A** and **EXPENSES-B:** separately sign in and check the matching Tenant's expenses screens without Tenant Admin authority. PASS only for correct role and Tenant isolation.
5. **COLLAB-A** and **COLLAB-B:** separately sign in and confirm only their Tenant's personal/collaborator workspace. PASS only for identity isolation.
6. **SHARED:** sign in once and confirm it can access two separate A/B Tenant contexts without creating another Account or leaking cross-Tenant private data. PASS only for both contexts and isolation.
7. **MULTI:** sign in and confirm the two **dedicated** multi-Tenant contexts, not the Byte 35.2 A/B contexts. PASS only for both dedicated Tenant contexts and no extra roles.
8. Restart the backend using the usual `make local-backend`. Repeat TENANT-A sign-in using the **same** 1Password password. PASS only if startup has not changed it.

Record test, environment, git SHA, identity, expected/observed UI result and PASS/FAIL. Never record passwords, tokens, or session cookies. No extra test containers are created by the new installer/regression. If running the **larger** Docker-based `local-check`, tear down only test-created containers and verify affected ports are released; do not stop unrelated services.

## 6. Error recovery

- `port 8080 is in use`: stop LOCAL backend and retry; no database change has occurred.
- `configured backend database differs`: reconcile the developer's LOCAL `backend/.env` / shell database path with `backend/data/app.db`. **Do not redirect this installer to another database**.
- `fixture Tenant ... inactive/conflicts`: do not deactivate/reactivate or reset it blindly; inspect the problem, preserve the automatic verified backup and request a scoped correction.
- `existing Application Administrator ... different login`: protect the existing GLOBAL identity; do not rebind it silently. Diagnose that LOCAL identity explicitly.
- `transaction rolled back`: identity data was not partly installed; record the exact non-secret error. SQL migrations occur before the Go transaction and may already be applied, so retain the verified backup for review.
- `SQLite operation failed` or backup verification failure: the fixture installer has not reached credential provisioning if the failure occurred during backup verification. Keep the existing LOCAL database and any backup file; check filesystem access and rerun only after resolving the error. Never reset the database as a workaround. The installer verifies completed backups in immutable read-only mode for compatibility with SQLite WAL-mode backups on macOS.
- `go` or `sqlite3` not installed: install required project tools using the team's platform package policy and retry. This mechanism does not modify the host toolchain.

**Security/Production acceptance:** These synthetic LOCAL Accounts do **not** satisfy Bite 35.6's requirement for two named real humans, independent 1Password custody or a real isolated Production restore. Those requirements remain separate, and this installer deliberately has no Production execution path.

**Glossary impact:** None. The fixture labels name testing identities and do not add domain entities or change authorization semantics.
