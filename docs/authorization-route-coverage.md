# API Route Authorization Coverage

Bite 27A makes route authorization explicit for every `/api/v1` endpoint except the health check.

## Coverage rules

- Every registered API route must include `requirePermission`, an approved self-service guard, or the audited `authorizationHandledByHandler` marker.
- Sensitive current-account handlers keep ownership of their permission, tenant-scope, reauthentication, second-person approval, and authorization-audit checks. The explicit handler marker prevents a route-level guard from bypassing denied-operation audit logging.
- `/healthz` and `/api/v1/healthz` remain intentionally public for container and deployment health checks.
- A source-level regression test fails when a new route is registered without an approved route guard.

## Newly protected route groups

| Route group | Read permission | Write permission |
|---|---|---|
| `/api/v1/reference-data` | `reference_data.read` | `reference_data.manage` |
| `/api/v1/tenants/current` | `tenants.read` | Not applicable |
| `/api/v1/authz` | `authz.read` | `authz.manage` |
| `/api/v1/current-accounts` | Current-account summary, ledger, or settings permission matching the operation | Current-account settings permission matching the operation |
| `/api/v1/receipts` | `ledger.receipts.read` | `ledger.receipts.backfill` |
| `/api/v1/ledger-entries` | `ledger.receipts.read` | Receipt or ledger-correction permission matching the operation |
| Collaborator settlement actions | `journey.settlements.preview` for preview | Zero-gold, partial-payout, or close permission matching the operation |

## Operational role support

The authorization catalog grants `tenants.read` to earnings operators, expense operators, and person self-service actors. Earnings operators, expense operators, and person self-service actors also receive `reference_data.read`, allowing their existing workflows to continue after reference-data routes become protected. Reference-data mutation remains administrator-only through wildcard administrator permissions or an explicit `reference_data.manage` grant.
