# Bite 28D — Authentication and Tenant UX

## Purpose

Bite 28D exposed the authentication and authorization foundations through the
browser. Bite 30E now makes the HTTP session explicitly Account-authenticated:
protected application routes require a verified Account session and an
explicitly selected tenant whose effective Actor is resolved from that
Account's persisted Actor bindings.

## User journey

1. Unauthenticated users are redirected to `/login` with the requested route
   preserved as `returnTo`.
2. Successful login restores the requested route. Accounts marked
   `mustChangePassword` are sent to `/password/change` first.
3. The application shell shows the current user's display name and normalized
   login.
4. `GET /api/v1/auth/tenant-options` returns Account-owned active tenant
   contexts. Ordinary Accounts receive only tenants backed by an active TENANT
   Actor and same-tenant ACTIVE Membership. A GLOBAL Application Administrator
   continues to receive every active tenant during the staged Bite 30H
   compatibility period, while remaining on the same APPLICATION Actor.
5. The tenant control opens an in-page dropdown rather than the browser or
   operating system's native floating picker. Users can progressively narrow
   the available tenants by typing any part of the tenant name, code, or ID,
   then select with the mouse or with Arrow keys and Enter.
6. Changing tenants updates `ers.auth.selectedTenantId`, selects the
   Account-owned Actor for that tenant, clears tenant-bound React Query state,
   and returns to the workspace landing page.
7. Logout revokes the server session, clears client authentication state, and
   returns to `/login`.

## Bite 30E session and Actor boundary

The browser session payload contains Account identity only; it no longer exposes
the legacy Actor/Person/Collaborator fields. The selected tenant plus Account ID
is resolved server-side to the exact effective Actor. Tenant options also carry
that Actor's record ID/scope (and Membership ID for ordinary TENANT Actors) so
the application shell can fail closed if the advertised context and
`/authz/current-actor` disagree.

Deactivating one tenant Actor is not a global logout when another Actor owned by
the same Account remains active. The unavailable tenant is removed from the
Account's options and direct use of it returns `tenant_actor_unavailable`.
Account deactivation remains global and continues to revoke sessions.

## Session failure behavior

The browser revalidates the authenticated session when a protected route changes,
when the window regains focus, and when the document becomes visible. This ensures
that administrative account deactivation takes effect even when the current page
has no uncached domain request to trigger a server check.

Any protected API response with HTTP 401 clears browser authentication state and
redirects protected routes to `/login`. Expired sessions display an expiration
message, and a deactivated Authentication Account is rejected globally. A
tenant Actor becoming inactive is different: the Account session remains valid,
the tenant is removed from the Account's active tenant options, and direct use
of that tenant returns `403 tenant_actor_unavailable`. The server clears rejected
or revoked Account-session cookies; HTTP-only cookies remain the only browser
authentication credential.

## Password workflows

- `/password/change` requires an authenticated session and the current password.
  A successful change revokes all sessions and requires a fresh login.
- `/password/reset` accepts a one-time token issued by an authorized
  administrator and a new password. Application Administrators may issue a token
  directly for an Account. A Tenant Administrator may issue one only through a
  Person who has an ACTIVE Membership and enabled Account-bound tenant Actor in
  the selected Tenant. Because credentials belong to the global Authentication
  Account, completing either kind of reset changes the password for all Tenant
  access owned by that Account. A successful reset revokes all existing
  sessions, reloads the target account, verifies that its persisted bcrypt hash
  matches the submitted replacement password, and returns the authoritative
  account ID, normalized login, and password-change timestamp. The browser
  clears identity-bound query and authentication state, returns to `/login`, and
  prefills that authoritative login before the replacement password creates a
  fresh session.
- `/admin/authentication` lets an Application Administrator create accounts,
  activate/deactivate accounts, and issue one-time reset tokens. Deactivation
  revokes every existing session and pending reset token immediately. New login
  attempts remain rejected until the account is reactivated. Raw reset tokens
  are shown once and are never persisted by the frontend. Reset-token responses
  identify the exact account ID and login; the administration page clears any
  previously displayed token before requesting another one. Reset-token
  eligibility belongs to the target Authentication Account, not to the
  administrator's session or the Account's tenant Actors: an inactive target
  Account produces a validation error without clearing the Application
  Administrator cookie, while an active Account remains eligible even when all
  of its tenant Actors are inactive.

