# Production Go-Live Checklist

This checklist is the production readiness gate for ERS audit and approval hardening.

It is intentionally operational. Each item should be checked in `dev`, then `tst`, then `prd`, using the normal promotion flow. Do not skip `tst` verification unless an emergency rollback/fix-forward decision is explicitly made.

## Scope

Bite 19F validates that the Bite 19 hardening work is ready for production use:

- Bite 19A — structured correction reasons for sensitive operations
- Bite 19B — immutable audit hardening
- Bite 19C — recent reauthentication requirement
- Bite 19D / 19D.2 — optional and configurable second-person approval
- Receipt-status and receipt-backfill enforcement already present in the current-account workflows

This checklist does not introduce application behavior by itself. It records the manual and automated checks required before production go-live.

## Environments

Use the standard ERS environment order:

1. Local development
2. Development server
3. Test server
4. Production server

Expected public health endpoints:

```bash
curl -i https://dev.enterpriseremotesystems.com/api/v1/healthz
curl -i https://tst.enterpriseremotesystems.com/api/v1/healthz
curl -i https://app.enterpriseremotesystems.com/api/v1/healthz
```

Expected response: HTTP `200`.

## Required local checks before promotion

Run from the project root:

```bash
git status
git diff --check
go clean -testcache
go test ./...
```

If frontend files changed in the same promotion, also run the current frontend checks:

```bash
cd frontend
npm install
npm run lint
npm run test:e2e
```

For Bite 19F itself, the expected change is documentation only.

## Migration verification

Confirm all Bite 19 migrations applied successfully in each promoted environment.

Expected Bite 19 migrations include, at minimum:

```text
000022_add_structured_correction_reasons.up.sql
000023_enforce_immutable_authz_audit_logs.up.sql
000024_add_second_person_approval_metadata.up.sql
000025_configurable_second_person_approval.up.sql
```

For each environment, inspect the backend deployment logs and confirm:

- migration runner started normally
- each Bite 19 migration was detected or confirmed as already applied
- no migration returned an error
- backend started successfully after migrations
- `/api/v1/healthz` returned HTTP `200`

## Database-hardening verification

### Immutable audit logs

Audit logs must be append-only.

In a non-production environment first, verify that direct mutation attempts against `authz_audit_logs` are blocked:

```sql
UPDATE authz_audit_logs
SET decision = 'tampered'
WHERE id = '<existing-audit-log-id>';
```

Expected result: update rejected by database trigger.

Then verify delete is blocked:

```sql
DELETE FROM authz_audit_logs
WHERE id = '<existing-audit-log-id>';
```

Expected result: delete rejected by database trigger.

Finally confirm the original row remains unchanged.

Do not run destructive verification directly in production unless it is an explicitly approved operational test against a known safe audit row.

### Structured correction reason columns

Confirm the current-account ledger schema includes structured reason columns used by Bite 19A:

```text
correction_reason_code
correction_reason_text
```

Confirm journey settlement metadata includes the second-person approval and reason metadata columns introduced during Bite 19:

```text
reason_code
reason_text
second_approved_by
second_approved_at
second_approval_notes
```

Column names should match the final schema in the repository migrations.

## Authentication and authorization checks

For deployed smoke testing, log in through `/api/v1/auth/login`, retain the returned HTTP-only session cookie, and send the intended tenant ID as the tenant-selection hint. Do not send `X-Actor-ID`; deployed environments must use `AUTHZ_ACTOR_HEADER_MODE=disabled`.

Expected protected-endpoint behavior:

- missing or expired session is rejected with `authentication_required`
- missing tenant selection is rejected with `tenant_selection_required`
- a tenant outside the session actor's persisted grants is rejected
- an authorized session actor succeeds
- actor-spoofing headers do not change a valid session identity
- denied attempts are audited when the operation reaches the authorization/audit path

## Second-person approval policy checks

### Read policy

Run in dev first:

```bash
curl -i \
  "${ADMIN_HEADERS[@]}" \
  "$BASE_URL/api/v1/current-accounts/settings/second-person-approval"
```

Expected response: HTTP `200`.

Expected body shape:

```json
{
  "data": {
    "tenantId": "default",
    "required": false
  }
}
```

The exact `required` value may differ if the environment was intentionally configured.

### Enable policy in dev or tst only

```bash
curl -i \
  -X PUT \
  "${ADMIN_HEADERS[@]}" \
  -d '{"required":true}' \
  "$BASE_URL/api/v1/current-accounts/settings/second-person-approval"
```

Expected response: HTTP `200` with `required: true`.

### Verify required policy blocks missing second approval

Using a safe dev or tst sensitive operation payload, include the required Bite 19A reason fields but omit `secondApproval`.

Expected result:

- operation rejected
- error indicates second-person approval is required
- no ledger mutation is committed
- denial is auditable if the request reaches the authorization/audit path

### Verify valid second approval succeeds

Using a separate safe dev or tst payload, include a second approver different from the primary actor:

```json
{
  "reasonCode": "GO_LIVE_SMOKE_TEST",
  "reasonText": "Go-live smoke test for second-person approval.",
  "secondApproval": {
    "approvedBy": "second-admin@example.com",
    "notes": "Approved for controlled go-live smoke test."
  }
}
```

Expected result:

- operation succeeds
- ledger/correction metadata includes second approval where applicable
- audit metadata includes second approval where applicable

### Reset policy after smoke test

For dev or tst smoke tests, reset the setting to the intended environment default:

```bash
curl -i \
  -X PUT \
  "${ADMIN_HEADERS[@]}" \
  -d '{"required":false}' \
  "$BASE_URL/api/v1/current-accounts/settings/second-person-approval"
```

Do not change the production value without an explicit go-live decision.

## Recent reauthentication checks

Bite 19C requires recent reauthentication for sensitive operations.

Fresh reauthentication headers:

```bash
REAUTH_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

REAUTH_HEADERS=(
  -H "X-Reauthenticated-At: ${REAUTH_AT}"
  -H "X-Reauthentication-Method: password"
)
```

For a safe dev or tst sensitive operation, send the request with:

```bash
"${ADMIN_HEADERS[@]}" "${REAUTH_HEADERS[@]}"
```

Expected result when all other validations pass: operation is allowed.

Send the same safe operation shape without `X-Reauthenticated-At`.

Expected result:

```json
{
  "error": {
    "code": "recent_reauthentication_required",
    "message": "Recent reauthentication is required for this sensitive operation"
  }
}
