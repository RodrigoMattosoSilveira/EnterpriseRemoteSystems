# Bite 28D — Authentication and Tenant UX

## Purpose

Bite 28D exposes the Bite 28B/28C authentication and authorization foundations
through the browser. Protected application routes now require a verified HTTP
session and operate in an explicitly selected tenant granted to that session's
persisted actor.

## User journey

1. Unauthenticated users are redirected to `/login` with the requested route
   preserved as `returnTo`.
2. Successful login restores the requested route. Accounts marked
   `mustChangePassword` are sent to `/password/change` first.
3. The application shell shows the current user's display name and normalized
   login.
4. `GET /api/v1/auth/tenant-options` returns only active tenants covered by the
   actor's active grants. A global Application Administrator grant returns every
   active tenant.
5. The tenant control opens an in-page dropdown rather than the browser or
   operating system's native floating picker. Users can progressively narrow
   the available tenants by typing any part of the tenant name, code, or ID,
   then select with the mouse or with Arrow keys and Enter.
6. Changing tenants updates `ers.auth.selectedTenantId`, clears tenant-bound
   React Query state, and returns to the workspace landing page.
7. Logout revokes the server session, clears client authentication state, and
   returns to `/login`.

## Session failure behavior

The browser revalidates the authenticated session when a protected route changes,
when the window regains focus, and when the document becomes visible. This ensures
that administrative account deactivation takes effect even when the current page
has no uncached domain request to trigger a server check.

Any protected API response with HTTP 401 clears browser authentication state and
redirects protected routes to `/login`. Expired sessions display an expiration
message. Deactivated authentication accounts or authorization actors display an
inactive-account message. The server clears rejected or revoked session cookies;
HTTP-only cookies remain the only browser authentication credential.

## Password workflows

- `/password/change` requires an authenticated session and the current password.
  A successful change revokes all sessions and requires a fresh login.
- `/password/reset` accepts the one-time token issued by an Application
  Administrator and a new password. A successful reset revokes all existing
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
  eligibility belongs to the target account, not to the administrator's
  session: an inactive target account or actor produces a validation error
  without clearing the Application Administrator cookie, and the UI disables
  reset-token issuance for those rows.

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

A successful login without a safe `returnTo` target opens the first navigation route permitted by the actor's effective authorization context. Application and Tenant Administrators land on People. Earnings and Expense Operators land on Collaborators because those roles do not receive `people.read`. Actors without an operational navigation permission land on Change password.

The login flow never reuses `/login`, `/forbidden`, or `/password/reset` as a post-login return target. This prevents a Forbidden page reached by one account from becoming the landing page for the next account after sign-out.

### Password-change identity transition

Completing a required password change revokes the temporary session and clears all
identity-bound frontend query data before returning to sign-in. After authenticating
with the new password, tenant options and the effective authorization actor are
loaded under query keys that include the authentication account ID. The client also
normalizes both the current tenant-option array response and the compatible
`{ items: [...] }` response shape so malformed or stale cached data cannot crash the
workspace with an `options.some is not a function` rendering error.

### Authentication-account tenant-access prerequisite

An authentication account may be created only for an active authorization actor
that already has at least one effective active role grant for an active tenant.
The Authentication administration actor selector omits actors without usable
tenant access and labels each eligible actor with its active role and tenant
grants. Administrators must assign the actor's role grants in Authorization
before creating the login account.

The backend enforces the same invariant. A direct account-creation request for
an actor without effective tenant access returns `validation_failed` on
`actorId`; it cannot create an account that completes a forced password change
and then reaches the `No tenant access` workspace state. Revoking all grants
after account creation remains supported and intentionally produces the
controlled `No tenant access` state until an administrator restores a grant.