## Local and automated testing

Local browser development uses session authentication by default. The old Vite
bootstrap actor proxy is opt-in through `ERS_LOCAL_AUTHZ_BOOTSTRAP=true` and is
reserved for recovery.

A genuinely cookie-less browser context must open protected ERS routes at
`/login`; it cannot inherit an authenticated session from another browser
context. Browser private/incognito windows, however, normally share one private
browsing cookie jar with every other private/incognito window that is still
open. Opening a second private window therefore does **not** guarantee a fresh
session. For manual authentication tests that require an anonymous browser,
close every private/incognito window before opening a new one, or use a separate
browser profile whose storage is known to be empty. In Developer Tools,
`GET /api/v1/auth/session` should return HTTP 401 in that fresh context before
login.

Playwright now provisions and logs in a dedicated `e2e-application-admin`
account locally and in CI. `globalSetup` creates a bootstrap administrator
session whose storage state may be reused for ordinary read/write application
tests. Tests that exercise logout, deactivation, password replacement, or other
authentication-session lifecycle behavior must create a separate cookie-less
browser context and sign in explicitly; they must not revoke or mutate the
bootstrap administrator session. CI remains serialized for deterministic
promotion runs, while local session-mode runs may use Playwright's normal worker
count. Header mode remains available only when explicitly requested for
isolated authorization compatibility tests. Automated coverage also runs the
globally authenticated administrator context alongside a separate cookie-less
context and verifies that the latter receives HTTP 401 from `/auth/session` and
is redirected to `/login`.

## Tenant-scoped pricing administration

Price List Items and Gold Prices use the tenant selected by the authenticated
session. Listing, creation, revision history, activation changes, duplicate-code
checks, Gold Price replacement by date, and latest-price lookup are all scoped
to that tenant. The same price-list code or Gold Price date may exist in two
different tenants, while an item or price identifier from another tenant is
reported as not found.

### Permission-aware post-login landing

A successful login without a safe `returnTo` target opens the first navigation route permitted by the resolved tenant Actor when a tenant workspace is available. Application and Tenant Administrators land on People. Earnings and Expense Operators land on Collaborators because those roles do not receive `people.read`. When an ordinary Authentication Account has no usable Tenant Actor, the shell remains authenticated and renders Account-level Person self-service instead of forcing the user into Change password.

The login flow never reuses `/login`, `/forbidden`, or `/password/reset` as a post-login return target. This prevents a Forbidden page reached by one account from becoming the landing page for the next account after sign-out.

### Password-change identity transition

Completing a required password change revokes the temporary session and clears all
identity-bound frontend query data before returning to sign-in. After authenticating
with the new password, tenant options and the effective authorization actor are
loaded under query keys that include the authentication account ID. The client also
normalizes both the current tenant-option array response and the compatible
`{ items: [...] }` response shape so malformed or stale cached data cannot crash the
workspace with an `options.some is not a function` rendering error.

### Authentication Account and tenant workspace independence

An ordinary Authentication Account represents the global Person and may remain
ACTIVE independently of its Tenant Actors. Tenant options are derived from the
Account's active TENANT Actor bindings backed by ACTIVE same-tenant
Person–Tenant Memberships; delegated Role Grants are not required merely for
intrinsic Person self-service.

If all Tenant Actors or Memberships become unavailable, authentication still
succeeds. The browser renders **Your personal information is still available**
with the message, “You currently do not have access to work or administrative
features. You can still view your personal information and read-only Current
Account history below.” It continues to provide Account-level **My Person** and
read-only **My Current Account** self-service.
This fallback derives the Person only from `auth_account_people`, does not
borrow or synthesize an Actor, and does not grant tenant administration,
operator, collaboration, or other tenant-scoped capabilities. Restoring an
eligible Tenant Actor restores the normal tenant workspace without creating a
new Authentication Account or Session.
